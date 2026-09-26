import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Where } from 'payload'
import sharp from 'sharp'
import type { z } from 'zod'

import { isAdminUser } from '@/access'
import { createRateLimiter, type RateLimiter } from '@/auth/rate-limit'
import { limitsFromEnv } from '@/env.schema'
import type { Media, Post } from '@/payload-types'
import { inTransaction } from '@/scraping/itemState'

import type { McpContext } from './context'
import { cyrillicReport, lockedFields } from './cyrillic'
import { checkRemoteUrl, fetchRemoteImage, tooLarge } from './media-fetch'
import { absoluteUrl, loadBlockedDomains, mediaSummary, mediaUsageIssues } from './media-library'
import {
  AI_GENERATED_CREDIT,
  checkDimensions,
  checkMediaAlt,
  checkMediaMeta,
  MAX_MEDIA_BYTES,
  MEDIA_FORMATS,
  safeFilename,
  sniffImageFormat,
  type MediaFormat,
} from './media-policy'
import { jsonResult, McpToolError, safeTool } from './result'
import { listMediaInput, searchStockImagesInput, setCoverInput, uploadMediaInput } from './schemas'
import { searchPexels } from './stock'
import type { Issue } from './validation'
import {
  assertEditable,
  cyrillicWarning,
  loadPost,
  lockData,
  mcpReq,
  op,
  postSummary,
  rethrow,
} from './write-tools'

/**
 * MCP media toollari (OBLOG-44, `copyright.md` §4): `upload_media`, `set_cover`, `list_media`,
 * `search_stock_images`. Matn ichidagi rasmlar — `save_rewrite` dagi `![alt](media:ID)`.
 *
 * - Yuklash — Payload Local API orqali kalit egasi nomidan (`overrideAccess: false`, kanal `mcp`):
 *   media hook'lari (WebP variantlar, S3/R2 storage, kirill alt/caption, audit) odatdagidek ishlaydi.
 * - Litsenziya majburiy, agentliklar/foto-banklar/yangilik manbalarimiz domenlari rad etiladi;
 *   URL orqali yuklash — SSRF himoyasi bilan (`media-fetch.ts`); format/hajm/o'lcham tekshiruvi.
 * - Kalit bo'yicha umumiy rate limit (`API_KEY_RATE_LIMIT_PER_MIN`, standart 60/daqiqa) +
 *   yuklashlar kvotasi (`MCP_MEDIA_UPLOADS_PER_HOUR`, standart soatiga 30 ta). `admin` roli
 *   uchun ikkalasi ham qo'llanmaydi (OBLOG-45).
 */

type Input<Shape extends z.ZodRawShape> = z.output<z.ZodObject<Shape>>

export const MEDIA_TOOL_NAMES = [
  'upload_media',
  'set_cover',
  'list_media',
  'search_stock_images',
] as const

/**
 * Bitta foydalanuvchi uchun soatiga yuklashlar (`MCP_MEDIA_UPLOADS_PER_HOUR`, standart 30; xotirada,
 * `rate-limit.ts` cheklovi bilan). `admin` — kvotasiz.
 */
export const MEDIA_UPLOADS_PER_HOUR = limitsFromEnv().mediaUploadsPerHour
export const mediaUploadLimiter: RateLimiter = createRateLimiter({
  limit: MEDIA_UPLOADS_PER_HOUR,
  windowMs: 60 * 60 * 1000,
})

/** `{ ok, errors[], warnings[] }` javobi (ok: false — `isError`). */
function result(
  data: { ok: boolean; errors: Issue[]; warnings: Issue[] } & Record<string, unknown>,
) {
  return { ...jsonResult(data), ...(data.ok ? {} : { isError: true }) }
}

// ---------------------------------------------------------------------------
// upload_media
// ---------------------------------------------------------------------------

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/

/** base64 (yoki `data:image/...;base64,...`) → bayt. */
export function decodeBase64Image(raw: string): Buffer {
  let text = raw.trim()
  const dataUri = /^data:([^;,]*)(;[^,]*)?,/i.exec(text)
  if (dataUri) {
    if (!/;base64/i.test(dataUri[2] ?? '')) {
      throw new McpToolError('data: faqat base64 kodlangan bo‘lishi kerak.')
    }
    text = text.slice(dataUri[0].length)
  }
  text = text.replace(/\s+/g, '')
  if (
    !text ||
    text.length % 4 === 1 ||
    !BASE64_RE.test(text.replace(/-/g, '+').replace(/_/g, '/'))
  ) {
    throw new McpToolError("data: noto'g'ri base64.")
  }
  const data = Buffer.from(text, 'base64')
  if (data.length > MAX_MEDIA_BYTES) throw new McpToolError(tooLarge(MAX_MEDIA_BYTES))
  return data
}

interface PreparedImage {
  data: Buffer
  format: MediaFormat
  width: number
  height: number
}

/** Format (magic bytes) va o'lcham (sharp) tekshiruvi. */
export async function inspectImage(data: Buffer): Promise<PreparedImage> {
  const format = sniffImageFormat(data)
  if (!format) {
    throw new McpToolError('Fayl JPEG, PNG yoki WebP emas (SVG, GIF va boshqalar — yo‘q).')
  }
  let width = 0
  let height = 0
  try {
    const meta = await sharp(data, { limitInputPixels: 100_000_000 }).metadata()
    width = meta.width ?? 0
    height = meta.height ?? 0
    if (meta.format !== format) throw new Error('format mismatch')
  } catch {
    throw new McpToolError("Rasmni o'qib bo'lmadi — fayl buzilgan yoki formati mos emas.")
  }
  const problem = checkDimensions(width, height)
  if (problem) throw new McpToolError(problem)
  return { data, format, width, height }
}

function trimmed(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

export async function uploadMedia(
  ctx: McpContext,
  input: Input<typeof uploadMediaInput>,
): Promise<CallToolResult> {
  const req = await mcpReq(ctx, 'upload_media')
  const meta = {
    alt: input.alt.trim(),
    caption: trimmed(input.caption),
    credit:
      trimmed(input.credit) ?? (input.license === 'ai_generated' ? AI_GENERATED_CREDIT : undefined),
    license: input.license,
    licenseUrl: trimmed(input.licenseUrl),
    licenseNote: trimmed(input.licenseNote),
  }
  const hasUrl = Boolean(trimmed(input.url))
  const hasData = Boolean(input.data?.trim())
  if (hasUrl === hasData) {
    throw new McpToolError('url yoki data (base64) — aynan bittasini bering.')
  }

  const checks = checkMediaMeta(meta)
  const errors: Issue[] = [...checks.errors]
  const warnings: Issue[] = [...checks.warnings]
  const blocked = await loadBlockedDomains(ctx, req)
  const sourceUrl = trimmed(input.sourceUrl)
  if (sourceUrl) {
    try {
      checkRemoteUrl(sourceUrl, blocked)
    } catch (error) {
      errors.push({
        field: 'sourceUrl',
        code: 'blocked_source',
        message: error instanceof McpToolError ? error.message : "sourceUrl noto'g'ri.",
      })
    }
  }
  if (errors.length) return result({ ok: false, errors, warnings, uploaded: false })

  // Kvota — admin'dan tashqari barcha rollar uchun (OBLOG-45).
  if (!isAdminUser(ctx.user)) {
    const limiter = ctx.media?.uploadLimiter ?? mediaUploadLimiter
    const quota = limiter.hit(`user:${ctx.user.id}`)
    if (!quota.allowed) {
      const message = `Yuklashlar limiti: soatiga ${quota.limit} ta. ${quota.retryAfterSec} soniyadan keyin urinib ko'ring.`
      return result({
        ok: false,
        errors: [{ field: 'upload', code: 'rate_limited', message }],
        warnings,
        uploaded: false,
        retryAfterSec: quota.retryAfterSec,
        limitPerHour: quota.limit,
      })
    }
  }

  let raw: Buffer
  let finalUrl: string | undefined
  if (hasUrl) {
    const fetched = await fetchRemoteImage(input.url!.trim(), blocked, ctx.media?.fetchDeps)
    raw = fetched.data
    finalUrl = fetched.finalUrl
  } else {
    raw = decodeBase64Image(input.data!)
  }
  const image = await inspectImage(raw)
  const nameHint =
    trimmed(input.filename) ??
    (finalUrl ? decodeURIComponent(new URL(finalUrl).pathname.split('/').pop() ?? '') : undefined)
  const filename = safeFilename(nameHint, image.format)

  const media = await ctx.payload
    .create({
      collection: 'media',
      data: {
        alt: meta.alt,
        ...(meta.caption ? { caption: meta.caption } : {}),
        ...(meta.credit ? { credit: meta.credit } : {}),
        license: meta.license,
        ...(meta.licenseUrl ? { licenseUrl: meta.licenseUrl } : {}),
        ...(meta.licenseNote ? { licenseNote: meta.licenseNote } : {}),
        ...((sourceUrl ?? finalUrl) ? { sourceUrl: sourceUrl ?? finalUrl } : {}),
      },
      file: {
        data: image.data,
        mimetype: MEDIA_FORMATS[image.format].mime,
        name: filename,
        size: image.data.length,
      },
      depth: 0,
      ...op(ctx, req),
    })
    .catch(rethrow)

  return result({
    ok: true,
    errors: [],
    warnings,
    uploaded: true,
    mediaId: media.id,
    media: {
      ...mediaSummary(ctx, media as Media),
      width: media.width ?? image.width,
      height: media.height ?? image.height,
      sizes: Object.fromEntries(
        Object.entries(media.sizes ?? {})
          .filter(([, size]) => size?.url)
          .map(([name, size]) => [
            name,
            {
              url: absoluteUrl(ctx, size!.url),
              width: size!.width ?? null,
              height: size!.height ?? null,
            },
          ]),
      ),
    },
    next:
      `Muqova: set_cover(postId, mediaId: ${media.id}). Matn ichida: save_rewrite body'da alohida ` +
      `qatorda ![alt](media:${media.id}).`,
  })
}

// ---------------------------------------------------------------------------
// set_cover
// ---------------------------------------------------------------------------

export async function setCover(
  ctx: McpContext,
  input: Input<typeof setCoverInput>,
): Promise<CallToolResult> {
  const req = await mcpReq(ctx, 'set_cover')
  const post = await loadPost(ctx, req, input.postId)
  assertEditable(post, ctx.user.id)

  const errors: Issue[] = []
  const warnings: Issue[] = []
  const media = (await ctx.payload.findByID({
    collection: 'media',
    id: input.mediaId,
    depth: 0,
    disableErrors: true,
    ...op(ctx, req),
  })) as Media | null
  if (!media) {
    throw new McpToolError(
      `Media topilmadi: id=${input.mediaId} — upload_media yoki list_media dan ID oling.`,
    )
  }
  if (!media.mimeType?.startsWith('image/')) {
    errors.push({
      field: 'mediaId',
      code: 'media_not_image',
      message: `Media #${media.id} rasm emas.`,
    })
  }
  errors.push(...mediaUsageIssues(media, await loadBlockedDomains(ctx, req), 'mediaId'))
  const alt = trimmed(input.alt)
  if (alt) {
    const altCheck = checkMediaAlt(alt)
    errors.push(...altCheck.errors)
    warnings.push(...altCheck.warnings)
  }
  if ((media.width ?? 0) < 1200) {
    warnings.push({
      field: 'mediaId',
      code: 'cover_small',
      message: `Muqova kengligi ${media.width ?? '?'} px — 1200 px dan kichik (og:image va hero uchun sifat past bo'ladi).`,
    })
  }
  if (errors.length) return result({ ok: false, errors, warnings, saved: false })

  // coverAlt — postga xos alt taklifi; berilmasa va bo'sh bo'lsa — media alt.
  const coverAlt = alt ?? (post.coverAlt ? undefined : media.alt)
  const saved = await inTransaction(req, async () => {
    const updated = await ctx.payload.update({
      collection: 'posts',
      id: post.id,
      data: {
        ...lockData(ctx.user.id),
        coverImage: media.id,
        ...(coverAlt !== undefined ? { coverAlt } : {}),
      } as Partial<Post>,
      depth: 0,
      ...op(ctx, req),
    })
    const cyrillic = cyrillicReport(
      coverAlt !== undefined ? (['coverAlt'] as const) : [],
      lockedFields(post),
    )
    return { updated, cyrillic }
  }).catch(rethrow)
  // `meta.image` bo'sh (yoki eski muqova) bo'lsa, posts hook'i uni muqovaga tenglaydi (OBLOG-47).
  const metaImageOf = (doc: Post): unknown => {
    const image = doc.meta?.image
    return typeof image === 'object' && image !== null ? image.id : (image ?? null)
  }
  const metaImageUpdated =
    String(metaImageOf(saved.updated)) === String(media.id) &&
    String(metaImageOf(post)) !== String(media.id)

  warnings.push(...cyrillicWarning(saved.cyrillic.skipped))
  return result({
    ok: true,
    errors: [],
    warnings,
    saved: true,
    post: {
      ...postSummary(ctx, saved.updated),
      coverImage: media.id,
      coverAlt: saved.updated.coverAlt ?? null,
      metaImage: metaImageOf(saved.updated),
    },
    metaImageUpdated,
    media: mediaSummary(ctx, media),
    cyrillic: saved.cyrillic,
    next: 'submit_for_review(postId, notesForEditor)',
  })
}

// ---------------------------------------------------------------------------
// list_media
// ---------------------------------------------------------------------------

export async function listMedia(
  ctx: McpContext,
  input: Input<typeof listMediaInput>,
): Promise<CallToolResult> {
  const req = await mcpReq(ctx, 'list_media')
  const and: Where[] = [{ mimeType: { like: 'image/' } }]
  if (input.query) {
    and.push({
      or: [
        { filename: { like: input.query } },
        { alt: { like: input.query } },
        { caption: { like: input.query } },
        { credit: { like: input.query } },
      ],
    })
  }
  if (input.license !== 'all') and.push({ license: { equals: input.license } })
  if (input.mine) and.push({ uploadedBy: { equals: ctx.user.id } })
  const found = await ctx.payload.find({
    collection: 'media',
    where: { and },
    sort: '-createdAt',
    page: input.page,
    limit: input.limit,
    depth: 0,
    ...op(ctx, req),
  })
  const blocked = await loadBlockedDomains(ctx, req)
  return jsonResult({
    page: found.page ?? input.page,
    limit: input.limit,
    totalDocs: found.totalDocs,
    totalPages: found.totalPages,
    hasNextPage: found.hasNextPage,
    items: (found.docs as Media[]).map((media) => {
      const issues = mediaUsageIssues(media, blocked, 'media')
      return {
        ...mediaSummary(ctx, media),
        usable: issues.length === 0,
        ...(issues.length ? { problems: issues.map((issue) => issue.message) } : {}),
      }
    }),
    note:
      'usable: true — muqova (set_cover) yoki matn ichida (![alt](media:ID)) ishlatish mumkin. ' +
      "Logotiplar va press-kitlarni qayta yuklamang — shu ro'yxatdan foydalaning.",
  })
}

// ---------------------------------------------------------------------------
// search_stock_images
// ---------------------------------------------------------------------------

export async function searchStockImages(
  ctx: McpContext,
  input: Input<typeof searchStockImagesInput>,
): Promise<CallToolResult> {
  const found = await searchPexels(
    { query: input.query, page: input.page, limit: input.limit, orientation: input.orientation },
    ctx.media?.pexelsApiKey,
    ctx.media?.stockFetch,
  )
  return jsonResult({
    ...found,
    note:
      'Nomzodlar — Pexels litsenziyasi (bepul, atributsiya bilan). Mosini tanlang va upload_media ga ' +
      "uploadWith dagi url/license/credit/sourceUrl/licenseUrl ni o'zingiz yozgan alt (5–15 so'z, " +
      'lotin) bilan yuboring. Taniqli shaxs yoki brendni noto‘g‘ri ko‘rsatadigan rasmni tanlamang.',
  })
}

// ---------------------------------------------------------------------------
// Ro'yxatga olish
// ---------------------------------------------------------------------------

export function registerMediaTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'upload_media',
    {
      title: 'Rasm yuklash',
      description:
        'Rasmni media kutubxonasiga yuklaydi: url (http/https) yoki data (base64) + filename. ' +
        "Majburiy: alt (5–15 so'z, lotin) va license; cc_by — licenseUrl, other — licenseNote, " +
        'press_kit/unsplash/pexels/cc_by — credit. Faqat JPEG/PNG/WebP, ≤ 10 MB, ≥ 400×200. ' +
        'Agentliklar (Getty, Reuters, AP, AFP …), foto-banklar va yangilik manbalarimiz rasmlari ' +
        'rad etiladi. Javob: mediaId, URL, o‘lchamlar.',
      inputSchema: uploadMediaInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    safeTool('upload_media', (input) => uploadMedia(ctx, input)),
  )

  server.registerTool(
    'set_cover',
    {
      title: 'Muqova rasmini belgilash',
      description:
        'Postga muqova (coverImage) qo‘yadi: postId, mediaId (+ alt — postning coverAlt). ' +
        'SEO rasmi (meta.image) bo‘sh yoki eski muqova bo‘lsa — u ham shu muqovaga tenglanadi (metaImageUpdated). ' +
        'Faqat sizga biriktirilgan draft/in_progress postlar; media litsenziyasi to‘liq bo‘lishi kerak.',
      inputSchema: setCoverInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safeTool('set_cover', (input) => setCover(ctx, input)),
  )

  server.registerTool(
    'list_media',
    {
      title: 'Media kutubxonasi',
      description:
        'Yuklangan rasmlar (logotiplar, press-kitlar, avval yuklanganlar): qidiruv (fayl nomi, alt, ' +
        'izoh, kredit), litsenziya filtri, mine — faqat o‘zim yuklaganlar. usable — postda ' +
        'ishlatish mumkinmi.',
      inputSchema: listMediaInput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    safeTool('list_media', (input) => listMedia(ctx, input)),
  )

  server.registerTool(
    'search_stock_images',
    {
      title: 'Legal stok rasmlar qidirish',
      description:
        'Pexels’dan bepul litsenziyali rasmlar: muallif, sahifa va upload_media uchun tayyor ' +
        'argumentlar (uploadWith). Serverda PEXELS_API_KEY sozlanmagan bo‘lsa — xato.',
      inputSchema: searchStockImagesInput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    safeTool('search_stock_images', (input) => searchStockImages(ctx, input)),
  )
}
