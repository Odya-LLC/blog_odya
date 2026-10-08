import { LOCALES, type Locale } from '@blog-odya/shared/locales'
import type { Payload, PayloadRequest } from 'payload'

import { env } from '@/env'
import { DEFAULT_TELEGRAM_TEMPLATE } from '@/globals/TelegramSettings'
import { keepReqLocale } from '@/lib/hookReq'
import type { TelegramSetting } from '@/payload-types'

import { DEFAULT_HASHTAGS_COUNT } from './caption'

/**
 * Telegram avtopost sozlamalari (TZ §7.1, §10.15): `telegram-settings` global ustun, env —
 * standart qiymat.
 *
 * - Token — faqat env (`TELEGRAM_BOT_TOKEN`).
 * - Kanal — yozuv bo'yicha: global'da shu yozuv uchun qator bo'lsa (`channels[] { script,
 *   chatId, isEnabled }`) — o'sha (o'chirilgan bo'lsa — kanal o'chiq), aks holda env
 *   (`TELEGRAM_CHANNEL_LATN` / `TELEGRAM_CHANNEL_CYRL`).
 * - Ogohlantirish chati — `alertChatId`, bo'lmasa env `TELEGRAM_ALERT_CHAT_ID`.
 */

export interface TelegramChannel {
  script: Locale
  chatId: string
  source: 'settings' | 'env'
}

export interface TelegramConfig {
  token?: string
  /** Faol (sozlangan va yoqilgan) kanallar. */
  channels: Partial<Record<Locale, TelegramChannel>>
  /** Global'da ataylab o'chirilgan yozuvlar (ogohlantirishsiz o'tkazib yuboriladi). */
  disabled: Locale[]
  template: string
  hashtagsCount: number
  alertChatId?: string
}

export type TelegramEnv = Partial<
  Pick<
    typeof env,
    | 'TELEGRAM_BOT_TOKEN'
    | 'TELEGRAM_CHANNEL_LATN'
    | 'TELEGRAM_CHANNEL_CYRL'
    | 'TELEGRAM_ALERT_CHAT_ID'
  >
>

const ENV_CHANNEL: Record<Locale, keyof TelegramEnv> = {
  'uz-Latn': 'TELEGRAM_CHANNEL_LATN',
  'uz-Cyrl': 'TELEGRAM_CHANNEL_CYRL',
}

const clean = (value: string | null | undefined) => value?.trim() || undefined

export function resolveTelegramConfig(
  settings: Partial<TelegramSetting> | null | undefined,
  source: TelegramEnv,
): TelegramConfig {
  const channels: TelegramConfig['channels'] = {}
  const disabled: Locale[] = []
  for (const script of LOCALES) {
    const row = settings?.channels?.find((channel) => channel.script === script)
    if (row) {
      const chatId = clean(row.chatId)
      if (row.isEnabled === false) disabled.push(script)
      else if (chatId) channels[script] = { script, chatId, source: 'settings' }
      continue
    }
    const chatId = clean(source[ENV_CHANNEL[script]])
    if (chatId) channels[script] = { script, chatId, source: 'env' }
  }
  const count = settings?.hashtagsCount
  return {
    token: clean(source.TELEGRAM_BOT_TOKEN),
    channels,
    disabled,
    template: clean(settings?.template) ?? DEFAULT_TELEGRAM_TEMPLATE,
    hashtagsCount:
      typeof count === 'number' && Number.isFinite(count)
        ? Math.max(0, Math.min(5, Math.round(count)))
        : DEFAULT_HASHTAGS_COUNT,
    alertChatId: clean(settings?.alertChatId) ?? clean(source.TELEGRAM_ALERT_CHAT_ID),
  }
}

/** Testlar uchun: `undefined` — global + env; obyekt — shu konfiguratsiya. */
export const telegramConfigOverride: { current?: TelegramConfig } = {}

/**
 * Global + env. Hook ichida (post saqlash tranzaksiyasi) `req` uzatiladi — o'qish shu
 * tranzaksiya ulanishida, pool'dan ikkinchi ulanish kutilmaydi (OBLOG-110); Local API qayta
 * yozadigan `req.locale` / `req.fallbackLocale` tiklanadi (`keepReqLocale`).
 */
export async function loadTelegramConfig(
  payload: Payload,
  req?: PayloadRequest,
): Promise<TelegramConfig> {
  if (telegramConfigOverride.current) return telegramConfigOverride.current
  let settings: TelegramSetting | null = null
  try {
    settings = await keepReqLocale(req, () =>
      payload.findGlobal({ slug: 'telegram-settings', depth: 0, ...(req ? { req } : {}) }),
    )
  } catch (error) {
    // Global o'qilmasa — faqat env qiymatlari.
    payload.logger.warn({ err: error, msg: 'telegram-settings o‘qilmadi — env ishlatiladi' })
  }
  return resolveTelegramConfig(settings, env)
}
