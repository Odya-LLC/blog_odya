import { LOCALES, type Locale } from '@blog-odya/shared/locales'
import type { Payload, PayloadRequest } from 'payload'

import { env } from '@/env'
import {
  DEFAULT_BRAND_HASHTAG,
  DEFAULT_INSTAGRAM_CTA,
  DEFAULT_SOCIAL_HASHTAGS_COUNT,
  MAX_SOCIAL_HASHTAGS,
  validateWebhookUrl,
} from '@/globals/SocialSettings'
import { keepReqLocale } from '@/lib/hookReq'
import type { SocialSetting } from '@/payload-types'

import type { SocialImageScheme } from './payload'

/**
 * Make avtopost sozlamalari (OBLOG-91): `social-settings` global + env.
 *
 * - Yoqish — faqat global (`enabled`, standart o'chiq).
 * - Webhook URL — global `webhookUrl`, bo'lmasa env `MAKE_WEBHOOK_URL`.
 * - Imzo siri — faqat env `MAKE_WEBHOOK_SECRET` (DB/admin'da saqlanmaydi).
 */
export interface MakeConfig {
  enabled: boolean
  webhookUrl?: string
  urlSource?: 'settings' | 'env'
  secret?: string
  scripts: Locale[]
  hashtagsCount: number
  brandHashtag: string
  instagramCta: string
  instagramImage: 'square' | 'portrait'
  /** OBLOG-94: rasm ustida qisqa sarlavha va brend (standart — yoqiq). */
  imageOverlay: boolean
  /** OBLOG-94: gradient rangi — `dark` (qora) yoki `brand` (brend ko'k). */
  imageScheme: SocialImageScheme
}

export type MakeEnv = Partial<Pick<typeof env, 'MAKE_WEBHOOK_URL' | 'MAKE_WEBHOOK_SECRET'>>

const clean = (value: string | null | undefined) => value?.trim() || undefined

export function resolveMakeConfig(
  settings: Partial<SocialSetting> | null | undefined,
  source: MakeEnv,
): MakeConfig {
  const fromSettings = clean(settings?.webhookUrl)
  const settingsUrl =
    fromSettings && validateWebhookUrl(fromSettings) === true ? fromSettings : undefined
  const envUrl = clean(source.MAKE_WEBHOOK_URL)
  const scripts = (settings?.scripts ?? ['uz-Latn']).filter((script): script is Locale =>
    (LOCALES as readonly string[]).includes(script),
  )
  const count = settings?.hashtagsCount
  return {
    enabled: settings?.enabled === true,
    webhookUrl: settingsUrl ?? envUrl,
    urlSource: settingsUrl ? 'settings' : envUrl ? 'env' : undefined,
    secret: clean(source.MAKE_WEBHOOK_SECRET),
    scripts: LOCALES.filter((locale) => scripts.includes(locale)),
    hashtagsCount:
      typeof count === 'number' && Number.isFinite(count)
        ? Math.max(1, Math.min(MAX_SOCIAL_HASHTAGS, Math.round(count)))
        : DEFAULT_SOCIAL_HASHTAGS_COUNT,
    brandHashtag:
      settings?.brandHashtag === undefined || settings.brandHashtag === null
        ? DEFAULT_BRAND_HASHTAG
        : settings.brandHashtag.trim(),
    instagramCta:
      settings?.instagramCta === undefined || settings.instagramCta === null
        ? DEFAULT_INSTAGRAM_CTA
        : settings.instagramCta.trim(),
    // OBLOG-97: standart — 4:5 (profil to'rining 3:4 kesimida eng kam yo'qotadi).
    instagramImage: settings?.instagramImage === 'square' ? 'square' : 'portrait',
    imageOverlay: settings?.imageOverlay !== false,
    imageScheme: settings?.imageScheme === 'brand' ? 'brand' : 'dark',
  }
}

/** Testlar uchun: `undefined` — global + env; obyekt — shu konfiguratsiya. */
export const makeConfigOverride: { current?: MakeConfig } = {}

/**
 * Global + env. Hook ichida `req` uzatiladi — post saqlash tranzaksiyasida o'qiladi (OBLOG-110:
 * alohida ulanish kutilmaydi), `req.locale` tiklanadi (Telegram config bilan bir xil).
 */
export async function loadMakeConfig(payload: Payload, req?: PayloadRequest): Promise<MakeConfig> {
  if (makeConfigOverride.current) return makeConfigOverride.current
  let settings: SocialSetting | null = null
  try {
    settings = await keepReqLocale(req, () =>
      payload.findGlobal({ slug: 'social-settings', depth: 0, ...(req ? { req } : {}) }),
    )
  } catch (error) {
    payload.logger.warn({ err: error, msg: 'social-settings o‘qilmadi — Make o‘chiq deb olinadi' })
  }
  return resolveMakeConfig(settings, env)
}
