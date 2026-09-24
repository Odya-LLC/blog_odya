import { dedupeSlug, slugifyUz } from '@blog-odya/shared'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { APIError, createLocalReq, type PayloadRequest, type Where } from 'payload'
import type { z } from 'zod'

import { CLAIM_LOCK_MS, type PostWorkflowStatus } from '@/collections/Posts/workflow'
import { takeScrapedItems } from '@/editorial/actions'
import { validateSlug } from '@/lib/slug'
import type { Post, ScrapedItem, Tag } from '@/payload-types'
import { inTransaction } from '@/scraping/itemState'
import { getTransliterator } from '@/translit/transliterator'

import type { McpContext } from './context'
import { cyrillicReport, lockedFields, previewMissingCyrillic } from './cyrillic'
import {
  lexicalToMarkdown,
  markdownToLexical,
  statsFromLexical,
  type MarkdownStats,
} from './markdown'
import { jsonResult, McpToolError, safeTool, textResult } from './result'
import {
  createDraftInput,
  postIdInput,
  saveRewriteInput,
  setSeoInput,
  submitForReviewInput,
} from './schemas'
import { relationId } from './tools'
import {
  checkRewriteFields,
  checkSeoFields,
  ngramSimilarity,
  seoScore,
  seoWarnings,
  similarityWarning,
  sourcesError,
  type Issue,
  type PostSeoState,
  type ValidationResult,
} from './validation'

/**
 * MCP yozish toollari (TZ §5.1, §5.3, §6.3, M2-07): `create_draft`, `claim_draft`, `release_draft`,
 * `save_rewrite`, `set_seo`, `preview_cyrillic`, `submit_for_review`. **Publish tool yo'q.**
 *
 * Qoidalar (TZ §4.1, §4.2):
 * - Barcha yozuvlar Local API orqali kalit egasi nomidan (`overrideAccess: false`), audit kanali —
 *   `mcp` + tool nomi. Workflow o'tishlari va claim qulfi — `posts` hook'lari (`enforceWorkflow`).
 * - Faqat `draft`/`in_progress` holatidagi va kalit egasiga biriktirilgan (`assignee`) postlar
 *   o'zgartiriladi; `published` va boshqa holatlar — rad etiladi.
 * - `save_rewrite`/`set_seo`: `rewrittenBy = ai_agent`, `aiDisclosure = true`; lock 2 soatga
 *   yangilanadi; qoralama (`draft`) bo'lsa — avtomatik `in_progress` ga olinadi (claim).
 * - Validatsiya xatolari saqlanmaydi va `{ ok, errors[], warnings[], seoScore }` bilan qaytadi.
 * - Faqat lotin (uz-Latn) yoziladi: kirill (uz-Cyrl) o'sha saqlashda `posts`/`tags` hook'i
 *   (`cyrlSyncPlugin`, `src/translit/cyrlSync.ts`) bilan yaratiladi — qulflar va `cyrlStale` ham.
 */

type Input<Shape extends z.ZodRawShape> = z.output<z.ZodObject<Shape>>

const LATN = 'uz-Latn' as const
const CYRL = 'uz-Cyrl' as const

/** MCP orqali o'zgartirish mumkin bo'lgan holatlar. */
export const MCP_EDITABLE_STATUSES = [
  'draft',
  'in_progress',
] as const satisfies readonly PostWorkflowStatus[]

export const WRITE_TOOL_NAMES = [
  'create_draft',
  'claim_draft',
  'release_draft',
  'save_rewrite',
  'set_seo',
  'preview_cyrillic',
  'submit_for_review',
] as const

// ---------------------------------------------------------------------------
// Yordamchilar
// ---------------------------------------------------------------------------

/** Tool uchun Local API so'rovi: kalit egasi, `mcp` kanali (tranzaksiya shu `req` da). */
async function mcpReq(ctx: McpContext, tool: string): Promise<PayloadRequest> {
  return createLocalReq(
    { user: ctx.user, context: { channel: 'mcp', mcpTool: tool }, locale: LATN },
    ctx.payload,
  )
}

/** Har bir Local API chaqiruvi uchun (locale har safar aniq — `req` umumiy). */
function op(ctx: McpContext, req: PayloadRequest, locale: typeof LATN | typeof CYRL = LATN) {
  return {
    req,
    user: ctx.user,
    overrideAccess: false as const,
    locale,
    fallbackLocale: false as const,
  }
}

function siteHost(ctx: McpContext): string | undefined {
  try {
    return new URL(ctx.siteUrl).hostname
  } catch {
    return undefined
  }
}

function adminUrl(ctx: McpContext, id: number): string {
  return new URL(`/admin/collections/posts/${id}`, ctx.siteUrl).toString()
}

async function loadPost(
  ctx: McpContext,
  req: PayloadRequest,
  id: number,
  locale: typeof LATN | typeof CYRL = LATN,
): Promise<Post> {
  const post = await ctx.payload.findByID({
    collection: 'posts',
    id,
    depth: 0,
    draft: true,
    disableErrors: true,
    ...op(ctx, req, locale),
  })
  if (!post) throw new McpToolError(`Post topilmadi: id=${id}`)
  return post
}

function isEditableStatus(status: string): boolean {
  return (MCP_EDITABLE_STATUSES as readonly string[]).includes(status)
}

function statusError(post: Post): McpToolError {
  const tail =
    post.workflowStatus === 'published'
      ? " Chop etilgan postni faqat muharrir admin panelda o'zgartiradi."
      : post.workflowStatus === 'review'
        ? ' Post tekshiruvda — muharrir qaytarsa (in_progress), qayta tahrirlash mumkin.'
        : ''
  return new McpToolError(
    `Post #${post.id} "${post.workflowStatus}" holatida — MCP orqali faqat draft yoki ` +
      `in_progress holatidagi postlarni o'zgartirish mumkin.${tail}`,
  )
}

/** Holat va egalik tekshiruvi: `draft`/`in_progress` va `assignee` = kalit egasi. */
export function assertEditable(post: Post, userId: number): void {
  if (!isEditableStatus(post.workflowStatus)) throw statusError(post)
  const assignee = relationId(post.assignee)
  if (assignee === userId) return
  if (assignee === null) {
    throw new McpToolError(
      `Post #${post.id} hech kimga biriktirilmagan — avval claim_draft(postId: ${post.id}) chaqiring.`,
    )
  }
  throw new McpToolError(
    `Post #${post.id} boshqa foydalanuvchiga (user #${assignee}) biriktirilgan — ` +
      "uni o'zgartirib bo'lmaydi. O'zingizga biriktirilgan qoralamalar: list_drafts(assignee: 'me').",
  )
}

/** Claim qulfi va holat: qoralama bo'lsa `in_progress` ga olinadi, lock 2 soatga yangilanadi. */
function lockData(userId: number): Partial<Post> {
  return {
    workflowStatus: 'in_progress',
    assignee: userId,
    lockedUntil: new Date(Date.now() + CLAIM_LOCK_MS).toISOString(),
  }
}

/** Payload/tahririyat xatolari → agent uchun tushunarli matn. */
function rethrow(error: unknown): never {
  if (error instanceof McpToolError) throw error
  if (error instanceof APIError && error.isPublic && error.status < 500) {
    const data = (error as APIError & { data?: { errors?: { path?: string; message?: string }[] } })
      .data
    const details = data?.errors?.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
    throw new McpToolError(details?.length ? details.join('; ') : error.message)
  }
  throw error
}

function metaOf(post: Post): { title: string; description: string; focusKeyword: string } {
  return {
    title: post.meta?.title ?? '',
    description: post.meta?.description ?? '',
    focusKeyword: post.meta?.focusKeyword ?? '',
  }
}

function seoState(post: Post, body: MarkdownStats | null, overrides: Partial<PostSeoState> = {}) {
  const meta = metaOf(post)
  const state: PostSeoState = {
    title: post.title ?? '',
    excerpt: post.excerpt ?? '',
    body,
    hasCategory: relationId(post.category) !== null,
    tagsCount: post.tags?.length ?? 0,
    seoTitle: meta.title,
    metaDescription: meta.description,
    focusKeyword: meta.focusKeyword,
    faqCount: post.faq?.length ?? 0,
    coverAlt: post.coverAlt ?? '',
    sourcesCount: post.sources?.length ?? 0,
    ...overrides,
  }
  return state
}

/** Post manbalarining matni (n-gram o'xshashlik uchun). */
async function sourceText(ctx: McpContext, req: PayloadRequest, post: Post): Promise<string> {
  const ids = (post.sources ?? [])
    .map((source) => relationId(source.scrapedItem))
    .filter((id): id is number => id !== null)
  if (!ids.length) return ''
  const { docs } = await ctx.payload.find({
    collection: 'scraped-items',
    where: { id: { in: ids } },
    depth: 0,
    pagination: false,
    select: { title: true, excerpt: true, extractedText: true },
    ...op(ctx, req),
  })
  return (docs as ScrapedItem[])
    .map((item) => [item.title, item.excerpt, item.extractedText].filter(Boolean).join('\n'))
    .join('\n\n')
}

function result(data: ValidationResult & Record<string, unknown>): CallToolResult {
  return { ...jsonResult(data), ...(data.ok ? {} : { isError: true }) }
}

function cyrillicWarning(skipped: string[]): Issue[] {
  return skipped.length
    ? [
        {
          field: 'cyrillic',
          code: 'cyrillic_locked',
          message:
            `Kirill versiyasida muharrir qo'lda tuzatgan maydonlar yangilanmadi: ${skipped.join(', ')}. ` +
            'Post "kirill eskirgan" deb belgilandi — notesForEditor da eslatib o\'ting.',
        },
      ]
    : []
}

// ---------------------------------------------------------------------------
// create_draft
// ---------------------------------------------------------------------------

async function resolveCategory(
  ctx: McpContext,
  req: PayloadRequest,
  value: number | string,
): Promise<number | null> {
  const where: Where =
    typeof value === 'number' ? { id: { equals: value } } : { slug: { equals: value } }
  const { docs } = await ctx.payload.find({
    collection: 'categories',
    where,
    limit: 1,
    depth: 0,
    pagination: false,
    select: {},
    ...op(ctx, req),
  })
  return relationId(docs[0])
}

export async function createDraft(
  ctx: McpContext,
  input: Input<typeof createDraftInput>,
): Promise<CallToolResult> {
  const req = await mcpReq(ctx, 'create_draft')
  let categoryId: number | null = null
  if (input.category !== undefined) {
    categoryId = await resolveCategory(ctx, req, input.category)
    if (categoryId === null) throw new McpToolError(`Kategoriya topilmadi: "${input.category}"`)
  }
  const taken = await takeScrapedItems(req, { ids: input.scrapedItemIds, categoryId }).catch(
    rethrow,
  )
  const post = await loadPost(ctx, req, taken.post.id)
  return jsonResult({
    created: taken.created,
    post: {
      id: post.id,
      title: post.title,
      slug: post.slug,
      workflowStatus: post.workflowStatus,
      category: relationId(post.category),
      assignee: relationId(post.assignee),
      sources: (post.sources ?? []).map((source) => ({
        scrapedItem: relationId(source.scrapedItem),
        name: source.name ?? null,
        url: source.url,
      })),
    },
    items: taken.items.map((item) => ({ id: item.id, status: item.status })),
    adminUrl: adminUrl(ctx, post.id),
    next: taken.created
      ? `claim_draft(postId: ${post.id}) → get_source → save_rewrite → set_seo → submit_for_review`
      : `Element allaqachon qoralamaga olingan (post #${post.id}, ${post.workflowStatus}). ` +
        'O‘zingizga biriktirilgan bo‘lsa — claim_draft bilan davom eting.',
  })
}

// ---------------------------------------------------------------------------
// claim_draft / release_draft
// ---------------------------------------------------------------------------

function postSummary(ctx: McpContext, post: Post) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    workflowStatus: post.workflowStatus,
    assignee: relationId(post.assignee),
    lockedUntil: post.lockedUntil ?? null,
    adminUrl: adminUrl(ctx, post.id),
  }
}

export async function claimDraft(
  ctx: McpContext,
  input: Input<typeof postIdInput>,
): Promise<CallToolResult> {
  const req = await mcpReq(ctx, 'claim_draft')
  const post = await loadPost(ctx, req, input.postId)
  if (!isEditableStatus(post.workflowStatus)) throw statusError(post)
  const me = ctx.user.id
  const assignee = relationId(post.assignee)
  const lockedUntil = post.lockedUntil ? new Date(post.lockedUntil).getTime() : 0
  if (assignee !== null && assignee !== me) {
    if (post.workflowStatus === 'draft') {
      throw new McpToolError(
        `Qoralama #${post.id} boshqa muharrirga (user #${assignee}) biriktirilgan — ` +
          "uni olib bo'lmaydi. Bo'sh qoralamalar: list_drafts(assignee: 'unassigned').",
      )
    }
    if (lockedUntil > Date.now()) {
      throw new McpToolError(
        `Post #${post.id} boshqa foydalanuvchi tomonidan band qilingan ` +
          `(${new Date(lockedUntil).toISOString()} gacha).`,
      )
    }
  }
  const updated = await ctx.payload
    .update({
      collection: 'posts',
      id: post.id,
      data: lockData(me),
      depth: 0,
      ...op(ctx, req),
    })
    .catch(rethrow)
  return jsonResult({
    post: postSummary(ctx, updated),
    sources: (updated.sources ?? []).map((source) => ({
      scrapedItem: relationId(source.scrapedItem),
      name: source.name ?? null,
      url: source.url,
    })),
    note:
      'Post sizga 2 soatga biriktirildi (har saqlashda muddat yangilanadi). Manba matni — ' +
      'get_source(id: scrapedItem). Tugatolmasangiz — release_draft.',
  })
}

export async function releaseDraft(
  ctx: McpContext,
  input: Input<typeof postIdInput>,
): Promise<CallToolResult> {
  const req = await mcpReq(ctx, 'release_draft')
  const post = await loadPost(ctx, req, input.postId)
  assertEditable(post, ctx.user.id)
  const updated = await ctx.payload
    .update({
      collection: 'posts',
      id: post.id,
      data: { assignee: null, lockedUntil: null },
      depth: 0,
      ...op(ctx, req),
    })
    .catch(rethrow)
  return jsonResult({
    post: postSummary(ctx, updated),
    note: "Qulf bo'shatildi — endi boshqa muharrir yoki agent claim_draft bilan olishi mumkin.",
  })
}

// ---------------------------------------------------------------------------
// save_rewrite
// ---------------------------------------------------------------------------

interface TagPlan {
  id?: number
  name: string
  slug?: string
  create: boolean
}

async function planTags(
  ctx: McpContext,
  req: PayloadRequest,
  values: (number | string)[],
  errors: Issue[],
): Promise<TagPlan[]> {
  const plans: TagPlan[] = []
  const seen = new Set<string>()
  for (const [index, value] of values.entries()) {
    if (typeof value === 'number') {
      const { docs } = await ctx.payload.find({
        collection: 'tags',
        where: { id: { equals: value } },
        limit: 1,
        depth: 0,
        pagination: false,
        ...op(ctx, req),
      })
      const tag = docs[0] as Tag | undefined
      if (!tag) {
        errors.push({
          field: `tags[${index}]`,
          code: 'not_found',
          message: `Teg topilmadi: id=${value}`,
        })
        continue
      }
      if (seen.has(`id:${tag.id}`)) continue
      seen.add(`id:${tag.id}`)
      plans.push({ id: tag.id, name: tag.name, slug: tag.slug, create: false })
      continue
    }
    const name = value.trim()
    const slug = slugifyUz(name, { removeStopWords: false })
    const { docs } = await ctx.payload.find({
      collection: 'tags',
      where: {
        or: [
          ...(slug ? [{ slug: { equals: slug } }] : []),
          { name: { equals: name } },
          { 'synonyms.value': { equals: name } },
        ],
      },
      limit: 1,
      depth: 0,
      pagination: false,
      ...op(ctx, req),
    })
    const existing = docs[0] as Tag | undefined
    const key = existing ? `id:${existing.id}` : `new:${slug || name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    plans.push(
      existing
        ? { id: existing.id, name: existing.name, slug: existing.slug, create: false }
        : { name, create: true },
    )
  }
  return plans
}

async function createTag(ctx: McpContext, req: PayloadRequest, name: string): Promise<Tag> {
  const base = slugifyUz(name, { removeStopWords: false }) || 'teg'
  const slug = await dedupeSlug(base, async (candidate) => {
    const { totalDocs } = await ctx.payload.count({
      collection: 'tags',
      where: { slug: { equals: candidate } },
      ...op(ctx, req),
    })
    return totalDocs > 0
  })
  const tag = await ctx.payload.create({
    collection: 'tags',
    data: { name, slug },
    depth: 0,
    ...op(ctx, req),
  })
  // Kirill nomi — `tags` hook'i (cyrlSyncPlugin) o'sha saqlashda yozadi.
  return tag
}

/** Sarlavhadan slug (slugify-uz), boshqa postlar bilan to'qnashmasin (TZ §5.3). */
async function uniquePostSlug(
  ctx: McpContext,
  req: PayloadRequest,
  post: Post,
  title: string,
): Promise<{ slug: string; deduped: boolean }> {
  const base = slugifyUz(title) || post.slug
  const slug = await dedupeSlug(base, async (candidate) => {
    const { totalDocs } = await ctx.payload.count({
      collection: 'posts',
      where: { and: [{ slug: { equals: candidate } }, { id: { not_equals: post.id } }] },
      ...op(ctx, req),
    })
    return totalDocs > 0
  })
  if (validateSlug(slug) !== true) return { slug: post.slug, deduped: false }
  return { slug, deduped: slug !== base }
}

export async function saveRewrite(
  ctx: McpContext,
  input: Input<typeof saveRewriteInput>,
): Promise<CallToolResult> {
  const req = await mcpReq(ctx, 'save_rewrite')
  const post = await loadPost(ctx, req, input.postId)
  assertEditable(post, ctx.user.id)

  const title = input.title.trim()
  const excerpt = input.excerpt.trim()
  const converted = markdownToLexical(input.body, { siteHost: siteHost(ctx) })
  const tagNames = input.tags.filter((tag): tag is string => typeof tag === 'string')

  const checks = checkRewriteFields({ title, excerpt, body: converted.stats, tags: tagNames })
  const errors: Issue[] = [
    ...checks.errors,
    ...converted.errors.map((issue) => ({ field: 'body', ...issue })),
  ]
  const warnings: Issue[] = [
    ...checks.warnings,
    ...converted.warnings.map((issue) => ({ field: 'body', ...issue })),
  ]

  const categoryId = await resolveCategory(ctx, req, input.category)
  if (categoryId === null) {
    errors.push({
      field: 'category',
      code: 'not_found',
      message: `Kategoriya topilmadi: "${input.category}" — list_categories dan slug yoki ID oling.`,
    })
  }
  const tags = await planTags(ctx, req, input.tags, errors)
  const noSources = sourcesError(post.sources?.length ?? 0)
  if (noSources) errors.push(noSources)

  const similarity = ngramSimilarity(converted.stats.plainText, await sourceText(ctx, req, post))
  const similar = similarityWarning(similarity)
  if (similar) warnings.push(similar)

  const state = seoState(post, converted.stats, {
    title,
    excerpt,
    hasCategory: categoryId !== null,
    tagsCount: tags.length,
  })
  warnings.push(...seoWarnings(state, 'rewrite'))
  const score = seoScore(state)

  if (errors.length) {
    return result({ ok: false, errors, warnings, seoScore: score, saved: false })
  }

  const { slug, deduped } = await uniquePostSlug(ctx, req, post, title)
  if (deduped) {
    warnings.push({
      field: 'slug',
      code: 'slug_deduped',
      message: `"${slugifyUz(title)}" slug'i band — "${slug}" ishlatildi.`,
    })
  }

  const locked = lockedFields(post)
  const saved = await inTransaction(req, async () => {
    const tagIds: number[] = []
    const createdTags: Tag[] = []
    for (const plan of tags) {
      if (plan.id !== undefined) {
        tagIds.push(plan.id)
        continue
      }
      const tag = await createTag(ctx, req, plan.name)
      createdTags.push(tag)
      tagIds.push(tag.id)
    }
    const updated = await ctx.payload.update({
      collection: 'posts',
      id: post.id,
      data: {
        ...lockData(ctx.user.id),
        title,
        excerpt,
        content: converted.state as unknown as Post['content'],
        category: categoryId as number,
        tags: tagIds,
        slug,
        rewrittenBy: 'ai_agent',
        aiDisclosure: true,
      },
      depth: 0,
      ...op(ctx, req),
    })
    const cyrillic = cyrillicReport(['title', 'excerpt', 'content'], locked)
    return { updated, createdTags, tagIds, cyrillic }
  }).catch(rethrow)

  warnings.push(...cyrillicWarning(saved.cyrillic.skipped))
  return result({
    ok: true,
    errors: [],
    warnings,
    seoScore: score,
    saved: true,
    post: {
      ...postSummary(ctx, saved.updated),
      readingTime: saved.updated.readingTime ?? null,
      words: converted.stats.words,
    },
    tags: tags.map((plan, index) => ({
      id: saved.tagIds[index],
      name: plan.name,
      created: plan.create,
    })),
    similarity: {
      containment: Math.round(similarity.containment * 100) / 100,
      longestRun: similarity.longestRun,
    },
    cyrillic: saved.cyrillic,
    next: 'set_seo (agar hali qilinmagan bo‘lsa) → preview_cyrillic (ixtiyoriy) → submit_for_review',
  })
}

// ---------------------------------------------------------------------------
// set_seo
// ---------------------------------------------------------------------------

export async function setSeo(
  ctx: McpContext,
  input: Input<typeof setSeoInput>,
): Promise<CallToolResult> {
  const req = await mcpReq(ctx, 'set_seo')
  const post = await loadPost(ctx, req, input.postId)
  assertEditable(post, ctx.user.id)

  const seo = {
    seoTitle: input.seoTitle.trim(),
    metaDescription: input.metaDescription.trim(),
    focusKeyword: input.focusKeyword.trim(),
    faq: input.faq?.map((item) => ({
      question: item.question.trim(),
      answer: item.answer.trim(),
    })),
    coverAlt: input.coverAlt?.trim(),
  }
  const checks = checkSeoFields(seo)
  const errors: Issue[] = [...checks.errors]
  const warnings: Issue[] = [...checks.warnings]
  const noSources = sourcesError(post.sources?.length ?? 0)
  if (noSources) errors.push(noSources)

  const body = post.content ? statsFromLexical(post.content, { siteHost: siteHost(ctx) }) : null
  const state = seoState(post, body, {
    seoTitle: seo.seoTitle,
    metaDescription: seo.metaDescription,
    focusKeyword: seo.focusKeyword,
    ...(seo.faq ? { faqCount: seo.faq.length } : {}),
    ...(seo.coverAlt !== undefined ? { coverAlt: seo.coverAlt } : {}),
  })
  warnings.push(...seoWarnings(state, 'all'))
  if (!body?.words) {
    warnings.push({
      field: 'body',
      code: 'body_missing',
      message: 'Matn hali yozilmagan — save_rewrite chaqiring (keyword tekshiruvlari to‘liq emas).',
    })
  }
  const score = seoScore(state)
  if (errors.length) {
    return result({ ok: false, errors, warnings, seoScore: score, saved: false })
  }

  const meta = {
    title: seo.seoTitle,
    description: seo.metaDescription,
    focusKeyword: seo.focusKeyword,
  }
  const saved = await inTransaction(req, async () => {
    const updated = await ctx.payload.update({
      collection: 'posts',
      id: post.id,
      data: {
        ...lockData(ctx.user.id),
        meta: { ...post.meta, ...meta },
        ...(seo.faq ? { faq: seo.faq } : {}),
        ...(seo.coverAlt !== undefined ? { coverAlt: seo.coverAlt } : {}),
        rewrittenBy: 'ai_agent',
        aiDisclosure: true,
      },
      depth: 0,
      ...op(ctx, req),
    })
    const cyrillic = cyrillicReport(
      [
        'meta',
        ...(seo.faq ? (['faq'] as const) : []),
        ...(seo.coverAlt !== undefined ? (['coverAlt'] as const) : []),
      ],
      lockedFields(post),
    )
    return { updated, cyrillic }
  }).catch(rethrow)

  warnings.push(...cyrillicWarning(saved.cyrillic.skipped))
  return result({
    ok: true,
    errors: [],
    warnings,
    seoScore: score,
    saved: true,
    post: postSummary(ctx, saved.updated),
    cyrillic: saved.cyrillic,
    next: 'preview_cyrillic (ixtiyoriy) → submit_for_review(postId, notesForEditor)',
  })
}

// ---------------------------------------------------------------------------
// preview_cyrillic
// ---------------------------------------------------------------------------

export async function previewCyrillic(
  ctx: McpContext,
  input: Input<typeof postIdInput>,
): Promise<CallToolResult> {
  const req = await mcpReq(ctx, 'preview_cyrillic')
  const latin = await loadPost(ctx, req, input.postId)
  const stored = await loadPost(ctx, req, input.postId, CYRL)
  // Saqlanmagan maydonlar — lotindan hozir yaratiladi (saqlanmaydi).
  const generated = previewMissingCyrillic(
    {
      title: stored.title ? undefined : latin.title,
      excerpt: stored.excerpt ? undefined : latin.excerpt,
      content: stored.content ? undefined : latin.content,
    },
    await getTransliterator(ctx.payload),
  )
  const title = (generated.title as string | undefined) ?? stored.title ?? ''
  const excerpt = (generated.excerpt as string | undefined) ?? stored.excerpt ?? ''
  const content = generated.content ?? stored.content
  const meta = stored.meta ?? {}
  const faq = stored.faq ?? []

  const parts = [`# ${title}`]
  if (excerpt) parts.push(excerpt)
  const body = lexicalToMarkdown(content)
  if (body) parts.push(body)
  if (meta.title || meta.description || meta.focusKeyword) {
    parts.push(
      [
        '---',
        `SEO sarlavha: ${meta.title ?? '—'}`,
        `Meta description: ${meta.description ?? '—'}`,
        `Focus keyword: ${meta.focusKeyword ?? '—'}`,
      ].join('\n'),
    )
  }
  if (faq.length) {
    parts.push(['FAQ:', ...faq.map((item) => `- ${item.question}\n  ${item.answer}`)].join('\n'))
  }
  if (stored.coverAlt) parts.push(`Muqova alt: ${stored.coverAlt}`)

  return textResult(
    JSON.stringify(
      {
        postId: latin.id,
        workflowStatus: latin.workflowStatus,
        locale: CYRL,
        generatedNow: Object.keys(generated),
        cyrlLocked: [...lockedFields(latin)],
        cyrlStale: latin.cyrlStale ?? false,
        note:
          'Kirill versiyasi lotindan avtomatik yaratiladi — agent uni tahrirlamaydi. Xato ' +
          "ko'rsangiz (masalan, brend nomi o'girilgan), notesForEditor da ko'rsating.",
      },
      null,
      2,
    ),
    parts.join('\n\n'),
  )
}

// ---------------------------------------------------------------------------
// submit_for_review
// ---------------------------------------------------------------------------

export async function submitForReview(
  ctx: McpContext,
  input: Input<typeof submitForReviewInput>,
): Promise<CallToolResult> {
  const req = await mcpReq(ctx, 'submit_for_review')
  const post = await loadPost(ctx, req, input.postId)
  assertEditable(post, ctx.user.id)

  const body = post.content ? statsFromLexical(post.content, { siteHost: siteHost(ctx) }) : null
  const errors: Issue[] = []
  const warnings: Issue[] = []
  if (!body?.words) {
    errors.push({
      field: 'body',
      code: 'body_missing',
      message: 'Matn yozilmagan — avval save_rewrite chaqiring.',
    })
  }
  const rewrite = checkRewriteFields({
    title: post.title ?? '',
    excerpt: post.excerpt ?? '',
    body: body ?? statsFromLexical(null),
    tags: [],
  })
  errors.push(...rewrite.errors.filter((issue) => issue.field !== 'body' || body?.words))
  const meta = metaOf(post)
  if (!meta.title || !meta.description || !meta.focusKeyword) {
    errors.push({
      field: 'seo',
      code: 'seo_missing',
      message:
        'SEO maydonlari (seoTitle, metaDescription, focusKeyword) yozilmagan — avval set_seo chaqiring.',
    })
  } else {
    const seoCheck = checkSeoFields({
      seoTitle: meta.title,
      metaDescription: meta.description,
      focusKeyword: meta.focusKeyword,
      faq: (post.faq ?? []).map((item) => ({ question: item.question, answer: item.answer })),
      coverAlt: post.coverAlt ?? undefined,
    })
    errors.push(...seoCheck.errors)
  }
  const noSources = sourcesError(post.sources?.length ?? 0)
  if (noSources) errors.push(noSources)
  if (post.rewrittenBy !== 'ai_agent') {
    warnings.push({
      field: 'rewrittenBy',
      code: 'not_rewritten',
      message: "Post MCP orqali qayta yozilmagan (save_rewrite chaqirilmagan) — tekshirib ko'ring.",
    })
  }
  const state = seoState(post, body)
  warnings.push(...seoWarnings(state, 'all'))
  const score = seoScore(state)
  if (errors.length) {
    return result({ ok: false, errors, warnings, seoScore: score, submitted: false })
  }

  const notes = input.notesForEditor?.trim()
  const updated = await inTransaction(req, async () => {
    if (post.workflowStatus === 'draft') {
      await ctx.payload.update({
        collection: 'posts',
        id: post.id,
        data: lockData(ctx.user.id),
        depth: 0,
        ...op(ctx, req),
      })
    }
    return ctx.payload.update({
      collection: 'posts',
      id: post.id,
      data: {
        workflowStatus: 'review',
        ...(notes !== undefined ? { notesForEditor: notes || null } : {}),
      },
      depth: 0,
      ...op(ctx, req),
    })
  }).catch(rethrow)

  return result({
    ok: true,
    errors: [],
    warnings,
    seoScore: score,
    submitted: true,
    post: postSummary(ctx, updated),
    reviewUrl: new URL('/admin/review', ctx.siteUrl).toString(),
    note: "Post tekshiruvga yuborildi. Chop etishni muharrir bajaradi (MCP'da publish yo'q).",
  })
}

// ---------------------------------------------------------------------------
// Ro'yxatga olish
// ---------------------------------------------------------------------------

const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const

export function registerWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'create_draft',
    {
      title: 'Qoralama yaratish',
      description:
        "Yig'ilgan element(lar)dan post qoralamasi (holat: draft, sizga biriktiriladi). " +
        'Atributsiya (sources) avtomatik. Birinchi ID — asosiy manba, qolganlari (shu klasterdan) — ' +
        "qo'shimcha. Element allaqachon olingan bo'lsa — mavjud post qaytadi.",
      inputSchema: createDraftInput,
      annotations: { ...WRITE, idempotentHint: true },
    },
    safeTool('create_draft', (input) => createDraft(ctx, input)),
  )

  server.registerTool(
    'claim_draft',
    {
      title: 'Qoralamani olish (lock)',
      description:
        "Postni in_progress holatiga o'tkazadi va sizga 2 soatga band qiladi (lock). Faqat draft/" +
        "in_progress holatidagi, bo'sh yoki sizga biriktirilgan (yoki qulfi tugagan) postlar.",
      inputSchema: postIdInput,
      annotations: { ...WRITE, idempotentHint: true },
    },
    safeTool('claim_draft', (input) => claimDraft(ctx, input)),
  )

  server.registerTool(
    'release_draft',
    {
      title: "Qulfni bo'shatish",
      description:
        "Postdan voz kechish: biriktirish va lock olib tashlanadi (holat o'zgarmaydi), boshqalar " +
        'claim_draft bilan olishi mumkin.',
      inputSchema: postIdInput,
      annotations: { ...WRITE, idempotentHint: true },
    },
    safeTool('release_draft', (input) => releaseDraft(ctx, input)),
  )

  server.registerTool(
    'save_rewrite',
    {
      title: 'Qayta yozilgan matnni saqlash',
      description:
        'Lotin: title, excerpt, body (Markdown → Lexical), category, tags (yangi teg yaratiladi). ' +
        "Server tekshiruvlari: kirill harflari yo'q, uzunliklar, havolalar xavfsizligi, sources, " +
        "manba bilan o'xshashlik. Javob: { ok, errors[], warnings[], seoScore } — ok: false " +
        "bo'lsa saqlanmaydi, xatolarni tuzatib qayta yuboring. Kirill — avtomatik.",
      inputSchema: saveRewriteInput,
      annotations: { ...WRITE, idempotentHint: true },
    },
    safeTool('save_rewrite', (input) => saveRewrite(ctx, input)),
  )

  server.registerTool(
    'set_seo',
    {
      title: 'SEO maydonlari',
      description:
        "seoTitle (≤ 60), metaDescription (140–160), focusKeyword (1–4 so'z), faq (0 yoki 2–4), " +
        'coverAlt. Javob: { ok, errors[], warnings[], seoScore }. Kirill — avtomatik.',
      inputSchema: setSeoInput,
      annotations: { ...WRITE, idempotentHint: true },
    },
    safeTool('set_seo', (input) => setSeo(ctx, input)),
  )

  server.registerTool(
    'preview_cyrillic',
    {
      title: "Kirill versiyasini ko'rish",
      description:
        'Postning avtomatik yaratilgan kirill (uz-Cyrl) versiyasi: sarlavha, lid, matn (Markdown), ' +
        "SEO va FAQ. Faqat ko'rish — kirillni agent tahrirlamaydi.",
      inputSchema: postIdInput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    safeTool('preview_cyrillic', (input) => previewCyrillic(ctx, input)),
  )

  server.registerTool(
    'submit_for_review',
    {
      title: 'Tekshiruvga yuborish',
      description:
        "Postni review holatiga o'tkazadi (+ notesForEditor). Matn va SEO to'ldirilgan bo'lishi " +
        'kerak, aks holda { ok: false, errors[] }. Publish qilinmaydi — chop etishni muharrir bajaradi.',
      inputSchema: submitForReviewInput,
      annotations: { ...WRITE, idempotentHint: false },
    },
    safeTool('submit_for_review', (input) => submitForReview(ctx, input)),
  )
}
