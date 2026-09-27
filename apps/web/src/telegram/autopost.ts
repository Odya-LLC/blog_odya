import { randomBytes } from 'node:crypto'

import { DEFAULT_LOCALE, type Locale, LOCALES } from '@blog-odya/shared/locales'
import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { getRunDeadline } from '@/jobs/context'
import {
  DEFAULT_QUEUE,
  TELEGRAM_API_TIMEOUT_MS,
  TELEGRAM_INLINE_WAIT_MAX_MS,
  TELEGRAM_MAX_RETRIES,
  TELEGRAM_POST_TASK,
  TELEGRAM_RETRY_BACKOFF_MS,
} from '@/jobs/constants'
import { escapeTelegramHtml } from '@/lib/telegram'
import type { Category, Post, Tag } from '@/payload-types'
import { siteOrigin } from '@/site/seo/config'
import { getTransliterator } from '@/translit/transliterator'

import {
  buildHashtags,
  buildMessageText,
  buildPostUrl,
  type CaptionValues,
  coverPhotoUrl,
  MESSAGE_LIMITS,
  messageHash,
  type TelegramMessageKind,
  transformTemplateText,
} from './caption'
import {
  classifyTelegramError,
  createTelegramApi,
  type TelegramApi,
  type TelegramFailure,
} from './client'
import { loadTelegramConfig, type TelegramConfig } from './config'

/**
 * `telegram.post` job mantig'i (TZ §7.1): bitta (post, yozuv) juftligi.
 *
 * - Post chop etilgan (`_status` va `workflowStatus` = `published`) va `telegramSkip` yo'q
 *   bo'lsagina ishlaydi — matn o'sha yozuvdagi locale'dan (kirill kanalga `uz-Cyrl`).
 * - Idempotentlik: `posts.telegram[]` da shu yozuv uchun `messageId` bo'lsa — qayta yuborilmaydi;
 *   matn xeshi (`hash`) o'zgargan bo'lsa (sarlavha/lid/havola) — `editMessageCaption` /
 *   `editMessageText`, o'zgarmagan bo'lsa — hech narsa.
 * - Xato: 429 `retry_after` hurmat qilinadi; 429/5xx/tarmoq — 3 marta qayta urinish (qisqa
 *   pauza task ichida, uzuni — job `waitUntil` bilan keyingi tsiklda), keyin (yoki qayta
 *   urinib bo'lmaydigan xatoda) — `alertChatId` ga ogohlantirish, `telegram[].error` ga yoziladi.
 * - Token/kanal sozlanmagan — xato emas, faqat `warn` log.
 *
 * Holat (`telegram[]`) **asosiy jadvalga** to'g'ridan-to'g'ri yoziladi (`saveTelegramEntry`, SQL,
 * hook'larsiz, yangi versiyasiz): Local API `update` yangi published versiya yaratib, muharrirning
 * saqlanmagan qoralamasini chop etib yuborishi mumkin edi. Postni saqlashda eskirgan versiya
 * qiymati holatni ezib yubormasligi uchun — `preserveTelegramState` (Posts/telegram.ts).
 */

export type TelegramEntry = NonNullable<Post['telegram']>[number]

export interface TelegramDeps {
  createApi: (token: string) => TelegramApi
  sleep: (ms: number) => Promise<void>
  now: () => number
  /** Sayt manzili (havolalar va nisbiy media URL'lari uchun). */
  origin: () => string
  /** 429 bo'lmagan xatolardagi pauzalar (1-, 2-, 3-qayta urinish oldidan). */
  retryBackoffMs: readonly number[]
  /** Task ichida kutiladigan eng uzun pauza (qolgani — `waitUntil` bilan qayta navbat). */
  inlineWaitMaxMs: number
}

export const telegramDeps: TelegramDeps = {
  createApi: createTelegramApi,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  origin: () => siteOrigin(),
  retryBackoffMs: TELEGRAM_RETRY_BACKOFF_MS,
  inlineWaitMaxMs: TELEGRAM_INLINE_WAIT_MAX_MS,
}

export interface TelegramPostInput {
  postId: number
  script: Locale
  /** Oldingi urinishlar soni (qayta navbatga qo'yilgan job'da). */
  attempt?: number | null
}

export type TelegramPostStatus = 'sent' | 'edited' | 'unchanged' | 'skipped' | 'retry' | 'failed'

export interface TelegramPostOutput {
  status: TelegramPostStatus
  reason?: string
  messageId?: string
}

const SCRIPT_LABEL: Record<Locale, string> = { 'uz-Latn': 'lotin', 'uz-Cyrl': 'kirill' }

// ---------------------------------------------------------------------------
// Holat (`posts.telegram[]`) — asosiy jadval
// ---------------------------------------------------------------------------

export async function readTelegramState(
  payload: Payload,
  postId: number | string,
  req?: Partial<PayloadRequest>,
): Promise<TelegramEntry[]> {
  const row = await payload.db.findOne<Post>({
    collection: 'posts',
    where: { id: { equals: postId } },
    select: { telegram: true },
    req,
  })
  return row?.telegram ?? []
}

type Drizzle = PostgresAdapter['drizzle']

/** `req` tranzaksiyasi ulanishi (Payload'ning ichki `getTransaction` i bilan bir xil), bo'lmasa — pool. */
export async function drizzleFor(
  payload: Payload,
  req?: Partial<PayloadRequest>,
): Promise<Drizzle> {
  const adapter = payload.db as unknown as PostgresAdapter & {
    sessions?: Record<string, { db: Drizzle }>
  }
  const id = req?.transactionID ? await req.transactionID : undefined
  return (id !== undefined && adapter.sessions?.[String(id)]?.db) || adapter.drizzle
}

/**
 * Faqat shu yozuv qatorini almashtiradi — bitta atomar SQL (tranzaksiyasiz, darhol commit):
 * `posts` qatori `FOR UPDATE` bilan qulflanadi (post saqlash bilan to'qnashmaslik uchun —
 * `lockPostRow`), o'sha yozuvning eski qatori o'chiriladi va yangisi qo'shiladi. Lotin va kirill
 * job'lari parallel ishlaydi — butun massivni "o'qib-yozish" bir-birining `messageId` ini
 * o'chirib yuborardi (dublikat yuborish). Xabar yuborilgan zahoti holat saqlanadi (job
 * tranzaksiyasi keyin qaytarilsa ham).
 */
export async function saveTelegramEntry(
  payload: Payload,
  postId: number,
  entry: TelegramEntry,
): Promise<void> {
  const db = await drizzleFor(payload)
  const order = LOCALES.indexOf(entry.script) + 1
  await db.execute(sql`
    WITH "target" AS (
      SELECT "id" FROM "posts" WHERE "id" = ${postId} FOR UPDATE
    ), "removed" AS (
      DELETE FROM "posts_telegram" AS t USING "target"
      WHERE t."_parent_id" = "target"."id"
        AND t."script" = ${entry.script}::"enum_posts_telegram_script"
    )
    INSERT INTO "posts_telegram"
      ("_order", "_parent_id", "id", "script", "chat_id", "message_id", "kind", "hash", "sent_at", "error")
    SELECT ${order}, "target"."id", ${randomBytes(12).toString('hex')},
      ${entry.script}::"enum_posts_telegram_script", ${entry.chatId ?? null},
      ${entry.messageId ?? null}, ${entry.kind ?? null}::"enum_posts_telegram_kind",
      ${entry.hash ?? null}, ${entry.sentAt ?? null}::timestamptz, ${entry.error ?? null}
    FROM "target"
  `)
}

/**
 * Post saqlanayotgan tranzaksiyada `posts` qatorini qulflaydi — `telegram[]` ni o'qish va
 * qayta yozish orasida job holat yozolmaydi (va aksincha: job yozayotgan bo'lsa, saqlash
 * yangilangan holatni o'qiydi). Tranzaksiya bo'lmasa — ta'sirsiz.
 */
export async function lockPostRow(
  payload: Payload,
  postId: number | string,
  req: Partial<PayloadRequest>,
): Promise<void> {
  if (!req.transactionID) return
  const db = await drizzleFor(payload, req)
  await db.execute(sql`SELECT "id" FROM "posts" WHERE "id" = ${Number(postId)} FOR UPDATE`)
}

// ---------------------------------------------------------------------------
// Qayta urinishlar
// ---------------------------------------------------------------------------

type CallResult<T> =
  | { ok: true; value?: T; notModified?: boolean }
  | { ok: false; failure: TelegramFailure; retryScheduled: boolean }

interface RetryContext {
  attempt: number
  requeue: (attempt: number, waitMs: number) => Promise<void>
  deps: TelegramDeps
}

function canWaitInline(waitMs: number, deps: TelegramDeps): boolean {
  if (waitMs > deps.inlineWaitMaxMs) return false
  const deadline = getRunDeadline()
  return deadline === undefined || deps.now() + waitMs + TELEGRAM_API_TIMEOUT_MS <= deadline
}

async function callWithRetries<T>(op: () => Promise<T>, ctx: RetryContext): Promise<CallResult<T>> {
  let attempt = ctx.attempt
  for (;;) {
    try {
      return { ok: true, value: await op() }
    } catch (error) {
      const failure = classifyTelegramError(error)
      if (failure.notModified) return { ok: true, notModified: true }
      if (!failure.retryable || attempt >= TELEGRAM_MAX_RETRIES) {
        return { ok: false, failure, retryScheduled: false }
      }
      const backoff = ctx.deps.retryBackoffMs
      const waitMs =
        failure.retryAfterMs ?? backoff[Math.min(attempt, backoff.length - 1)] ?? 30_000
      attempt++
      if (canWaitInline(waitMs, ctx.deps)) {
        await ctx.deps.sleep(waitMs)
        continue
      }
      await ctx.requeue(attempt, waitMs)
      return { ok: false, failure, retryScheduled: true }
    }
  }
}

// ---------------------------------------------------------------------------
// Xabar
// ---------------------------------------------------------------------------

function populated<T extends object>(value: unknown): T | null {
  return value && typeof value === 'object' ? (value as T) : null
}

export interface PreparedMessage {
  values: CaptionValues
  template: string
  url: string
  photoUrl: string | null
}

export async function prepareMessage(
  payload: Payload,
  post: Post,
  script: Locale,
  config: TelegramConfig,
  deps: TelegramDeps = telegramDeps,
): Promise<PreparedMessage | null> {
  const category = populated<Category>(post.category)
  if (!category?.slug || !post.slug) return null
  const origin = deps.origin()
  const url = buildPostUrl({ origin, locale: script, categorySlug: category.slug, slug: post.slug })
  const tagNames = (post.tags ?? []).map((tag) => populated<Tag>(tag)?.name)
  const hashtags = buildHashtags([...tagNames, category.name], config.hashtagsCount)
  let template = config.template
  if (script === 'uz-Cyrl') {
    const transliterator = await getTransliterator(payload)
    template = transformTemplateText(template, (text) => transliterator.toCyrillic(text))
  }
  return {
    values: { title: post.title, excerpt: post.excerpt, url, hashtags },
    template,
    url,
    photoUrl: coverPhotoUrl(populated(post.coverImage), origin),
  }
}

function textFor(message: PreparedMessage, kind: TelegramMessageKind): string {
  const text = buildMessageText(message.template, message.values, MESSAGE_LIMITS[kind])
  if (text) return text
  // Shablonning o'zi chegaradan uzun — faqat sarlavha va havola.
  return buildMessageText('<b>{{title}}</b>\n\n{{url}}', message.values, MESSAGE_LIMITS[kind])!
}

async function sendAlert(
  payload: Payload,
  api: TelegramApi,
  config: TelegramConfig,
  text: string,
): Promise<void> {
  if (!config.alertChatId) {
    payload.logger.error({ msg: `ALERT (alertChatId sozlanmagan): ${text}` })
    return
  }
  try {
    await api.sendMessage(
      config.alertChatId,
      `<b>Blog Odya — Telegram avtopost</b>\n${escapeTelegramHtml(text)}`,
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    )
  } catch (error) {
    payload.logger.error({
      msg: `ALERT (Telegram yuborilmadi): ${text}`,
      error: classifyTelegramError(error).message,
    })
  }
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export async function runTelegramPost(
  payload: Payload,
  input: TelegramPostInput,
  options: { req?: PayloadRequest; deps?: TelegramDeps } = {},
): Promise<TelegramPostOutput> {
  const deps = options.deps ?? telegramDeps
  const { req } = options
  const script = input.script
  const log = { postId: input.postId, script }

  // O'qishlarga job `req` i berilmaydi: bitta `jobs.run` dagi parallel job'lar bitta `req`
  // obyektini bo'lishadi (faqat `transactionID` ajratilgan), `locale` bilan Local API chaqiruvi
  // esa `req.locale` ni o'zgartiradi — lotin job'i kirill matnini o'qib qolardi. `req` faqat
  // tranzaksiya kerak bo'lgan yozuvlarda (holat, qayta navbat).
  const config = await loadTelegramConfig(payload)
  if (!config.token) {
    payload.logger.warn({ ...log, msg: 'Telegram: TELEGRAM_BOT_TOKEN sozlanmagan — o‘tkazildi' })
    return { status: 'skipped', reason: 'no-token' }
  }
  const channel = config.channels[script]
  if (!channel) {
    if (!config.disabled.includes(script)) {
      payload.logger.warn({ ...log, msg: `Telegram: ${script} kanali sozlanmagan — o‘tkazildi` })
    }
    return { status: 'skipped', reason: 'no-channel' }
  }

  const post = (await payload.findByID({
    collection: 'posts',
    id: input.postId,
    locale: script,
    fallbackLocale: DEFAULT_LOCALE,
    depth: 1,
    draft: false,
    overrideAccess: true,
    disableErrors: true,
  })) as Post | null
  if (!post) return { status: 'skipped', reason: 'not-found' }
  if (post._status !== 'published' || post.workflowStatus !== 'published') {
    return { status: 'skipped', reason: 'not-published' }
  }
  if (post.telegramSkip) return { status: 'skipped', reason: 'telegram-skip' }

  const message = await prepareMessage(payload, post, script, config, deps)
  if (!message) {
    payload.logger.warn({ ...log, msg: 'Telegram: post kategoriyasi/slug’i yo‘q — o‘tkazildi' })
    return { status: 'skipped', reason: 'no-url' }
  }

  const api = deps.createApi(config.token)
  const entry = (post.telegram ?? []).find((row) => row.script === script)
  const retry: RetryContext = {
    attempt: Math.max(0, Number(input.attempt ?? 0) || 0),
    deps,
    requeue: async (attempt, waitMs) => {
      await payload.jobs.queue({
        task: TELEGRAM_POST_TASK,
        queue: DEFAULT_QUEUE,
        input: { postId: input.postId, script, attempt },
        waitUntil: new Date(deps.now() + waitMs),
        req,
      })
    },
  }
  const label = `«${post.title}» (${SCRIPT_LABEL[script]} kanal, ${channel.chatId})`

  const fail = async (
    failure: TelegramFailure,
    retryScheduled: boolean,
    base: Partial<TelegramEntry>,
  ): Promise<TelegramPostOutput> => {
    await saveTelegramEntry(payload, post.id, { ...base, script, error: failure.message })
    if (retryScheduled) {
      payload.logger.warn({
        ...log,
        msg: `Telegram: qayta urinish rejalashtirildi — ${label}`,
        error: failure.message,
      })
      return { status: 'retry', reason: failure.message }
    }
    payload.logger.error({
      ...log,
      msg: `Telegram: yuborilmadi — ${label}`,
      error: failure.message,
    })
    await sendAlert(payload, api, config, `${label} yuborilmadi: ${failure.message}`)
    return { status: 'failed', reason: failure.message }
  }

  // --- Mavjud xabar: faqat tahrirlash (qayta yuborilmaydi) ---
  if (entry?.messageId) {
    const kind: TelegramMessageKind = entry.kind === 'photo' ? 'photo' : 'text'
    const text = textFor(message, kind)
    const hash = messageHash(text)
    if (entry.hash === hash && !entry.error)
      return { status: 'unchanged', messageId: entry.messageId }
    const chatId = entry.chatId || channel.chatId
    const messageId = Number(entry.messageId)
    const result = await callWithRetries<unknown>(
      () =>
        kind === 'photo'
          ? api.editMessageCaption(chatId, messageId, { caption: text, parse_mode: 'HTML' })
          : api.editMessageText(chatId, messageId, text, {
              parse_mode: 'HTML',
              link_preview_options: { url: message.url, prefer_large_media: true },
            }),
      retry,
    )
    if (!result.ok) return fail(result.failure, result.retryScheduled, entry)
    await saveTelegramEntry(payload, post.id, { ...entry, hash, error: null })
    payload.logger.info({ ...log, msg: `Telegram: xabar yangilandi — ${label}` })
    return { status: 'edited', messageId: entry.messageId }
  }

  // --- Yangi xabar ---
  const send = async (kind: TelegramMessageKind) => {
    const text = textFor(message, kind)
    const result = await callWithRetries<unknown>(
      () =>
        kind === 'photo'
          ? api.sendPhoto(channel.chatId, message.photoUrl!, { caption: text, parse_mode: 'HTML' })
          : api.sendMessage(channel.chatId, text, {
              parse_mode: 'HTML',
              link_preview_options: { url: message.url, prefer_large_media: true },
            }),
      retry,
    )
    return { result, text, kind }
  }

  let attemptResult = await send(message.photoUrl ? 'photo' : 'text')
  // Telegram rasmni ololmadi (URL/format) — rasmsiz, havola preview bilan.
  if (
    !attemptResult.result.ok &&
    !attemptResult.result.retryScheduled &&
    attemptResult.kind === 'photo' &&
    attemptResult.result.failure.code === 400
  ) {
    payload.logger.warn({
      ...log,
      msg: 'Telegram: sendPhoto rad etildi — sendMessage bilan yuboriladi',
      error: attemptResult.result.failure.message,
    })
    attemptResult = await send('text')
  }
  const { result, text, kind } = attemptResult
  if (!result.ok) return fail(result.failure, result.retryScheduled, entry ?? {})
  const sent = result.value as { message_id?: number } | undefined
  const messageId = sent?.message_id !== undefined ? String(sent.message_id) : null
  await saveTelegramEntry(payload, post.id, {
    script,
    chatId: channel.chatId,
    messageId,
    kind,
    hash: messageHash(text),
    sentAt: new Date(deps.now()).toISOString(),
    error: null,
  })
  payload.logger.info({ ...log, msg: `Telegram: yuborildi — ${label}`, messageId })
  return { status: 'sent', ...(messageId ? { messageId } : {}) }
}
