import type { Locale } from '@blog-odya/shared/locales'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { InstagramMode } from '@/globals/SocialSettings'
import {
  INSTAGRAM_DIGEST_LOOKBACK_MAX_MS,
  INSTAGRAM_DIGEST_MAX_ATTEMPTS,
  INSTAGRAM_DIGEST_PENDING_STALE_MS,
} from '@/jobs/constants'
import { dueSlot, previousSlot } from '@/jobs/slots'
import type { InstagramDigest, Post } from '@/payload-types'
import { homePath } from '@/site/paths'
import { drizzleFor } from '@/telegram/autopost'
import { digestDateParts, orderDigestItems, rankDigestTagNames } from '@/telegram/digestCaption'

import { loadMakeConfig, type MakeConfig } from '../make/config'
import {
  findMakeDelivery,
  MAKE_EVENT,
  makeDeliveryKey,
  type MakeDeps,
  makeDeps,
  type MakeTestResult,
  postToMake,
  runMakeWebhook,
  sendMakeAlert,
} from '../make/deliver'
import { postImageVersion, socialHashtags, socialImageUrl, socialPostUrl } from '../make/payload'
import { loadSocialPost, type SocialPost } from '../post'
import {
  buildDigestPayload,
  digestCoverUrl,
  digestHeader,
  INSTAGRAM_DIGEST_MAX_POSTS,
  INSTAGRAM_SCRIPT,
  type MakeDigestPayload,
} from './digestPayload'

/**
 * Instagram dayjest karuseli (OBLOG-118) — har `/api/jobs/run` nashr tick'ida (`mode=publish|all`,
 * Telegram dayjestidan keyin) chaqiriladi. Yangi pg_cron yo'q.
 *
 * 1. Make yoqilgan, Instagram rejimi `story+digest`, lotin yozuvi tanlangan bo'lsa — hozirgi slot
 *    (`dueSlot`, Toshkent vaqti, standart 07:30 / 12:30 / 18:30; 60 daqiqadan ko'p kechikkan slot
 *    yuborilmaydi — postlari keyingisiga qo'shiladi).
 * 2. `instagram-digests` qatori **atomar band qilinadi** (`claimInstagramDigest`: UNIQUE `key` =
 *    `ig-digest:{slot}` + `INSERT … ON CONFLICT DO UPDATE … WHERE … RETURNING`). Qator olinmasa —
 *    boshqa tick yuboryapti yoki allaqachon yuborilgan. Qayta band qilish — faqat `retry` yoki
 *    uzilib qolgan `pending` holatida, ko'pi bilan {@link INSTAGRAM_DIGEST_MAX_ATTEMPTS} marta.
 * 3. Postlar: chop etilgan, `socialSkip` siz, oyna ichida (oxirgi yuborilgan/bo'sh slotdan — ko'pi
 *    bilan 24 soat — shu slotgacha), hech bir Instagram dayjestida (`posts` / `skippedPosts`)
 *    bo'lmagan va alohida rasmli post sifatida (`post.published`, lotin) yuborilmagan. Tartib —
 *    `digestPriority`, keyin yangiligi; 9 tadan ortig'i — `skippedPosts` (Instagram'ga chiqmaydi).
 * 4. 0 post — `empty`; 1 post — odatdagi rasmli post (`runMakeWebhook`, `post.published`); 2+ —
 *    `type: "digest"` JSON (muqova + post slaydlari, ≤ 10) Make'ga.
 * 5. Xato (429/5xx/4xx/tarmoq) — `retry`, keyingi tick'da qayta (≤ 3), keyin `failed` +
 *    Telegram ogohlantirishi (`sendMakeAlert`).
 *
 * Holat yozuvlari tranzaksiyasiz (darhol commit).
 */

export type InstagramDigestStatus =
  'off' | 'sent' | 'single' | 'empty' | 'busy' | 'retry' | 'failed' | 'skipped'

export interface InstagramDigestRunResult {
  mode: InstagramMode
  /** Ishlangan slot (ISO); rejim `post`, o'chiq yoki slot vaqti emas — `null`. */
  slotAt: string | null
  status: InstagramDigestStatus
  posts?: number
  skipped?: number
  reason?: string
}

export function instagramDigestKey(slotAt: number): string {
  return `ig-digest:${new Date(slotAt).toISOString()}`
}

// ---------------------------------------------------------------------------
// Band qilish (idempotentlik)
// ---------------------------------------------------------------------------

/**
 * Qatorni atomar band qiladi (Telegram `claimDigest` bilan bir xil sxema): yangi — `pending`,
 * 1-urinish; bor bo'lsa — faqat `retry` yoki uzilib qolgan `pending` holatida (urinishlar
 * tugamagan bo'lsa). Parallel tick: ikkinchi `INSERT` birinchisining qulfini kutadi va yangilangan
 * qatorda `WHERE` bajarilmaydi — `null`.
 */
export async function claimInstagramDigest(
  payload: Payload,
  input: { key: string; slotAt: number; now: number },
): Promise<{ id: number; attempts: number; deliveryId: string | null } | null> {
  const db = await drizzleFor(payload)
  const now = new Date(input.now).toISOString()
  const staleBefore = new Date(input.now - INSTAGRAM_DIGEST_PENDING_STALE_MS).toISOString()
  const result = (await db.execute(sql`
    INSERT INTO "instagram_digests"
      ("key", "slot_at", "status", "attempts", "updated_at", "created_at")
    VALUES (${input.key}, ${new Date(input.slotAt).toISOString()}::timestamptz,
      'pending'::"enum_instagram_digests_status", 1, ${now}::timestamptz, ${now}::timestamptz)
    ON CONFLICT ("key") DO UPDATE SET
      "status" = 'pending'::"enum_instagram_digests_status",
      "attempts" = COALESCE("instagram_digests"."attempts", 0) + 1,
      "error" = NULL,
      "updated_at" = EXCLUDED."updated_at"
    WHERE COALESCE("instagram_digests"."attempts", 0) < ${INSTAGRAM_DIGEST_MAX_ATTEMPTS}
      AND (
        "instagram_digests"."status" = 'retry'::"enum_instagram_digests_status"
        OR ("instagram_digests"."status" = 'pending'::"enum_instagram_digests_status"
          AND "instagram_digests"."updated_at" < ${staleBefore}::timestamptz)
      )
    RETURNING "id", "attempts", "delivery_id"
  `)) as unknown as {
    rows: { id: number; attempts: string | number; delivery_id: string | null }[]
  }
  const row = result.rows[0]
  return row
    ? { id: Number(row.id), attempts: Number(row.attempts), deliveryId: row.delivery_id || null }
    : null
}

async function updateDigest(
  payload: Payload,
  id: number,
  data: Partial<Omit<InstagramDigest, 'posts' | 'skippedPosts'>> & {
    posts?: number[]
    skippedPosts?: number[]
  },
): Promise<void> {
  await payload.update({
    collection: 'instagram-digests',
    id,
    data,
    depth: 0,
    overrideAccess: true,
  })
}

// ---------------------------------------------------------------------------
// Postlar
// ---------------------------------------------------------------------------

type CandidatePost = Pick<Post, 'id' | 'digestPriority' | 'publishedAt'>

/** Oyna boshi: oxirgi yuborilgan/bo'sh slot (ko'pi bilan 24 soat orqaga), bo'lmasa — oldingi slot. */
async function windowStart(payload: Payload, slotAt: number, config: MakeConfig): Promise<number> {
  const { docs } = await payload.find({
    collection: 'instagram-digests',
    where: {
      and: [
        { slotAt: { less_than: new Date(slotAt).toISOString() } },
        { status: { in: ['sent', 'empty'] } },
      ],
    },
    sort: '-slotAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { slotAt: true },
  })
  const last = docs[0]?.slotAt ? Date.parse(docs[0].slotAt) : NaN
  const start = Number.isNaN(last) ? previousSlot(slotAt, config.instagramDigestTimes) : last
  return Math.max(start, slotAt - INSTAGRAM_DIGEST_LOOKBACK_MAX_MS)
}

/** Boshqa Instagram dayjestlariga kirgan/sig'magan yoki alohida post bo'lib chiqqan postlar. */
async function usedPosts(payload: Payload, digestId: number, ids: number[]): Promise<Set<number>> {
  const used = new Set<number>()
  if (ids.length === 0) return used
  const [digests, deliveries] = await Promise.all([
    payload.find({
      collection: 'instagram-digests',
      where: {
        and: [
          { id: { not_equals: digestId } },
          { or: [{ posts: { in: ids } }, { skippedPosts: { in: ids } }] },
        ],
      },
      depth: 0,
      pagination: false,
      limit: 0,
      overrideAccess: true,
      select: { posts: true, skippedPosts: true },
    }),
    payload.find({
      collection: 'social-deliveries',
      where: {
        and: [
          { key: { in: ids.map((id) => makeDeliveryKey(id, MAKE_EVENT, INSTAGRAM_SCRIPT)) } },
          { status: { equals: 'sent' } },
        ],
      },
      depth: 0,
      pagination: false,
      limit: 0,
      overrideAccess: true,
      select: { post: true },
    }),
  ])
  for (const doc of digests.docs) {
    for (const value of [...(doc.posts ?? []), ...(doc.skippedPosts ?? [])]) {
      used.add(typeof value === 'object' ? value.id : value)
    }
  }
  for (const doc of deliveries.docs) {
    const post = doc.post
    if (post) used.add(typeof post === 'object' ? post.id : post)
  }
  return used
}

async function digestCandidates(
  payload: Payload,
  digestId: number,
  slotAt: number,
  config: MakeConfig,
): Promise<{ id: number; priority: number; publishedAt: string | null }[]> {
  const start = await windowStart(payload, slotAt, config)
  const { docs } = (await payload.find({
    collection: 'posts',
    draft: false,
    depth: 0,
    overrideAccess: true,
    where: {
      and: [
        { _status: { equals: 'published' } },
        { workflowStatus: { equals: 'published' } },
        { socialSkip: { not_equals: true } },
        { publishedAt: { greater_than: new Date(start).toISOString() } },
        { publishedAt: { less_than_equal: new Date(slotAt).toISOString() } },
      ],
    },
    select: { digestPriority: true, publishedAt: true },
    sort: '-publishedAt',
    limit: 200,
  })) as unknown as { docs: CandidatePost[] }
  const used = await usedPosts(
    payload,
    digestId,
    docs.map((post) => post.id),
  )
  return docs
    .filter((post) => !used.has(post.id))
    .map((post) => ({
      id: post.id,
      priority: Number(post.digestPriority) || 0,
      publishedAt: post.publishedAt ?? null,
    }))
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

/** Dayjest JSON'i (`type: "digest"`): muqova + post slaydlari (4:5), caption, heshteglar. */
export function buildDigestPayloadFor(
  payload: Payload,
  options: {
    key: string
    slotAt: number
    posts: readonly SocialPost[]
    config: MakeConfig
    test: boolean
    deliveryId: string
    script?: Locale
  },
  deps: MakeDeps = makeDeps,
): MakeDigestPayload {
  const script = options.script ?? INSTAGRAM_SCRIPT
  const origin = deps.origin()
  const style = { overlay: options.config.imageOverlay, scheme: options.config.imageScheme }
  const posts = options.posts.slice(0, INSTAGRAM_DIGEST_MAX_POSTS)
  const home = new URL(homePath(script), `${origin.replace(/\/+$/, '')}/`)
  home.searchParams.set('utm_source', 'instagram')
  home.searchParams.set('utm_medium', 'social')
  home.searchParams.set('utm_campaign', script === 'uz-Cyrl' ? 'cyrl' : 'latn')
  return buildDigestPayload({
    key: options.key,
    slotAt: options.slotAt,
    header: digestHeader(script, digestDateParts(options.slotAt, script).date),
    cover: {
      imageUrl: digestCoverUrl({
        origin,
        script,
        slotAt: options.slotAt,
        postIds: posts.map((data) => data.post.id),
        secret: payload.secret,
      }),
      url: home.toString(),
    },
    posts: posts.map((data) => ({
      id: data.post.id,
      title: data.input.title,
      socialTitle: data.socialTitle,
      metaTitle: data.post.meta?.title,
      imageUrl: socialImageUrl({
        origin,
        postId: data.post.id,
        // Karusel slaydlari bir xil nisbatda (muqova — 4:5).
        variant: 'portrait',
        locale: script,
        version: postImageVersion(data.input, style),
      }),
      url: socialPostUrl({
        origin,
        locale: script,
        categorySlug: data.input.category.slug,
        slug: data.input.slug,
        source: 'instagram',
      }),
    })),
    hashtags: socialHashtags(
      rankDigestTagNames(posts.map((data) => ({ tagNames: data.input.hashtagNames }))),
      { count: options.config.hashtagsCount, brand: options.config.brandHashtag },
    ),
    test: options.test,
    deliveryId: options.deliveryId,
    sentAt: new Date(deps.now()).toISOString(),
    script,
  })
}

async function loadPosts(payload: Payload, ids: readonly number[], origin: string) {
  const loaded = await Promise.all(
    ids.map((id) => loadSocialPost(payload, id, INSTAGRAM_SCRIPT, origin)),
  )
  return loaded.filter((data): data is SocialPost => data !== null)
}

// ---------------------------------------------------------------------------
// Yuborish
// ---------------------------------------------------------------------------

async function processSlot(
  payload: Payload,
  slotAt: number,
  config: MakeConfig & { webhookUrl: string },
  deps: MakeDeps,
  now: number,
): Promise<Omit<InstagramDigestRunResult, 'mode' | 'slotAt'>> {
  const key = instagramDigestKey(slotAt)
  const claim = await claimInstagramDigest(payload, { key, slotAt, now })
  if (!claim) return { status: 'busy' }
  const log = { digest: key }
  const label = `Instagram dayjest ${new Date(slotAt).toISOString()}`

  const candidates = orderDigestItems(await digestCandidates(payload, claim.id, slotAt, config))
  const overflow = candidates.slice(INSTAGRAM_DIGEST_MAX_POSTS).map((item) => item.id)
  const selected = candidates.slice(0, INSTAGRAM_DIGEST_MAX_POSTS)

  if (selected.length === 0) {
    await updateDigest(payload, claim.id, { status: 'empty', posts: [], skippedPosts: [] })
    return { status: 'empty', posts: 0 }
  }

  const failOrRetry = async (message: string, format?: InstagramDigest['format']) => {
    const final = claim.attempts >= INSTAGRAM_DIGEST_MAX_ATTEMPTS
    await updateDigest(payload, claim.id, {
      ...(format ? { format } : {}),
      status: final ? 'failed' : 'retry',
      error: message,
    })
    if (!final) {
      payload.logger.warn({
        ...log,
        msg: `Make: ${label} yuborilmadi — keyingi tick'da qayta urinish (${claim.attempts}/${INSTAGRAM_DIGEST_MAX_ATTEMPTS})`,
        error: message,
      })
      return { status: 'retry' as const, reason: message }
    }
    payload.logger.error({ ...log, msg: `Make: ${label} yuborilmadi`, error: message })
    await sendMakeAlert(payload, `${label} Make’ga yuborilmadi: ${message}`, deps)
    return { status: 'failed' as const, reason: message }
  }

  // --- Bitta post — odatdagi rasmli post (holat — `social-deliveries`) ---
  if (selected.length === 1) {
    const [item] = selected
    const result = await runMakeWebhook(
      payload,
      { postId: item!.id, script: INSTAGRAM_SCRIPT, event: MAKE_EVENT },
      { deps },
    )
    if (result.status === 'failed')
      return failOrRetry(result.reason ?? 'make.webhook xatosi', 'single')
    const sent = result.status !== 'skipped'
    const delivery = sent
      ? await findMakeDelivery(payload, makeDeliveryKey(item!.id, MAKE_EVENT, INSTAGRAM_SCRIPT))
      : null
    await updateDigest(payload, claim.id, {
      status: sent ? 'sent' : 'empty',
      format: 'single',
      posts: sent ? [item!.id] : [],
      skippedPosts: overflow,
      httpStatus: result.httpStatus ?? null,
      deliveryId: delivery?.deliveryId ?? null,
      sentAt: sent ? new Date(deps.now()).toISOString() : null,
      // `retry` — `make.webhook` job'i keyinroq yuboradi (holat — post panelida).
      error: result.status === 'retry' || !sent ? (result.reason ?? null) : null,
    })
    return { status: sent ? 'single' : 'empty', posts: sent ? 1 : 0, reason: result.reason }
  }

  // --- Karusel ---
  const origin = deps.origin()
  const posts = await loadPosts(
    payload,
    selected.map((item) => item.id),
    origin,
  )
  const included = new Set(posts.map((data) => data.post.id))
  // Tanlangandan keyin chop etilmagan qilingan post — tushirib qoldiriladi (keyingi slot oladi).
  if (posts.length === 0) {
    await updateDigest(payload, claim.id, { status: 'empty', posts: [], skippedPosts: overflow })
    return { status: 'empty', posts: 0 }
  }
  const deliveryId = claim.deliveryId || deps.uuid()
  const body = buildDigestPayloadFor(
    payload,
    { key, slotAt, posts, config, test: false, deliveryId },
    deps,
  )
  const coverUrl = body.slides[0]!.imageUrl
  await updateDigest(payload, claim.id, { deliveryId, coverUrl, format: 'carousel' })
  const result = await postToMake(
    {
      url: config.webhookUrl,
      body: JSON.stringify(body),
      event: 'digest.published',
      deliveryId,
      secret: config.secret,
    },
    deps,
  )
  if (!result.ok) {
    await updateDigest(payload, claim.id, { httpStatus: result.status })
    // Xatoda postlar yozilmaydi — boshqa dayjestga "band" bo'lib qolmasin.
    return failOrRetry(result.message, 'carousel')
  }
  await updateDigest(payload, claim.id, {
    status: 'sent',
    format: 'carousel',
    posts: posts.map((data) => data.post.id),
    skippedPosts: overflow,
    httpStatus: result.status,
    sentAt: new Date(deps.now()).toISOString(),
    error: null,
  })
  payload.logger.info({
    ...log,
    deliveryId,
    msg: `Make: ${label} yuborildi`,
    posts: included.size,
    skipped: overflow.length,
  })
  return { status: 'sent', posts: included.size, skipped: overflow.length }
}

/**
 * Nashr tick'ining Instagram dayjest bosqichi. Make o'chiq, rejim `post`, webhook URL yoki lotin
 * yozuvi yo'q, slot vaqti emas — hech narsa.
 */
export async function runInstagramDigests(
  payload: Payload,
  options: { now?: number; deps?: MakeDeps } = {},
): Promise<InstagramDigestRunResult> {
  const deps = options.deps ?? makeDeps
  const now = options.now ?? deps.now()
  const config = await loadMakeConfig(payload)
  const result: InstagramDigestRunResult = {
    mode: config.instagramMode,
    slotAt: null,
    status: 'off',
  }
  if (!config.enabled || config.instagramMode !== 'story+digest') return result
  if (!config.webhookUrl) return { ...result, status: 'skipped', reason: 'no-url' }
  if (!config.scripts.includes(INSTAGRAM_SCRIPT)) {
    return { ...result, status: 'skipped', reason: 'script-disabled' }
  }
  const slotAt = dueSlot(now, config.instagramDigestTimes)
  if (slotAt === null) return result
  result.slotAt = new Date(slotAt).toISOString()
  try {
    const webhookUrl = config.webhookUrl
    return {
      ...result,
      ...(await processSlot(payload, slotAt, { ...config, webhookUrl }, deps, now)),
    }
  } catch (error) {
    // Kutilmagan (DB) xato: qator `pending` da qoladi — 10 daqiqadan keyin qayta band qilinadi.
    payload.logger.error({ err: error, msg: 'Make: Instagram dayjest xatosi' })
    return { ...result, status: 'failed', reason: (error as Error)?.message }
  }
}

// ---------------------------------------------------------------------------
// Sinov (admin)
// ---------------------------------------------------------------------------

/** Sinov dayjestidagi postlar: tanlangan post + eng yangi chop etilganlari (jami ko'pi bilan 5). */
export const DIGEST_TEST_POSTS = 5

/**
 * Sinov: `type: "digest"` JSON'i `test: true` bilan (holat yozilmaydi, `enabled` shart emas) —
 * tanlangan post va oxirgi chop etilgan postlar bo'yicha. Make'da karusel maydonlarini xaritalash
 * uchun.
 */
export async function sendDigestTest(
  payload: Payload,
  options: { postId: number },
  deps: MakeDeps = makeDeps,
): Promise<MakeTestResult> {
  const config = await loadMakeConfig(payload)
  if (!config.webhookUrl) {
    return {
      ok: false,
      httpStatus: 0,
      message: 'Webhook URL sozlanmagan (Ijtimoiy tarmoqlar (Make) yoki MAKE_WEBHOOK_URL).',
    }
  }
  const origin = deps.origin()
  const { docs } = await payload.find({
    collection: 'posts',
    draft: false,
    depth: 0,
    overrideAccess: true,
    where: {
      and: [
        { _status: { equals: 'published' } },
        { workflowStatus: { equals: 'published' } },
        { id: { not_equals: options.postId } },
      ],
    },
    select: { publishedAt: true },
    sort: '-publishedAt',
    limit: DIGEST_TEST_POSTS - 1,
  })
  const first = await loadSocialPost(payload, options.postId, INSTAGRAM_SCRIPT, origin)
  if (!first) {
    return {
      ok: false,
      httpStatus: 0,
      message: 'Post chop etilmagan — sinov uchun chop etilgan postni oching.',
    }
  }
  const posts = [
    first,
    ...(await loadPosts(
      payload,
      docs.map((doc) => doc.id),
      origin,
    )),
  ]
  const deliveryId = deps.uuid()
  const slotAt = deps.now()
  const body = buildDigestPayloadFor(
    payload,
    { key: 'ig-digest:test', slotAt, posts, config, test: true, deliveryId },
    deps,
  )
  const result = await postToMake(
    {
      url: config.webhookUrl,
      body: JSON.stringify(body),
      event: 'digest.published',
      deliveryId,
      secret: config.secret,
    },
    deps,
  )
  payload.logger.info({
    postId: options.postId,
    deliveryId,
    httpStatus: result.status,
    msg: `Make: dayjest sinovi yuborildi — ${result.message}`,
  })
  return {
    ok: result.ok,
    httpStatus: result.status,
    message: result.ok ? 'Sinov yuborildi (digest, test: true).' : result.message,
    payload: body,
  }
}
