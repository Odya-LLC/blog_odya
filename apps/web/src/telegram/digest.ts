import { DEFAULT_LOCALE, type Locale, LOCALES } from '@blog-odya/shared/locales'
import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import {
  DEFAULT_QUEUE,
  TELEGRAM_DIGEST_EDIT_TASK,
  TELEGRAM_DIGEST_LOOKBACK_MAX_MS,
  TELEGRAM_DIGEST_MAX_ATTEMPTS,
  TELEGRAM_DIGEST_PENDING_STALE_MS,
} from '@/jobs/constants'
import { keepReqLocale } from '@/lib/hookReq'
import type { Category, Post, Tag, TelegramDigest } from '@/payload-types'
import { homePath } from '@/site/paths'
import { getTransliterator } from '@/translit/transliterator'

import {
  callWithRetries,
  drizzleFor,
  populated,
  type RetryContext,
  runTelegramPost,
  sendAlert,
  type TelegramDeps,
  telegramDeps,
} from './autopost'
import {
  buildPostUrl,
  CAPTION_LIMIT,
  coverPhotoUrl,
  messageHash,
  transformTemplateText,
  UTM_CAMPAIGN,
} from './caption'
import { type TelegramApi } from './client'
import { loadTelegramConfig, type TelegramConfig, type TelegramMode } from './config'
import {
  buildDigestCaption,
  digestDateParts,
  digestHashtags,
  type DigestItem,
  digestPhotos,
  orderDigestItems,
  renderDigestFooter,
  renderDigestHeader,
} from './digestCaption'
import { dueDigestSlot, previousDigestSlot } from './digestSchedule'

/**
 * Telegram dayjesti (OBLOG-116, TZ §7.1) — har `/api/jobs/run` nashr tick'ida (`mode=publish|all`,
 * nashr job'laridan keyin; `autorun` da ham) chaqiriladi.
 *
 * 1. Rejim `digest`/`hybrid` bo'lsa — hozirgi slot (`dueDigestSlot`, Toshkent vaqti; kechikkan slot
 *    yuborilmaydi, postlari keyingisiga qo'shiladi).
 * 2. Har faol kanal uchun `telegram-digests` qatori **atomar band qilinadi** (`claimDigest`: UNIQUE
 *    `key` + `INSERT … ON CONFLICT DO UPDATE … WHERE … RETURNING`). Qator olinmasa — boshqa tick
 *    yuboryapti yoki allaqachon yuborilgan: hech narsa qilinmaydi. Qayta band qilish — faqat
 *    `retry` holatida yoki uzilib qolgan `pending` da (`TELEGRAM_DIGEST_PENDING_STALE_MS`), ko'pi
 *    bilan `TELEGRAM_DIGEST_MAX_ATTEMPTS` marta.
 * 3. Postlar: chop etilgan, `telegramSkip` siz, oyna ichida (oxirgi yuborilgan/bo'sh slotdan — ko'pi
 *    bilan 24 soat — shu slotgacha), shu kanalga alohida yuborilmagan (`telegram[].messageId`) va
 *    hech bir dayjestda (`posts` / `skippedPosts`) bo'lmagan; aralash rejimda "Tezkor"lar — yo'q.
 *    Tartib — `digestPriority`, keyin yangiligi; `maxItems` dan ortig'i va caption'ga sig'maganlar —
 *    `skippedPosts` (Telegram'ga umuman yuborilmaydi).
 * 4. 0 post — `empty`; 1 post — odatdagi alohida xabar (`runTelegramPost`, `telegram[]` holati bilan,
 *    keyingi tahrirlash — `telegram.post`); 2+ — galereya (`sendMediaGroup`, ≥ 2 muqova), bitta
 *    muqova — `sendPhoto`, muqovasiz — `sendMessage`. Rasm rad etilsa (400) — matnli xabar.
 *
 * Sarlavha tahrirlansa (post qayta chop etilsa) — `telegram.digestEdit` job'i caption'ni qayta
 * yig'adi va xesh o'zgargan bo'lsa `editMessageCaption` / `editMessageText` (`runTelegramDigestEdit`).
 *
 * Holat yozuvlari tranzaksiyasiz (darhol commit) — xabar yuborilgan zahoti saqlanadi.
 */

export type DigestFormat = 'album' | 'photo' | 'text' | 'single'

export interface TelegramDigestScriptResult {
  script: Locale
  status: 'sent' | 'single' | 'empty' | 'busy' | 'retry' | 'failed' | 'skipped'
  posts?: number
  skipped?: number
  reason?: string
}

export interface TelegramDigestRunResult {
  mode: TelegramMode
  /** Ishlangan slot (ISO); rejim `post`, tun yoki token yo'q bo'lsa — `null`. */
  slotAt: string | null
  scripts: TelegramDigestScriptResult[]
}

const SCRIPT_LABEL: Record<Locale, string> = { 'uz-Latn': 'lotin', 'uz-Cyrl': 'kirill' }

export function digestKey(script: Locale, slotAt: number): string {
  return `digest:${script}:${new Date(slotAt).toISOString()}`
}

// ---------------------------------------------------------------------------
// Band qilish (idempotentlik)
// ---------------------------------------------------------------------------

/**
 * Qatorni atomar band qiladi: yangi bo'lsa — yaratadi (`pending`, 1-urinish); bor bo'lsa — faqat
 * `retry` yoki uzilib qolgan `pending` holatida (urinishlar tugamagan bo'lsa) qayta `pending` ga
 * o'tkazadi. Parallel tick: ikkinchi `INSERT` birinchisining qulfini kutadi va yangilangan qatorda
 * `WHERE` bajarilmaydi — `null`.
 */
export async function claimDigest(
  payload: Payload,
  input: { key: string; script: Locale; slotAt: number; chatId: string; now: number },
): Promise<{ id: number; attempts: number } | null> {
  const db = await drizzleFor(payload)
  const now = new Date(input.now).toISOString()
  const staleBefore = new Date(input.now - TELEGRAM_DIGEST_PENDING_STALE_MS).toISOString()
  const result = (await db.execute(sql`
    INSERT INTO "telegram_digests"
      ("key", "script", "slot_at", "status", "chat_id", "attempts", "updated_at", "created_at")
    VALUES (${input.key}, ${input.script}::"enum_telegram_digests_script",
      ${new Date(input.slotAt).toISOString()}::timestamptz,
      'pending'::"enum_telegram_digests_status", ${input.chatId}, 1, ${now}::timestamptz,
      ${now}::timestamptz)
    ON CONFLICT ("key") DO UPDATE SET
      "status" = 'pending'::"enum_telegram_digests_status",
      "attempts" = COALESCE("telegram_digests"."attempts", 0) + 1,
      "chat_id" = EXCLUDED."chat_id",
      "error" = NULL,
      "updated_at" = EXCLUDED."updated_at"
    WHERE COALESCE("telegram_digests"."attempts", 0) < ${TELEGRAM_DIGEST_MAX_ATTEMPTS}
      AND (
        "telegram_digests"."status" = 'retry'::"enum_telegram_digests_status"
        OR ("telegram_digests"."status" = 'pending'::"enum_telegram_digests_status"
          AND "telegram_digests"."updated_at" < ${staleBefore}::timestamptz)
      )
    RETURNING "id", "attempts"
  `)) as unknown as { rows: { id: number; attempts: string | number }[] }
  const row = result.rows[0]
  return row ? { id: Number(row.id), attempts: Number(row.attempts) } : null
}

async function updateDigest(
  payload: Payload,
  id: number,
  data: Partial<Omit<TelegramDigest, 'posts' | 'skippedPosts'>> & {
    posts?: number[]
    skippedPosts?: number[]
  },
): Promise<void> {
  await payload.update({ collection: 'telegram-digests', id, data, depth: 0 })
}

// ---------------------------------------------------------------------------
// Postlar
// ---------------------------------------------------------------------------

type DigestPost = Pick<
  Post,
  | 'id'
  | 'title'
  | 'slug'
  | 'socialTitle'
  | 'meta'
  | 'category'
  | 'tags'
  | 'coverImage'
  | 'digestPriority'
  | 'telegramUrgent'
  | 'telegramSkip'
  | 'publishedAt'
  | 'telegram'
>

const POST_SELECT = {
  title: true,
  slug: true,
  socialTitle: true,
  meta: { title: true },
  category: true,
  tags: true,
  coverImage: true,
  digestPriority: true,
  telegramUrgent: true,
  telegramSkip: true,
  publishedAt: true,
  telegram: true,
} as const

function toItem(post: DigestPost, script: Locale, origin: string): DigestItem | null {
  const category = populated<Category>(post.category)
  if (!category?.slug || !post.slug) return null
  return {
    id: post.id,
    title: post.title,
    socialTitle: post.socialTitle,
    metaTitle: post.meta?.title,
    url: buildPostUrl({ origin, locale: script, categorySlug: category.slug, slug: post.slug }),
    photoUrl: coverPhotoUrl(populated(post.coverImage), origin),
    priority: Number(post.digestPriority) || 0,
    publishedAt: post.publishedAt ?? null,
    tagNames: [...(post.tags ?? []).map((tag) => populated<Tag>(tag)?.name), category.name],
  }
}

/** Oyna boshi: oxirgi yuborilgan/bo'sh slot (ko'pi bilan 24 soat orqaga), bo'lmasa — oldingi slot. */
async function windowStart(
  payload: Payload,
  script: Locale,
  slotAt: number,
  config: TelegramConfig,
): Promise<number> {
  const { docs } = await payload.find({
    collection: 'telegram-digests',
    where: {
      and: [
        { script: { equals: script } },
        { slotAt: { less_than: new Date(slotAt).toISOString() } },
        { status: { in: ['sent', 'empty'] } },
      ],
    },
    sort: '-slotAt',
    limit: 1,
    depth: 0,
    select: { slotAt: true },
  })
  const last = docs[0]?.slotAt ? Date.parse(docs[0].slotAt) : NaN
  const start = Number.isNaN(last) ? previousDigestSlot(slotAt, config.digest) : last
  return Math.max(start, slotAt - TELEGRAM_DIGEST_LOOKBACK_MAX_MS)
}

/** Shu kanal dayjestlariga (o'zidan boshqa) allaqachon kirgan yoki sig'magan postlar. */
async function postsInOtherDigests(
  payload: Payload,
  script: Locale,
  digestId: number,
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) return new Set()
  const { docs } = await payload.find({
    collection: 'telegram-digests',
    where: {
      and: [
        { script: { equals: script } },
        { id: { not_equals: digestId } },
        { or: [{ posts: { in: ids } }, { skippedPosts: { in: ids } }] },
      ],
    },
    depth: 0,
    pagination: false,
    limit: 0,
    select: { posts: true, skippedPosts: true },
  })
  const used = new Set<number>()
  for (const doc of docs) {
    for (const value of [...(doc.posts ?? []), ...(doc.skippedPosts ?? [])]) {
      used.add(typeof value === 'object' ? value.id : value)
    }
  }
  return used
}

async function digestCandidates(
  payload: Payload,
  script: Locale,
  digestId: number,
  slotAt: number,
  config: TelegramConfig,
  origin: string,
): Promise<DigestItem[]> {
  const start = await windowStart(payload, script, slotAt, config)
  const { docs } = (await payload.find({
    collection: 'posts',
    locale: script,
    fallbackLocale: DEFAULT_LOCALE,
    draft: false,
    depth: 1,
    overrideAccess: true,
    where: {
      and: [
        { _status: { equals: 'published' } },
        { workflowStatus: { equals: 'published' } },
        { publishedAt: { greater_than: new Date(start).toISOString() } },
        { publishedAt: { less_than_equal: new Date(slotAt).toISOString() } },
      ],
    },
    select: POST_SELECT,
    sort: '-publishedAt',
    limit: 200,
  })) as unknown as { docs: DigestPost[] }

  const fresh = docs.filter(
    (post) =>
      !post.telegramSkip &&
      !(config.mode === 'hybrid' && post.telegramUrgent) &&
      // Shu kanalga alohida yuborilgan (`post` rejimida yoki "Tezkor") — dayjestga kirmaydi.
      !(post.telegram ?? []).some((entry) => entry.script === script && entry.messageId),
  )
  const used = await postsInOtherDigests(
    payload,
    script,
    digestId,
    fresh.map((post) => post.id),
  )
  return fresh
    .filter((post) => !used.has(post.id))
    .map((post) => toItem(post, script, origin))
    .filter((item): item is DigestItem => item !== null)
}

// ---------------------------------------------------------------------------
// Caption
// ---------------------------------------------------------------------------

export interface DigestFrame {
  header: string
  footer: string
}

/** Sarlavha va pastki qator (kirill kanal — shablon matni transliteratsiya qilinadi). */
export async function digestFrame(
  payload: Payload,
  script: Locale,
  slotAt: number,
  config: TelegramConfig,
  origin: string,
): Promise<DigestFrame> {
  let { header, footer } = config.digest
  if (script === 'uz-Cyrl') {
    const transliterator = await getTransliterator(payload)
    const toCyrl = (text: string) => transliterator.toCyrillic(text)
    header = transformTemplateText(header, toCyrl)
    footer = transformTemplateText(footer, toCyrl)
  }
  const home = new URL(homePath(script), `${origin.replace(/\/+$/, '')}/`)
  home.searchParams.set('utm_source', 'telegram')
  home.searchParams.set('utm_medium', 'channel')
  home.searchParams.set('utm_campaign', UTM_CAMPAIGN[script])
  return {
    header: renderDigestHeader(header, digestDateParts(slotAt, script)),
    footer: renderDigestFooter(footer, {
      url: home.toString(),
      label: new URL(origin).host.replace(/^www\./, ''),
    }),
  }
}

// ---------------------------------------------------------------------------
// Yuborish
// ---------------------------------------------------------------------------

function noRequeue(deps: TelegramDeps): RetryContext {
  // Uzoq pauza (429 `retry_after`) — keyingi tick'da (qator `retry` holatida qoladi).
  return { attempt: 0, deps, requeue: async () => {} }
}

interface SentDigest {
  format: Exclude<DigestFormat, 'single'>
  messageIds: string[]
}

async function sendDigestMessage(
  api: TelegramApi,
  chatId: string,
  html: string,
  photos: string[],
  deps: TelegramDeps,
) {
  const send = (format: SentDigest['format']) =>
    callWithRetries<SentDigest>(async () => {
      if (format === 'album') {
        const messages = await api.sendMediaGroup(
          chatId,
          photos.map((media, index) => ({
            type: 'photo' as const,
            media,
            ...(index === 0 ? { caption: html, parse_mode: 'HTML' as const } : {}),
          })),
        )
        return { format, messageIds: messages.map((message) => String(message.message_id)) }
      }
      const message =
        format === 'photo'
          ? await api.sendPhoto(chatId, photos[0]!, { caption: html, parse_mode: 'HTML' })
          : await api.sendMessage(chatId, html, {
              parse_mode: 'HTML',
              link_preview_options: { is_disabled: true },
            })
      return { format, messageIds: [String(message.message_id)] }
    }, noRequeue(deps))

  const first = photos.length >= 2 ? 'album' : photos.length === 1 ? 'photo' : 'text'
  const result = await send(first)
  // Telegram rasm(lar)ni ololmadi (URL/format) — rasmsiz matnli xabar.
  if (!result.ok && !result.retryScheduled && first !== 'text' && result.failure.code === 400) {
    return { result: await send('text'), photoRejected: result.failure.message }
  }
  return { result, photoRejected: null }
}

async function processScript(
  payload: Payload,
  script: Locale,
  slotAt: number,
  config: TelegramConfig,
  deps: TelegramDeps,
  now: number,
): Promise<TelegramDigestScriptResult> {
  const channel = config.channels[script]!
  const key = digestKey(script, slotAt)
  const claim = await claimDigest(payload, {
    key,
    script,
    slotAt,
    chatId: channel.chatId,
    now,
  })
  if (!claim) return { script, status: 'busy' }
  const log = { digest: key, script }
  const label = `Dayjest ${new Date(slotAt).toISOString()} (${SCRIPT_LABEL[script]} kanal, ${channel.chatId})`

  const origin = deps.origin()
  const candidates = orderDigestItems(
    await digestCandidates(payload, script, claim.id, slotAt, config, origin),
  )
  const overflow = candidates.slice(config.digest.maxItems).map((item) => item.id)
  const selected = candidates.slice(0, config.digest.maxItems)

  if (selected.length === 0) {
    await updateDigest(payload, claim.id, { status: 'empty', posts: [], skippedPosts: [] })
    return { script, status: 'empty', posts: 0 }
  }

  const failOrRetry = async (message: string, format?: DigestFormat) => {
    const final = claim.attempts >= TELEGRAM_DIGEST_MAX_ATTEMPTS
    await updateDigest(payload, claim.id, {
      ...(format ? { format } : {}),
      status: final ? 'failed' : 'retry',
      error: message,
    })
    if (!final) {
      payload.logger.warn({
        ...log,
        msg: `Telegram: ${label} yuborilmadi — keyingi tick'da qayta urinish (${claim.attempts}/${TELEGRAM_DIGEST_MAX_ATTEMPTS})`,
        error: message,
      })
      return { script, status: 'retry' as const, reason: message }
    }
    payload.logger.error({ ...log, msg: `Telegram: ${label} yuborilmadi`, error: message })
    if (config.token) {
      await sendAlert(
        payload,
        deps.createApi(config.token),
        config,
        `${label} yuborilmadi: ${message}`,
      )
    }
    return { script, status: 'failed' as const, reason: message }
  }

  // --- Bitta post — odatdagi alohida xabar (holat `posts.telegram[]` da) ---
  if (selected.length === 1) {
    const [item] = selected
    const result = await runTelegramPost(payload, { postId: item!.id, script }, { deps })
    if (result.status === 'failed') {
      return failOrRetry(result.reason ?? 'telegram.post xatosi', 'single')
    }
    const sent = result.status !== 'skipped'
    await updateDigest(payload, claim.id, {
      status: sent ? 'sent' : 'empty',
      format: 'single',
      posts: sent ? [item!.id] : [],
      skippedPosts: overflow,
      messageIds: result.messageId ? [result.messageId] : null,
      sentAt: sent ? new Date(deps.now()).toISOString() : null,
      // `retry` — `telegram.post` job'i keyinroq yuboradi (holat — postning Telegram panelida).
      error: result.status === 'retry' || !sent ? (result.reason ?? null) : null,
    })
    return { script, status: sent ? 'single' : 'empty', posts: sent ? 1 : 0, reason: result.reason }
  }

  // --- Galereya / rasm / matn ---
  const frame = await digestFrame(payload, script, slotAt, config, origin)
  const caption = buildDigestCaption({
    ...frame,
    hashtags: digestHashtags(selected, config.hashtagsCount),
    items: selected,
    limit: CAPTION_LIMIT,
    allowDrop: true,
  })
  if (!caption)
    return failOrRetry('Caption 1024 belgiga sig‘madi (sarlavha/pastki qator shabloni juda uzun)')
  const included = selected.slice(0, caption.count)
  const skipped = [...selected.slice(caption.count).map((item) => item.id), ...overflow]
  // Heshteglar faqat captionga kirgan postlardan.
  const html =
    caption.count === selected.length
      ? caption.html
      : (buildDigestCaption({
          ...frame,
          hashtags: digestHashtags(included, config.hashtagsCount),
          items: included,
          limit: CAPTION_LIMIT,
          allowDrop: false,
        })?.html ?? caption.html)

  if (!config.token) return failOrRetry('TELEGRAM_BOT_TOKEN sozlanmagan')
  const api = deps.createApi(config.token)
  const photos = digestPhotos(included, config.digest.maxPhotos)
  const { result, photoRejected } = await sendDigestMessage(api, channel.chatId, html, photos, deps)
  if (photoRejected) {
    payload.logger.warn({
      ...log,
      msg: 'Telegram: dayjest rasmlari rad etildi — matnli xabar yuborildi',
      error: photoRejected,
    })
  }
  // Xatoda postlar yozilmaydi: ular boshqa dayjestga "band" bo'lib qolmasin (keyingi urinish yoki
  // keyingi slot ularni qayta tanlaydi).
  if (!result.ok) return failOrRetry(result.failure.message)
  const sent = result.value!
  await updateDigest(payload, claim.id, {
    status: 'sent',
    format: sent.format,
    chatId: channel.chatId,
    posts: included.map((item) => item.id),
    skippedPosts: skipped,
    messageIds: sent.messageIds,
    hash: messageHash(html),
    sentAt: new Date(deps.now()).toISOString(),
    error: null,
  })
  payload.logger.info({
    ...log,
    msg: `Telegram: ${label} yuborildi`,
    posts: included.length,
    skipped: skipped.length,
    messageIds: sent.messageIds,
  })
  return { script, status: 'sent', posts: included.length, skipped: skipped.length }
}

/**
 * Nashr tick'ining dayjest bosqichi. Rejim `post`, tun (slot yo'q) yoki token sozlanmagan — hech
 * narsa. Kanallar ketma-ket; bitta kanal xatosi ikkinchisiga ta'sir qilmaydi.
 */
export async function runTelegramDigests(
  payload: Payload,
  options: { now?: number; deps?: TelegramDeps } = {},
): Promise<TelegramDigestRunResult> {
  const deps = options.deps ?? telegramDeps
  const now = options.now ?? deps.now()
  const config = await loadTelegramConfig(payload)
  const result: TelegramDigestRunResult = { mode: config.mode, slotAt: null, scripts: [] }
  if (config.mode === 'post') return result
  if (!config.token) {
    payload.logger.warn({ msg: 'Telegram: TELEGRAM_BOT_TOKEN sozlanmagan — dayjest o‘tkazildi' })
    return result
  }
  const slotAt = dueDigestSlot(now, config.digest)
  if (slotAt === null) return result
  result.slotAt = new Date(slotAt).toISOString()

  for (const script of LOCALES) {
    if (!config.channels[script]) {
      result.scripts.push({ script, status: 'skipped', reason: 'no-channel' })
      continue
    }
    try {
      result.scripts.push(await processScript(payload, script, slotAt, config, deps, now))
    } catch (error) {
      // Kutilmagan (DB) xato: qator `pending` da qoladi — 10 daqiqadan keyin qayta band qilinadi.
      payload.logger.error({ err: error, script, msg: 'Telegram: dayjest xatosi' })
      result.scripts.push({ script, status: 'failed', reason: (error as Error)?.message })
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Tahrirlash (`telegram.digestEdit`)
// ---------------------------------------------------------------------------

export interface TelegramDigestEditInput {
  digestId: number
  attempt?: number | null
}

export interface TelegramDigestEditOutput {
  status: 'edited' | 'unchanged' | 'skipped' | 'retry' | 'failed'
  reason?: string
}

const relationIds = (values: TelegramDigest['posts']) =>
  (values ?? []).map((value) => (typeof value === 'object' ? value.id : value))

/**
 * Yuborilgan dayjest caption'ini postlarning hozirgi sarlavhalari bilan qayta yig'adi (bandlar va
 * rasmlar o'zgarmaydi) va xesh farq qilsa — `editMessageCaption` (galereya/rasm, birinchi xabar) yoki
 * `editMessageText`.
 */
export async function runTelegramDigestEdit(
  payload: Payload,
  input: TelegramDigestEditInput,
  options: { req?: PayloadRequest; deps?: TelegramDeps } = {},
): Promise<TelegramDigestEditOutput> {
  const deps = options.deps ?? telegramDeps
  const config = await loadTelegramConfig(payload)
  if (!config.token) return { status: 'skipped', reason: 'no-token' }
  const digest = (await payload.findByID({
    collection: 'telegram-digests',
    id: input.digestId,
    depth: 0,
    disableErrors: true,
  })) as TelegramDigest | null
  if (!digest) return { status: 'skipped', reason: 'not-found' }
  const messageId = Number((digest.messageIds as unknown[] | null)?.[0])
  if (
    digest.status !== 'sent' ||
    !digest.format ||
    digest.format === 'single' ||
    !digest.chatId ||
    !Number.isInteger(messageId)
  ) {
    return { status: 'skipped', reason: 'not-editable' }
  }
  const script = digest.script as Locale
  const ids = relationIds(digest.posts)
  const origin = deps.origin()
  const { docs } = (await payload.find({
    collection: 'posts',
    locale: script,
    fallbackLocale: DEFAULT_LOCALE,
    draft: false,
    depth: 1,
    overrideAccess: true,
    where: { id: { in: ids } },
    select: POST_SELECT,
    pagination: false,
    limit: 0,
  })) as unknown as { docs: DigestPost[] }
  const byId = new Map(docs.map((post) => [post.id, post]))
  // Tartib — yuborilgandagidek (rasmlar raqamlari bilan mos); o'chirilgan post tushib qoladi.
  const items = ids
    .map((id) => byId.get(id))
    .map((post) => (post ? toItem(post, script, origin) : null))
    .filter((item): item is DigestItem => item !== null)
  if (items.length === 0) return { status: 'skipped', reason: 'no-posts' }

  const slotAt = Date.parse(digest.slotAt)
  const frame = await digestFrame(payload, script, slotAt, config, origin)
  const caption = buildDigestCaption({
    ...frame,
    hashtags: digestHashtags(items, config.hashtagsCount),
    items,
    limit: CAPTION_LIMIT,
    allowDrop: false,
  })
  if (!caption) return { status: 'skipped', reason: 'caption-too-long' }
  const hash = messageHash(caption.html)
  if (hash === digest.hash && !digest.error) return { status: 'unchanged' }

  const api = deps.createApi(config.token)
  const retry: RetryContext = {
    attempt: Math.max(0, Number(input.attempt ?? 0) || 0),
    deps,
    requeue: async (attempt, waitMs) => {
      await payload.jobs.queue({
        task: TELEGRAM_DIGEST_EDIT_TASK,
        queue: DEFAULT_QUEUE,
        input: { digestId: digest.id, attempt },
        waitUntil: new Date(deps.now() + waitMs),
        req: options.req,
      })
    },
  }
  const result = await callWithRetries<unknown>(
    () =>
      digest.format === 'text'
        ? api.editMessageText(digest.chatId!, messageId, caption.html, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
          })
        : api.editMessageCaption(digest.chatId!, messageId, {
            caption: caption.html,
            parse_mode: 'HTML',
          }),
    retry,
  )
  const label = `Dayjest ${digest.slotAt} (${SCRIPT_LABEL[script]} kanal, ${digest.chatId})`
  if (!result.ok) {
    await updateDigest(payload, digest.id, { error: result.failure.message })
    if (result.retryScheduled) return { status: 'retry', reason: result.failure.message }
    payload.logger.error({
      digestId: digest.id,
      msg: `Telegram: ${label} tahrirlanmadi`,
      error: result.failure.message,
    })
    if (!result.failure.messageGone) {
      await sendAlert(payload, api, config, `${label} tahrirlanmadi: ${result.failure.message}`)
    }
    return { status: 'failed', reason: result.failure.message }
  }
  await updateDigest(payload, digest.id, { hash, error: null })
  payload.logger.info({ digestId: digest.id, msg: `Telegram: ${label} tahrirlandi` })
  return { status: 'edited' }
}

/**
 * Post qayta chop etilganda (`queueTelegramAfterChange`, post saqlash tranzaksiyasida — `req`):
 * post kirgan yuborilgan dayjestlar uchun `telegram.digestEdit` job'lari (tugallanmagan job bo'lsa —
 * yangisi qo'yilmaydi; xesh o'zgarmagan bo'lsa job hech narsa qilmaydi).
 */
export async function queueDigestEdits(
  payload: Payload,
  postId: number,
  req: PayloadRequest,
): Promise<(number | string)[]> {
  const { docs } = await keepReqLocale(req, () =>
    payload.find({
      collection: 'telegram-digests',
      where: {
        and: [
          { posts: { in: [postId] } },
          { status: { equals: 'sent' } },
          { format: { in: ['album', 'photo', 'text'] } },
        ],
      },
      depth: 0,
      limit: 10,
      select: { slotAt: true },
      req,
    }),
  )
  const ids: (number | string)[] = []
  for (const digest of docs) {
    const { totalDocs } = await payload.count({
      collection: 'payload-jobs',
      where: {
        and: [
          { taskSlug: { equals: TELEGRAM_DIGEST_EDIT_TASK } },
          { 'input.digestId': { equals: digest.id } },
          { completedAt: { exists: false } },
          { hasError: { not_equals: true } },
        ],
      },
      req,
    })
    if (totalDocs > 0) continue
    const job = await payload.jobs.queue({
      task: TELEGRAM_DIGEST_EDIT_TASK,
      queue: DEFAULT_QUEUE,
      input: { digestId: digest.id },
      req,
    })
    ids.push(job.id)
  }
  return ids
}
