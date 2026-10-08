/**
 * `make.webhook` job mantig'i (OBLOG-91): chop etilgan post (bitta yozuv) → Make "Custom
 * webhook" iga JSON (`./payload.ts`). Make ssenariysi Instagram/Facebook/Threads/... ga post
 * qiladi; bizning tomonda — faqat ishonchli yetkazish:
 *
 * - **Idempotentlik:** `social-deliveries.key = make:{postId}:post.published:{script}` (UNIQUE).
 *   `sent` bo'lsa — qayta yuborilmaydi (qayta saqlash, unpublish → publish, takroriy job).
 *   `X-Odya-Delivery` (UUID) qayta urinishlarda o'zgarmaydi — Make tomonda ham dublikatni
 *   aniqlash mumkin.
 * - **Qayta urinish:** 429/5xx/tarmoq/timeout — job `waitUntil` bilan 1, 5, 15 daqiqadan keyin
 *   (`MAKE_RETRY_BACKOFF_MS`); 4xx (webhook o'chirilgan — 410, noto'g'ri — 400) — darhol xato.
 *   Yakuniy xato — `alertChatId` ga Telegram ogohlantirishi (Telegram sozlanmagan — log).
 * - **Imzo:** `X-Odya-Signature: sha256=HMAC(tana, MAKE_WEBHOOK_SECRET)` (sir bo'lsa),
 *   `X-Odya-Event`, `X-Odya-Delivery`, `X-Odya-Timestamp`.
 * - Webhook URL'i (sir) log, xato matni va admin'ga chiqmaydi.
 *
 * Holat yozuvlari `req`siz (darhol commit) — job tranzaksiyasi qaytarilsa ham "yuborildi"
 * yo'qolmaydi (aks holda keyingi urinish dublikat post qilardi).
 */
import { randomUUID } from 'node:crypto'

import type { Locale } from '@blog-odya/shared/locales'
import type { Payload, PayloadRequest } from 'payload'

import {
  DEFAULT_QUEUE,
  MAKE_RETRY_BACKOFF_MS,
  MAKE_WEBHOOK_TASK,
  MAKE_WEBHOOK_TIMEOUT_MS,
} from '@/jobs/constants'
import { keepReqLocale } from '@/lib/hookReq'
import { escapeTelegramHtml, sendTelegramMessage } from '@/lib/telegram'
import type { SocialDelivery } from '@/payload-types'
import { siteOrigin } from '@/site/seo/config'
import { loadTelegramConfig } from '@/telegram/config'
import { getTransliterator } from '@/translit/transliterator'

import { loadSocialPost } from '../post'
import { loadMakeConfig, type MakeConfig } from './config'
import { buildMakePayload, type MakeEvent, type MakePayload, signMakeBody } from './payload'

export interface MakeDeps {
  fetch: typeof fetch
  now: () => number
  origin: () => string
  uuid: () => string
}

export const makeDeps: MakeDeps = {
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  origin: () => siteOrigin(),
  uuid: () => randomUUID(),
}

export const MAKE_EVENT: MakeEvent = 'post.published'

const SCRIPT_LABEL: Record<Locale, string> = { 'uz-Latn': 'lotin', 'uz-Cyrl': 'kirill' }

export function makeDeliveryKey(postId: number | string, event: MakeEvent, script: Locale) {
  return `make:${postId}:${event}:${script}`
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export interface MakeSendResult {
  ok: boolean
  /** HTTP status (tarmoq xatosi / timeout — 0). */
  status: number
  retry: boolean
  message: string
}

export function classifyMakeStatus(status: number): MakeSendResult {
  if (status >= 200 && status < 300)
    return { ok: true, status, retry: false, message: 'qabul qilindi' }
  if (status === 429)
    return { ok: false, status, retry: true, message: 'Make: juda ko‘p so‘rov (429)' }
  if (status >= 500)
    return { ok: false, status, retry: true, message: `Make: server xatosi (${status})` }
  if (status === 404 || status === 410) {
    return {
      ok: false,
      status,
      retry: false,
      message: `Make: webhook topilmadi (${status}) — URL o‘chirilgan yoki noto‘g‘ri`,
    }
  }
  return { ok: false, status, retry: false, message: `Make: so‘rov rad etildi (HTTP ${status})` }
}

/** Bitta POST. Javob tanasi ≤ 200 belgi xabarga qo'shiladi (Make: "Accepted" / xato matni). */
export async function postToMake(
  options: { url: string; body: string; event: MakeEvent; deliveryId: string; secret?: string },
  deps: MakeDeps = makeDeps,
): Promise<MakeSendResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': 'BlogOdya-Webhook/1 (+https://blog.odya.uz)',
    'X-Odya-Event': options.event,
    'X-Odya-Delivery': options.deliveryId,
    'X-Odya-Timestamp': String(Math.floor(deps.now() / 1000)),
  }
  if (options.secret) headers['X-Odya-Signature'] = signMakeBody(options.body, options.secret)
  try {
    const response = await deps.fetch(options.url, {
      method: 'POST',
      headers,
      body: options.body,
      signal: AbortSignal.timeout(MAKE_WEBHOOK_TIMEOUT_MS),
    })
    const text = (await response.text().catch(() => '')).trim().slice(0, 200)
    const result = classifyMakeStatus(response.status)
    return !result.ok && text ? { ...result, message: `${result.message}: ${text}` } : result
  } catch (error) {
    const name = (error as Error)?.name
    // Xato matnida URL bo'lishi mumkin — faqat turi.
    const message =
      name === 'TimeoutError' || name === 'AbortError' ? 'Make: timeout' : 'Make: tarmoq xatosi'
    return { ok: false, status: 0, retry: true, message }
  }
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export type BuildResult =
  { ok: true; payload: MakePayload } | { ok: false; reason: 'not-public' | 'social-skip' }

/** Postdan Make JSON'i (yozuv bo'yicha; kirill — chaqiruv qatori ham kirillda). */
export async function buildMakePayloadFor(
  payload: Payload,
  options: {
    postId: number
    script: Locale
    config: MakeConfig
    test: boolean
    deliveryId: string
    respectSkip?: boolean
  },
  deps: MakeDeps = makeDeps,
): Promise<BuildResult> {
  const origin = deps.origin()
  const data = await loadSocialPost(payload, options.postId, options.script, origin)
  if (!data) return { ok: false, reason: 'not-public' }
  if (options.respectSkip !== false && data.post.socialSkip) {
    return { ok: false, reason: 'social-skip' }
  }
  let cta = options.config.instagramCta
  if (options.script === 'uz-Cyrl' && cta) {
    cta = (await getTransliterator(payload)).toCyrillic(cta)
  }
  return {
    ok: true,
    payload: buildMakePayload(data.input, {
      event: MAKE_EVENT,
      deliveryId: options.deliveryId,
      sentAt: new Date(deps.now()).toISOString(),
      test: options.test,
      locale: options.script,
      origin,
      hashtagsCount: options.config.hashtagsCount,
      brandHashtag: options.config.brandHashtag,
      instagramCta: cta,
      instagramImage: options.config.instagramImage,
      imageStyle: { overlay: options.config.imageOverlay, scheme: options.config.imageScheme },
    }),
  }
}

// ---------------------------------------------------------------------------
// Holat (`social-deliveries`)
// ---------------------------------------------------------------------------

/**
 * `req` — faqat post hook'idan (saqlash tranzaksiyasi ulanishida o'qish, OBLOG-110); job va
 * endpoint'lar `req`siz chaqiradi.
 */
export async function findMakeDelivery(
  payload: Payload,
  key: string,
  req?: PayloadRequest,
): Promise<SocialDelivery | null> {
  const { docs } = await keepReqLocale(req, () =>
    payload.find({
      collection: 'social-deliveries',
      where: { key: { equals: key } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      ...(req ? { req } : {}),
    }),
  )
  return docs[0] ?? null
}

type DeliveryData = Pick<SocialDelivery, 'status'> &
  Partial<Pick<SocialDelivery, 'httpStatus' | 'attempts' | 'sentAt' | 'deliveryId' | 'error'>>

/** `key` bo'yicha yaratadi yoki yangilaydi (tranzaksiyasiz — darhol commit). */
export async function saveMakeDelivery(
  payload: Payload,
  base: { key: string; postId: number; script: Locale },
  data: DeliveryData,
): Promise<void> {
  const write = async () => {
    const existing = await findMakeDelivery(payload, base.key)
    if (existing) {
      await payload.update({
        collection: 'social-deliveries',
        id: existing.id,
        data,
        depth: 0,
        overrideAccess: true,
      })
      return
    }
    await payload.create({
      collection: 'social-deliveries',
      data: {
        key: base.key,
        post: base.postId,
        target: 'make',
        event: MAKE_EVENT,
        script: base.script,
        ...data,
      },
      depth: 0,
      overrideAccess: true,
    })
  }
  try {
    await write()
  } catch (error) {
    // Parallel yaratish (UNIQUE `key`) — bir marta qayta: endi yangilanadi.
    payload.logger.warn({ err: error, key: base.key, msg: 'Make: holatni qayta yozish' })
    await write()
  }
}

// ---------------------------------------------------------------------------
// Ogohlantirish
// ---------------------------------------------------------------------------

export async function sendMakeAlert(
  payload: Payload,
  text: string,
  deps: MakeDeps = makeDeps,
): Promise<void> {
  const config = await loadTelegramConfig(payload)
  if (!config.token || !config.alertChatId) {
    payload.logger.error({ msg: `ALERT (Telegram alert sozlanmagan): ${text}` })
    return
  }
  try {
    await sendTelegramMessage({
      token: config.token,
      chatId: config.alertChatId,
      text: `<b>Blog Odya — Make avtopost</b>\n${escapeTelegramHtml(text)}`,
      fetchImpl: deps.fetch,
    })
  } catch (error) {
    payload.logger.error({
      msg: `ALERT (Telegram yuborilmadi): ${text}`,
      error: (error as Error).message,
    })
  }
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export interface MakeWebhookInput {
  postId: number
  script: Locale
  /** Oldingi urinishlar soni (qayta navbatga qo'yilgan job'da). */
  attempt?: number | null
}

export type MakeWebhookStatus = 'sent' | 'duplicate' | 'skipped' | 'retry' | 'failed'

export interface MakeWebhookOutput {
  status: MakeWebhookStatus
  reason?: string
  httpStatus?: number
}

export async function runMakeWebhook(
  payload: Payload,
  input: MakeWebhookInput,
  options: { req?: PayloadRequest; deps?: MakeDeps } = {},
): Promise<MakeWebhookOutput> {
  const deps = options.deps ?? makeDeps
  const { postId, script } = input
  const log = { postId, script }

  const config = await loadMakeConfig(payload)
  if (!config.enabled) return { status: 'skipped', reason: 'disabled' }
  if (!config.webhookUrl) {
    payload.logger.warn({ ...log, msg: 'Make: webhook URL sozlanmagan — o‘tkazildi' })
    return { status: 'skipped', reason: 'no-url' }
  }
  if (!config.scripts.includes(script)) return { status: 'skipped', reason: 'script-disabled' }

  const key = makeDeliveryKey(postId, MAKE_EVENT, script)
  const existing = await findMakeDelivery(payload, key)
  if (existing?.status === 'sent') return { status: 'duplicate' }

  const deliveryId = existing?.deliveryId || deps.uuid()
  const built = await buildMakePayloadFor(
    payload,
    { postId, script, config, test: false, deliveryId },
    deps,
  )
  if (!built.ok) return { status: 'skipped', reason: built.reason }

  const attempt = Math.max(0, Number(input.attempt ?? 0) || 0)
  const result = await postToMake(
    {
      url: config.webhookUrl,
      body: JSON.stringify(built.payload),
      event: MAKE_EVENT,
      deliveryId,
      secret: config.secret,
    },
    deps,
  )
  const base = { key, postId, script }
  const label = `«${built.payload.post.title}» (${SCRIPT_LABEL[script]})`

  if (result.ok) {
    await saveMakeDelivery(payload, base, {
      status: 'sent',
      httpStatus: result.status,
      attempts: attempt + 1,
      sentAt: new Date(deps.now()).toISOString(),
      deliveryId,
      error: null,
    })
    payload.logger.info({ ...log, deliveryId, msg: `Make: yuborildi — ${label}` })
    return { status: 'sent', httpStatus: result.status }
  }

  const backoff = MAKE_RETRY_BACKOFF_MS[attempt]
  if (result.retry && backoff !== undefined) {
    await saveMakeDelivery(payload, base, {
      status: 'retry',
      httpStatus: result.status,
      attempts: attempt + 1,
      deliveryId,
      error: result.message,
    })
    await payload.jobs.queue({
      task: MAKE_WEBHOOK_TASK,
      queue: DEFAULT_QUEUE,
      input: { postId, script, attempt: attempt + 1 },
      waitUntil: new Date(deps.now() + backoff),
      ...(options.req ? { req: options.req } : {}),
    })
    payload.logger.warn({
      ...log,
      msg: `${result.message} — ${Math.round(backoff / 1000)} s dan keyin qayta urinish (${attempt + 1}/${MAKE_RETRY_BACKOFF_MS.length})`,
    })
    return { status: 'retry', httpStatus: result.status, reason: result.message }
  }

  await saveMakeDelivery(payload, base, {
    status: 'failed',
    httpStatus: result.status,
    attempts: attempt + 1,
    deliveryId,
    error: result.message,
  })
  payload.logger.error({ ...log, msg: `Make: yuborilmadi — ${label}`, error: result.message })
  await sendMakeAlert(
    payload,
    `${label} Make’ga yuborilmadi (${attempt + 1} urinish): ${result.message}`,
    deps,
  )
  return { status: 'failed', httpStatus: result.status, reason: result.message }
}

// ---------------------------------------------------------------------------
// Sinov yuborish (admin)
// ---------------------------------------------------------------------------

export interface MakeTestResult {
  ok: boolean
  httpStatus: number
  message: string
  payload?: MakePayload
}

/**
 * Sinov: `test: true` bilan bitta so'rov (qayta urinishsiz, holat yozilmaydi). `enabled` shart
 * emas — ssenariyni ulashda maydonlarni xaritalash uchun. Make ssenariysida
 * `test = false` filtri Instagram moduli oldida bo'lishi shart (qo'llanmaga qarang).
 */
export async function sendMakeTest(
  payload: Payload,
  options: { postId: number; script: Locale },
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
  const deliveryId = deps.uuid()
  const built = await buildMakePayloadFor(
    payload,
    { ...options, config, test: true, deliveryId, respectSkip: false },
    deps,
  )
  if (!built.ok) {
    return {
      ok: false,
      httpStatus: 0,
      message: 'Post chop etilmagan — sinov uchun chop etilgan postni oching.',
    }
  }
  const result = await postToMake(
    {
      url: config.webhookUrl,
      body: JSON.stringify(built.payload),
      event: MAKE_EVENT,
      deliveryId,
      secret: config.secret,
    },
    deps,
  )
  payload.logger.info({
    postId: options.postId,
    script: options.script,
    deliveryId,
    httpStatus: result.status,
    msg: `Make: sinov yuborildi — ${result.message}`,
  })
  return {
    ok: result.ok,
    httpStatus: result.status,
    message: result.ok ? 'Sinov yuborildi (test: true).' : result.message,
    payload: built.payload,
  }
}
