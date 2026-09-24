import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { apiKeyRateLimiter } from '@/auth/rate-limit'
import { createMcpRoute, MCP_PATH } from '@/mcp/route'
import { READ_TOOL_NAMES } from '@/mcp/tools'
import { WRITE_TOOL_NAMES } from '@/mcp/write-tools'
import type { Category, Post, ScrapedItem, Source, User } from '@/payload-types'

import {
  as,
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  TEST_SLUG_PREFIX,
  testSlug,
  type TestUsers,
} from './helpers/content'
import { deleteTestUsers, initTestPayload } from './helpers/payload'

/**
 * MCP yozish toollari (M2-07, TZ §5.1, §5.3, §6.3) — SDK mijozi bilan `/api/mcp` route handler'i
 * orqali, haqiqiy Postgres: to'liq zanjir, validatsiya xatolari, egalik/lock, published rad etilishi,
 * kirill avtomatik to'ldirilishi va audit (`channel = mcp`).
 */
let payload: Payload
let users: TestUsers
let category: Category
let source: Source
let editorKey: string
let editor2Key: string

const SITE_URL = 'https://blog.odya.test'
const ENDPOINT = `http://localhost:3000${MCP_PATH}`
const URL_PREFIX = 'https://mcp-write-test.example/'
const TOKEN = `Mcpw${Date.now().toString(36)}`

const route = createMcpRoute({ getPayload: async () => payload, siteUrl: SITE_URL })

/** Test davomida yaratilgan (slug'i prefiksiz bo'lib qoladigan) postlar va teglar — tozalash uchun. */
const createdPosts = new Set<number>()
const createdTags = new Set<number>()

function routeFetch() {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const handler = route[request.method as 'GET' | 'POST' | 'DELETE']
    return handler ? handler(request) : new Response(null, { status: 405 })
  }
}

async function connect(key: string): Promise<Client> {
  const client = new Client({ name: 'vitest-mcp-write', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(ENDPOINT), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
      fetch: routeFetch(),
    }),
  )
  return client
}

async function enableKey(user: User): Promise<string> {
  const key = crypto.randomUUID()
  await payload.update({
    collection: 'users',
    id: user.id,
    data: { apiKey: key, enableAPIKey: true },
    ...as(user),
  })
  return key
}

function textOf(result: CallToolResult, index = 0): string {
  const block = result.content[index]
  if (!block || block.type !== 'text') throw new Error(`content[${index}] — text emas`)
  return block.text
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON javobini testda erkin tekshiramiz
function jsonOf(result: CallToolResult, index = 0): any {
  return JSON.parse(textOf(result, index))
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult
  // `save_rewrite` yaratgan teglar (masalan, "Apple") — tozalash uchun.
  if (name === 'save_rewrite' && !result.isError) {
    for (const tag of jsonOf(result).tags ?? []) if (tag.created) createdTags.add(tag.id)
  }
  return result
}

let counter = 0
async function newItem(extra: Partial<ScrapedItem> = {}): Promise<ScrapedItem> {
  counter += 1
  const url = `${URL_PREFIX}${Date.now()}-${counter}`
  return payload.create({
    collection: 'scraped-items',
    data: {
      title: `Apple delays event ${counter}`,
      source: source.id,
      status: 'scraped',
      url,
      urlHash: `mcp-write-test-${url}`,
      excerpt: 'RSS summary',
      extractedText: SOURCE_TEXT,
      suggestedCategory: category.id,
      language: 'en',
      score: 80,
      ...extra,
    },
  })
}

const SOURCE_TEXT =
  'Apple has delayed the iPhone 18 launch event to October according to people familiar with ' +
  'the matter, citing production issues with the new A20 processor made by TSMC in Taiwan. ' +
  'The company declined to comment on the report.'

const filler = (count: number) =>
  Array.from({ length: count }, (_, i) => `jumla${i % 17} maʼlumot`).join(' ')

function goodRewrite(postId: number, extra: Record<string, unknown> = {}) {
  return {
    postId,
    title: `Apple iPhone 18 taqdimotini oktabrga koʻchirdi ${TOKEN}`,
    excerpt:
      'Apple iPhone 18 taqdimotini oktabr oyiga koʻchirdi. Bloomberg maʼlumotiga koʻra, ' +
      'kechikishga yangi A20 protsessorini ishlab chiqarishdagi muammolar sabab boʻlgan.',
    body: [
      `iPhone 18 taqdimoti oktabrga koʻchirildi. ${filler(80)}`,
      '',
      '## iPhone 18 taqdimoti qachon boʻladi',
      '',
      `${filler(70)} Batafsil: [Apple oʻtgan yilgi taqdimoti](/gadjetlar/apple-2025) va ` +
        '[narxlar tahlili](/gadjetlar/narxlar).',
      '',
      '## Oʻzbekiston uchun ahamiyati',
      '',
      '- Narxlar oʻzgarmaydi',
      '- Yetkazib berish kechikadi',
      '',
      '| Model | Narx |',
      '| --- | --- |',
      '| iPhone 18 | $999 |',
      '',
      `${filler(60)} Manba: [Bloomberg](https://www.bloomberg.com/news/x).`,
    ].join('\n'),
    category: category.slug,
    tags: ['Apple', `iPhone ${TOKEN}`, 'Bloomberg'],
    ...extra,
  }
}

const GOOD_SEO = {
  seoTitle: 'iPhone 18 taqdimoti oktabrga koʻchirildi',
  metaDescription:
    'iPhone 18 taqdimoti oktabrga koʻchirildi: Bloomberg maʼlumotiga koʻra, sabab — yangi ' +
    'A20 protsessorini ishlab chiqarishdagi muammolar. Sanalar va tafsilotlar.',
  focusKeyword: 'iPhone 18 taqdimoti',
  faq: [
    { question: 'iPhone 18 qachon taqdim etiladi?', answer: 'Taqdimot oktabr oyiga koʻchirilgan.' },
    {
      question: 'Taqdimot nima uchun kechiktirildi?',
      answer: 'Protsessor ishlab chiqarishi sababli.',
    },
  ],
  coverAlt: 'Apple logotipi tushirilgan sahna va taqdimot zali',
}

async function readPost(id: number, locale: 'uz-Latn' | 'uz-Cyrl' = 'uz-Latn'): Promise<Post> {
  return payload.findByID({
    collection: 'posts',
    id,
    depth: 0,
    draft: true,
    locale,
    fallbackLocale: false,
  })
}

/** Sinov uchun (Local API, admin huquqisiz) — editor nomidan post yaratish. */
async function draftPost(user: User, extra: Partial<Post> = {}): Promise<Post> {
  const item = await newItem()
  const post = await payload.create({
    collection: 'posts',
    data: {
      title: 'Qoralama',
      slug: testSlug('w'),
      category: category.id,
      workflowStatus: 'draft',
      assignee: user.id,
      sources: [{ url: item.url, name: 'MCP manba', scrapedItem: item.id }],
      ...extra,
    },
    ...as(user),
  })
  createdPosts.add(post.id)
  return post
}

async function cleanup() {
  for (const id of createdPosts) {
    await payload.delete({ collection: 'posts', id }).catch(() => undefined)
  }
  for (const id of createdTags) {
    await payload.delete({ collection: 'tags', id }).catch(() => undefined)
  }
  await payload.delete({ collection: 'tags', where: { name: { like: TOKEN } } })
  await payload.delete({ collection: 'scraped-items', where: { url: { like: URL_PREFIX } } })
  await deleteTestContent(payload)
  await payload.delete({ collection: 'sources', where: { slug: { like: TEST_SLUG_PREFIX } } })
  await deleteTestUsers(payload)
}

describe('MCP yozish toollari (/api/mcp)', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await cleanup()
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    source = await payload.create({
      collection: 'sources',
      data: {
        name: 'MCP yozish manbasi',
        slug: testSlug('wsrc'),
        homepageUrl: URL_PREFIX,
        feeds: [{ url: `${URL_PREFIX}feed.xml`, mapsTo: category.id }],
        language: 'en',
        fetchMode: 'rss_only',
        priority: 50,
      },
    })
    editorKey = await enableKey(users.editor)
    editor2Key = await enableKey(users.editor2)
  })

  beforeEach(() => apiKeyRateLimiter.reset())

  afterAll(async () => {
    if (payload) await cleanup()
    await payload?.db?.destroy?.()
  })

  it('toollar ro‘yxati: o‘qish + yozish, publish tool yo‘q', async () => {
    const client = await connect(editorKey)
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES].sort(),
    )
    expect(tools.some((tool) => /publish|delete|schedule/.test(tool.name))).toBe(false)
    const save = tools.find((tool) => tool.name === 'save_rewrite')
    expect(Object.keys(save?.inputSchema.properties ?? {}).sort()).toEqual(
      ['body', 'category', 'excerpt', 'postId', 'tags', 'title'].sort(),
    )
    expect(save?.annotations?.readOnlyHint).toBe(false)
    await client.close()
  })

  it('to‘liq zanjir: list_scraped → create_draft → claim_draft → get_source → save_rewrite → set_seo → submit_for_review', async () => {
    const primary = await newItem({ score: 97, clusterId: `cl-${TOKEN}` })
    const mate = await newItem({ score: 60, clusterId: `cl-${TOKEN}` })
    const client = await connect(editorKey)

    const scraped = jsonOf(await call(client, 'list_scraped', { source: source.id, minScore: 90 }))
    expect(scraped.docs.map((doc: { id: number }) => doc.id)).toContain(primary.id)

    // create_draft: ikkita element → bitta post, atributsiya avtomatik.
    const draft = jsonOf(
      await call(client, 'create_draft', { scrapedItemIds: [primary.id, mate.id] }),
    )
    createdPosts.add(draft.post.id)
    expect(draft).toMatchObject({
      created: true,
      post: {
        workflowStatus: 'draft',
        assignee: users.editor.id,
        category: category.id,
        sources: [
          { scrapedItem: primary.id, url: primary.url, name: 'MCP yozish manbasi' },
          { scrapedItem: mate.id, url: mate.url },
        ],
      },
      items: [
        { id: primary.id, status: 'drafted' },
        { id: mate.id, status: 'drafted' },
      ],
    })
    const postId: number = draft.post.id
    // Idempotent: qayta chaqirish — mavjud post.
    const again = jsonOf(await call(client, 'create_draft', { scrapedItemIds: [primary.id] }))
    expect(again).toMatchObject({ created: false, post: { id: postId } })

    const claimed = jsonOf(await call(client, 'claim_draft', { postId }))
    expect(claimed.post).toMatchObject({ workflowStatus: 'in_progress', assignee: users.editor.id })
    const lockMs = new Date(claimed.post.lockedUntil).getTime() - Date.now()
    expect(lockMs).toBeGreaterThan(115 * 60_000)
    expect(lockMs).toBeLessThanOrEqual(120 * 60_000)

    const src = await call(client, 'get_source', { id: claimed.sources[0].scrapedItem })
    expect(textOf(src, 1)).toContain('Apple has delayed the iPhone 18')

    const saved = await call(client, 'save_rewrite', goodRewrite(postId))
    expect(saved.isError).toBeFalsy()
    const savedJson = jsonOf(saved)
    expect(savedJson).toMatchObject({ ok: true, errors: [], saved: true })
    expect(savedJson.seoScore).toBeGreaterThan(40)
    expect(savedJson.post.slug).toBe(
      `apple-iphone-18-taqdimotini-oktabrga-kochirdi-${TOKEN.toLowerCase()}`,
    )
    expect(savedJson.tags.map((tag: { name: string }) => tag.name)).toEqual([
      'Apple',
      `iPhone ${TOKEN}`,
      'Bloomberg',
    ])
    expect(savedJson.similarity.containment).toBe(0)
    expect(savedJson.cyrillic.updated.sort()).toEqual(['content', 'excerpt', 'title'])

    const seo = await call(client, 'set_seo', { postId, ...GOOD_SEO })
    const seoJson = jsonOf(seo)
    expect(seo.isError).toBeFalsy()
    expect(seoJson).toMatchObject({ ok: true, errors: [], saved: true })
    expect(seoJson.cyrillic.updated.sort()).toEqual(['coverAlt', 'faq', 'meta'])

    const preview = await call(client, 'preview_cyrillic', { postId })
    expect(jsonOf(preview)).toMatchObject({ postId, locale: 'uz-Cyrl', generatedNow: [] })
    const previewText = textOf(preview, 1)
    expect(previewText).toContain('# Apple iPhone 18 тақдимотини октябрга кўчирди')
    expect(previewText).toContain('## Ўзбекистон учун аҳамияти')
    expect(previewText).toContain('(https://www.bloomberg.com/news/x)')
    expect(previewText).toContain('Focus keyword: iPhone 18 тақдимоти')

    const submitted = await call(client, 'submit_for_review', {
      postId,
      notesForEditor: 'Rasm taklifi: Apple Park sahnasi.',
    })
    const submittedJson = jsonOf(submitted)
    expect(submitted.isError).toBeFalsy()
    expect(submittedJson).toMatchObject({
      ok: true,
      submitted: true,
      post: { workflowStatus: 'review' },
    })
    await client.close()

    // Post review navbatida, AI belgilari, lotin va kirill to'lgan.
    const latin = await readPost(postId)
    expect(latin).toMatchObject({
      workflowStatus: 'review',
      rewrittenBy: 'ai_agent',
      aiDisclosure: true,
      lockedUntil: null,
      notesForEditor: 'Rasm taklifi: Apple Park sahnasi.',
      title: `Apple iPhone 18 taqdimotini oktabrga koʻchirdi ${TOKEN}`,
      meta: { title: GOOD_SEO.seoTitle, focusKeyword: 'iPhone 18 taqdimoti' },
      coverAlt: GOOD_SEO.coverAlt,
      _status: 'draft',
    })
    expect(latin.readingTime).toBeGreaterThanOrEqual(1)
    expect(latin.tags).toHaveLength(3)
    const cyrillic = await readPost(postId, 'uz-Cyrl')
    expect(cyrillic.title).toMatch(/^Apple iPhone 18 тақдимотини октябрга кўчирди/)
    expect(cyrillic.excerpt).toContain('маълумотига кўра')
    expect(cyrillic.meta?.description).toContain('тақдимоти')
    expect(cyrillic.faq?.[0]?.question).toBe('iPhone 18 қачон тақдим этилади?')
    expect(cyrillic.coverAlt).toBe('Apple логотипи туширилган саҳна ва тақдимот зали')
    expect(JSON.stringify(cyrillic.content)).toContain('Ўзбекистон учун аҳамияти')

    // Yangi teg kirill nomi bilan yaratildi.
    const newTagId = savedJson.tags.find((tag: { name: string }) =>
      tag.name.startsWith('iPhone'),
    ).id
    const newTag = await payload.findByID({
      collection: 'tags',
      id: newTagId,
      locale: 'uz-Cyrl',
      fallbackLocale: false,
    })
    // Kirill nomi yozilgan (fallback'siz o'qiladi); `iPhone` — glossariyda, lotinda qoladi.
    expect(newTag.name.startsWith('iPhone ')).toBe(true)

    // Audit: har bir yozuv `mcp` kanali va tool nomi bilan.
    const audit = await payload.find({
      collection: 'audit-logs',
      where: { and: [{ collection: { equals: 'posts' } }, { docId: { equals: String(postId) } }] },
      pagination: false,
      depth: 0,
    })
    expect(audit.docs.length).toBeGreaterThan(0)
    expect(audit.docs.every((entry) => entry.channel === 'mcp')).toBe(true)
    expect(new Set(audit.docs.map((entry) => entry.tool))).toEqual(
      new Set(['create_draft', 'claim_draft', 'save_rewrite', 'set_seo', 'submit_for_review']),
    )
    expect(audit.docs.every((entry) => entry.user === users.editor.id)).toBe(true)
    expect(audit.docs.some((entry) => entry.locale === 'uz-Cyrl')).toBe(true)

    // Review'dagi postni endi MCP orqali o'zgartirib bo'lmaydi.
    const client2 = await connect(editorKey)
    const blocked = await call(client2, 'save_rewrite', goodRewrite(postId))
    expect(blocked.isError).toBe(true)
    expect(textOf(blocked)).toMatch(/"review" holatida/)
    await client2.close()
  })

  it('validatsiya xatolari agentga tushunarli qaytadi va hech narsa saqlanmaydi', async () => {
    const post = await draftPost(users.editor)
    const client = await connect(editorKey)
    const bad = await call(
      client,
      'save_rewrite',
      goodRewrite(post.id, {
        title: `Янги iPhone ${'juda uzun sarlavha '.repeat(4)}`,
        body: 'Matn [bosing](javascript:alert(document.cookie)) <script>alert(1)</script>',
        category: 'bunday-kategoriya-yoq',
        tags: ['Смартфон'],
      }),
    )
    expect(bad.isError).toBe(true)
    const json = jsonOf(bad)
    expect(json.ok).toBe(false)
    expect(json.saved).toBe(false)
    expect(
      json.errors.map((issue: { field: string; code: string }) => `${issue.field}:${issue.code}`),
    ).toEqual([
      'title:too_long',
      'title:cyrillic_in_latin',
      'tags[0]:cyrillic_in_latin',
      'body:unsafe_url',
      'category:not_found',
    ])
    expect(json.errors[0].message).toMatch(
      /^Sarlavha 70 belgidan oshmasligi kerak \(hozir \d+\)\.$/,
    )
    expect(json.errors[3].message).toContain('Xavfli havola manzili')
    expect(json.warnings.map((issue: { code: string }) => issue.code)).toContain('html_removed')
    expect(typeof json.seoScore).toBe('number')

    const unchanged = await readPost(post.id)
    expect(unchanged).toMatchObject({
      title: 'Qoralama',
      workflowStatus: 'draft',
      rewrittenBy: 'human',
    })

    // Zod darajasidagi xato (tur) — o'zbekcha matn.
    const invalid = await call(client, 'save_rewrite', { postId: post.id, title: 5 })
    expect(invalid.isError).toBe(true)
    expect(textOf(invalid)).toMatch(/title: matn bo'lishi kerak/)

    // Manba bilan juda yuqori o'xshashlik — ogohlantirish (saqlanadi).
    const copied = jsonOf(
      await call(
        client,
        'save_rewrite',
        goodRewrite(post.id, { body: `Kirish.\n\n${SOURCE_TEXT}` }),
      ),
    )
    expect(copied.ok).toBe(true)
    expect(copied.warnings.map((issue: { code: string }) => issue.code)).toContain(
      'source_similarity',
    )

    // set_seo xatolari.
    const seo = jsonOf(
      await call(client, 'set_seo', {
        postId: post.id,
        seoTitle: 'S'.repeat(80),
        metaDescription: 'qisqa',
        focusKeyword: 'kalit',
      }),
    )
    expect(seo.ok).toBe(false)
    expect(seo.errors.map((issue: { code: string }) => issue.code)).toEqual([
      'too_long',
      'too_short',
    ])
    await client.close()
  })

  it('submit_for_review: matn/SEO bo‘lmasa — ok: false; sources bo‘sh — xato', async () => {
    const post = await draftPost(users.editor)
    const noSources = await draftPost(users.editor, { sources: [] })
    const client = await connect(editorKey)

    const early = jsonOf(await call(client, 'submit_for_review', { postId: post.id }))
    expect(early.ok).toBe(false)
    expect(
      early.errors.map((issue: { field: string; code: string }) => `${issue.field}:${issue.code}`),
    ).toEqual(['body:body_missing', 'excerpt:required', 'seo:seo_missing'])
    expect((await readPost(post.id)).workflowStatus).toBe('draft')

    const rewrite = jsonOf(await call(client, 'save_rewrite', goodRewrite(noSources.id)))
    expect(rewrite.ok).toBe(false)
    expect(rewrite.errors.map((issue: { code: string }) => issue.code)).toEqual(['sources_empty'])

    // draft (claim'siz, o'ziga biriktirilgan) → save_rewrite avtomatik in_progress ga oladi.
    const saved = jsonOf(
      await call(client, 'save_rewrite', goodRewrite(post.id, { tags: ['Apple'] })),
    )
    expect(saved.ok).toBe(true)
    expect(saved.post.workflowStatus).toBe('in_progress')
    expect(jsonOf(await call(client, 'set_seo', { postId: post.id, ...GOOD_SEO })).ok).toBe(true)
    const done = jsonOf(await call(client, 'submit_for_review', { postId: post.id }))
    expect(done).toMatchObject({ ok: true, post: { workflowStatus: 'review' } })
    await client.close()
  })

  it('published postni MCP orqali o‘zgartirish rad etiladi', async () => {
    const post = await draftPost(users.editor)
    const update = (data: Partial<Post>) =>
      payload.update({ collection: 'posts', id: post.id, data, ...as(users.editor) })
    await update({ workflowStatus: 'in_progress' })
    await update({ workflowStatus: 'review' })
    await update({ _status: 'published' })

    const client = await connect(editorKey)
    for (const [tool, args] of [
      ['save_rewrite', goodRewrite(post.id)],
      ['set_seo', { postId: post.id, ...GOOD_SEO }],
      ['claim_draft', { postId: post.id }],
      ['release_draft', { postId: post.id }],
      ['submit_for_review', { postId: post.id }],
    ] as const) {
      const result = await call(client, tool, args)
      expect(result.isError, tool).toBe(true)
      expect(textOf(result), tool).toMatch(
        new RegExp(
          `Post #${post.id} "published" holatida — MCP orqali faqat draft yoki in_progress`,
        ),
      )
    }
    const after = await readPost(post.id)
    expect(after).toMatchObject({ workflowStatus: 'published', title: 'Qoralama' })
    await client.close()
  })

  it('egalik va lock: boshqa muharrirning posti, claim, release', async () => {
    const post = await draftPost(users.editor)
    const editor = await connect(editorKey)
    const other = await connect(editor2Key)

    // Boshqaga biriktirilgan qoralama — claim ham, yozish ham rad etiladi.
    const foreignClaim = await call(other, 'claim_draft', { postId: post.id })
    expect(foreignClaim.isError).toBe(true)
    expect(textOf(foreignClaim)).toMatch(/boshqa muharrirga \(user #\d+\) biriktirilgan/)
    const foreignSave = await call(other, 'save_rewrite', goodRewrite(post.id))
    expect(foreignSave.isError).toBe(true)
    expect(textOf(foreignSave)).toMatch(/boshqa foydalanuvchiga/)

    // Egasi oladi (lock), boshqasi band qilinganini ko'radi.
    expect(jsonOf(await call(editor, 'claim_draft', { postId: post.id })).post.workflowStatus).toBe(
      'in_progress',
    )
    const locked = await call(other, 'claim_draft', { postId: post.id })
    expect(locked.isError).toBe(true)
    expect(textOf(locked)).toMatch(/band qilingan \(.+ gacha\)/)

    // Release → boshqa muharrir ola oladi, asl egasi endi yoza olmaydi.
    const released = jsonOf(await call(editor, 'release_draft', { postId: post.id }))
    expect(released.post).toMatchObject({ assignee: null, lockedUntil: null })
    const taken = jsonOf(await call(other, 'claim_draft', { postId: post.id }))
    expect(taken.post).toMatchObject({ workflowStatus: 'in_progress', assignee: users.editor2.id })
    const lost = await call(editor, 'save_rewrite', goodRewrite(post.id))
    expect(lost.isError).toBe(true)

    // Muddati o'tgan lock — boshqa muharrir qayta ola oladi.
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { lockedUntil: new Date(Date.now() - 60_000).toISOString() },
    })
    const retaken = jsonOf(await call(editor, 'claim_draft', { postId: post.id }))
    expect(retaken.post.assignee).toBe(users.editor.id)

    const missing = await call(editor, 'claim_draft', { postId: 999_999_999 })
    expect(textOf(missing)).toBe('Post topilmadi: id=999999999')
    await editor.close()
    await other.close()
  })

  it('create_draft: xatolar (topilmagan, rad etilgan, boshqa postga bog‘langan element)', async () => {
    const client = await connect(editorKey)
    const missing = await call(client, 'create_draft', { scrapedItemIds: [999_999_999] })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toBe('Element topilmadi (id: 999999999).')

    const rejected = await newItem({ status: 'rejected', rejectReason: 'dublikat' })
    const rejectedResult = await call(client, 'create_draft', { scrapedItemIds: [rejected.id] })
    expect(textOf(rejectedResult)).toMatch(/rad etilgan/)

    const a = await newItem()
    const b = await newItem()
    const first = jsonOf(await call(client, 'create_draft', { scrapedItemIds: [a.id] }))
    createdPosts.add(first.post.id)
    const conflict = await call(client, 'create_draft', { scrapedItemIds: [b.id, a.id] })
    expect(conflict.isError).toBe(true)
    expect(textOf(conflict)).toMatch(new RegExp(`Element #${a.id} allaqachon boshqa qoralamaga`))

    const unknownCategory = await call(client, 'create_draft', {
      scrapedItemIds: [b.id],
      category: 'yoq-kategoriya',
    })
    expect(textOf(unknownCategory)).toBe('Kategoriya topilmadi: "yoq-kategoriya"')
    await client.close()
  })
})
