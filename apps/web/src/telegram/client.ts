import { Api, GrammyError, HttpError } from 'grammy'

import { TELEGRAM_API_TIMEOUT_MS } from '@/jobs/constants'

/**
 * grammY Bot API mijozi (TZ §7.1). Bot tokeni — faqat env (`TELEGRAM_BOT_TOKEN`); grammY xato
 * matnlariga URL/token qo'shmaydi (`sensitiveLogs: false`, default).
 *
 * `TelegramApi` — ishlatiladigan metodlar to'plami: testlar shu interfeysni soxta obyekt bilan
 * almashtiradi (`telegramDeps.createApi`), tarmoqqa chiqilmaydi.
 */
export type TelegramApi = Pick<
  Api,
  'sendPhoto' | 'sendMessage' | 'editMessageCaption' | 'editMessageText'
>

export function createTelegramApi(token: string): TelegramApi {
  return new Api(token, { timeoutSeconds: Math.ceil(TELEGRAM_API_TIMEOUT_MS / 1000) })
}

export interface TelegramFailure {
  /** Log/admin uchun qisqa matn (tokensiz). */
  message: string
  /** HTTP/Bot API kodi (tarmoq xatosida — yo'q). */
  code?: number
  /** Qayta urinish mantiqiymi (429, 5xx, tarmoq/timeout). */
  retryable: boolean
  /** 429: Telegram so'ragan pauza (`parameters.retry_after`), ms. */
  retryAfterMs?: number
  /** Tahrirlashda matn o'zgarmagan — xato emas. */
  notModified?: boolean
  /** Tahrirlanadigan xabar topilmadi (kanalda o'chirilgan). */
  messageGone?: boolean
}

const MAX_MESSAGE = 500

/** Ehtiyot uchun: matnga tushib qolgan bot tokeni (`123456:ABC…`) yashiriladi. */
export function redactToken(text: string): string {
  return text.replace(/\d{5,}:[\w-]{20,}/g, '<token>')
}

export function classifyTelegramError(error: unknown): TelegramFailure {
  const failure = classify(error)
  return { ...failure, message: redactToken(failure.message) }
}

function classify(error: unknown): TelegramFailure {
  if (error instanceof GrammyError) {
    const code = error.error_code
    const description = error.description ?? error.message
    const message = `Telegram ${code}: ${description}`.slice(0, MAX_MESSAGE)
    if (code === 429) {
      const seconds = Number(error.parameters?.retry_after)
      return {
        message,
        code,
        retryable: true,
        retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5_000,
      }
    }
    if (code === 400 && /message is not modified/i.test(description)) {
      return { message, code, retryable: false, notModified: true }
    }
    if (code === 400 && /message to edit not found|message can't be edited/i.test(description)) {
      return { message, code, retryable: false, messageGone: true }
    }
    return { message, code, retryable: code >= 500 }
  }
  if (error instanceof HttpError) {
    const cause = (error.error as Error | undefined)?.name
    return {
      message: `Telegram: tarmoq xatosi${cause ? ` (${cause})` : ''}`,
      retryable: true,
    }
  }
  const name = (error as Error | undefined)?.name
  return {
    message:
      name === 'TimeoutError' || name === 'AbortError'
        ? 'Telegram: timeout'
        : `Telegram: ${String((error as Error | undefined)?.message ?? error).slice(0, MAX_MESSAGE)}`,
    retryable: true,
  }
}
