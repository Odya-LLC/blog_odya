import type { GlobalConfig } from 'payload'

import { isAdmin } from '@/access'
import { parseSlotTimes } from '@/jobs/slots'

export const DEFAULT_BRAND_HASHTAG = '#BlogOdya'
export const DEFAULT_INSTAGRAM_CTA = 'To‘liq maqola — profildagi havolada.'
export const DEFAULT_SOCIAL_HASHTAGS_COUNT = 8
export const MAX_SOCIAL_HASHTAGS = 15

/**
 * Instagram rejimi (OBLOG-118): `post` — har post alohida rasmli post (OBLOG-91); `story+digest` —
 * har post story (9:16) + kuniga bir necha marta dayjest karuseli.
 */
export const INSTAGRAM_MODES = ['post', 'story+digest'] as const
export type InstagramMode = (typeof INSTAGRAM_MODES)[number]
/** Dayjest slotlari (Toshkent vaqti). */
export const DEFAULT_INSTAGRAM_DIGEST_TIMES = '07:30, 12:30, 18:30'
/** Instagram Graph API: hisobga 24 soatda 50 ta API orqali nashr (story ham hisoblanadi). */
export const DEFAULT_INSTAGRAM_DAILY_LIMIT = 50
export const MIN_INSTAGRAM_DAILY_LIMIT = 5
export const MAX_INSTAGRAM_DAILY_LIMIT = 100
/** Bir kunda ko'pi bilan shuncha dayjest sloti. */
export const MAX_INSTAGRAM_DIGEST_SLOTS = 6

/** `"07:30, 12:30, 18:30"` — HH:MM ro'yxati (1–6 ta). */
export function validateDigestTimes(value: unknown): true | string {
  if (value === null || value === undefined || value === '') return true
  const slots = parseSlotTimes(value)
  if (!slots) return 'Vaqtlar HH:MM ko‘rinishida, vergul bilan: 07:30, 12:30, 18:30'
  if (slots.length > MAX_INSTAGRAM_DIGEST_SLOTS) {
    return `Ko‘pi bilan ${MAX_INSTAGRAM_DIGEST_SLOTS} ta vaqt`
  }
  return true
}

/** Make webhook URL'i: bo'sh yoki `https://` (Make — `https://hook.<region>.make.com/...`). */
export function validateWebhookUrl(value: unknown): true | string {
  if (value === null || value === undefined || value === '') return true
  if (typeof value !== 'string') return 'URL matn bo‘lishi kerak'
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? true : 'URL https:// bilan boshlanishi kerak'
  } catch {
    return 'URL noto‘g‘ri'
  }
}

/**
 * Ijtimoiy tarmoqlar avtoposti — Make.com orqali (OBLOG-91). Chop etilganda `make.webhook`
 * job'i Make "Custom webhook" iga JSON yuboradi, Make esa Instagram/Facebook/Threads/LinkedIn
 * modullari bilan post qiladi. Mantiq — `src/social/make/`, qo'llanma —
 * `docs/runbooks/social-autopost-options.md` ("Tanlov: Make").
 *
 * Faqat admin o'qiydi va o'zgartiradi: webhook URL'i — sir (uni bilgan har kim Make
 * ssenariysini ishga tushira oladi). Imzo siri — faqat env (`MAKE_WEBHOOK_SECRET`).
 */
export const SocialSettings: GlobalConfig = {
  slug: 'social-settings',
  label: 'Ijtimoiy tarmoqlar (Make)',
  access: {
    read: isAdmin,
    update: isAdmin,
  },
  admin: {
    description:
      'Chop etilgan postlar Make.com ssenariysiga yuboriladi (Instagram va boshqalar). Qo‘llanma: docs/runbooks/social-autopost-options.md → "Tanlov: Make".',
  },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      label: 'Make’ga yuborish yoqilgan',
      defaultValue: false,
      admin: {
        description:
          'O‘chiq bo‘lsa yangi chop etilgan postlar yuborilmaydi (post panelidagi “Sinov yuborish” baribir ishlaydi).',
      },
    },
    {
      name: 'webhookUrl',
      type: 'text',
      label: 'Make webhook URL',
      validate: validateWebhookUrl,
      admin: {
        description:
          'Make → Webhooks → Custom webhook → “Copy address”. Bo‘sh bo‘lsa — env MAKE_WEBHOOK_URL. Sir sifatida saqlang.',
      },
    },
    {
      name: 'scripts',
      type: 'select',
      label: 'Qaysi yozuv(lar) yuboriladi',
      hasMany: true,
      defaultValue: ['uz-Latn'],
      options: [
        { label: 'Lotin (uz-Latn)', value: 'uz-Latn' },
        { label: 'Kirill (uz-Cyrl)', value: 'uz-Cyrl' },
      ],
      admin: {
        description:
          'Har yozuv — alohida webhook so‘rovi (`script` maydoni bilan). Bitta Instagram hisobi uchun odatda faqat lotin.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'instagramImage',
          type: 'select',
          label: 'Instagram rasmi',
          // OBLOG-97: profil to'ri 3:4 plitka — 4:5 dan har yondan ~34 px, kvadratdan 135 px kesiladi.
          defaultValue: 'portrait',
          options: [
            // Tartib — DB enum tartibi (o'zgartirmang).
            { label: 'Kvadrat 1080×1080 (1:1)', value: 'square' },
            { label: 'Vertikal 1080×1350 (4:5) — tavsiya', value: 'portrait' },
          ],
          admin: {
            width: '50%',
            description:
              'Profil to‘ri postlarni 3:4 vertikal plitka qilib, markazdan kesib ko‘rsatadi. 4:5 eng kam yo‘qotadi (har yondan ~3%), kvadrat — har yondan 12,5%. Matn ikkalasida ham xavfsiz zonada. 3:4 ni to‘g‘ridan-to‘g‘ri yuborib bo‘lmaydi — Instagram API faqat 4:5 … 1.91:1 qabul qiladi.',
          },
        },
        {
          name: 'hashtagsCount',
          type: 'number',
          label: 'Heshteglar soni (brend bilan)',
          defaultValue: DEFAULT_SOCIAL_HASHTAGS_COUNT,
          min: 1,
          max: MAX_SOCIAL_HASHTAGS,
          admin: { width: '50%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'brandHashtag',
          type: 'text',
          label: 'Brend heshtegi',
          defaultValue: DEFAULT_BRAND_HASHTAG,
          admin: { width: '50%', description: 'Har postga qo‘shiladi. Bo‘sh — qo‘shilmaydi.' },
        },
        {
          name: 'instagramCta',
          type: 'text',
          label: 'Instagram chaqiruv qatori',
          defaultValue: DEFAULT_INSTAGRAM_CTA,
          admin: {
            width: '50%',
            description:
              'Instagram caption’dagi havola bosilmaydi — o‘quvchini bio’dagi havolaga yo‘naltiring. Kirill uchun avtomatik o‘giriladi.',
          },
        },
      ],
    },
    // OBLOG-94: rasm shabloni (`/og/{yozuv}/social/{id}/*.jpg`).
    {
      type: 'row',
      fields: [
        {
          name: 'imageOverlay',
          type: 'checkbox',
          label: 'Rasm ustida sarlavha',
          defaultValue: true,
          admin: {
            width: '50%',
            description:
              'Muqova ustida qisqa sarlavha, kategoriya va “Blog Odya” brendi. O‘chiq — muqovaning oddiy kesimi (muqovasiz post — baribir brend kartochkasi).',
          },
        },
        {
          name: 'imageScheme',
          type: 'select',
          label: 'Rasm rang sxemasi',
          defaultValue: 'dark',
          options: [
            { label: 'Qorong‘i (qora gradient)', value: 'dark' },
            { label: 'Brend (ko‘k gradient)', value: 'brand' },
          ],
          admin: {
            width: '50%',
            description: 'Sarlavha ostidagi gradient rangi.',
          },
        },
      ],
    },
    // OBLOG-118: Instagram story + dayjest karuseli.
    {
      type: 'collapsible',
      label: 'Instagram: story va dayjest',
      admin: { initCollapsed: false },
      fields: [
        {
          name: 'instagramMode',
          type: 'select',
          label: 'Instagram rejimi',
          required: true,
          defaultValue: 'post',
          options: [
            { label: 'Har post — alohida rasmli post', value: 'post' },
            {
              label: 'Har post — story, kuniga bir necha marta dayjest karuseli',
              value: 'story+digest',
            },
          ],
          admin: {
            description:
              'Almashtirishdan OLDIN Make ssenariysini yangilang (Router: type = post / story / digest — qo‘llanma: docs/runbooks/social-autopost-options.md → “Story va dayjest”). Aks holda Make yangi hodisalarni Instagram’ga chiqara olmaydi. Story va dayjest — faqat lotin yozuvi (bitta Instagram hisobi); kirill yozuvi tanlangan bo‘lsa, u odatdagi post hodisasini olishda davom etadi.',
          },
        },
        {
          type: 'row',
          admin: { condition: (data) => data?.instagramMode === 'story+digest' },
          fields: [
            {
              name: 'instagramStories',
              type: 'checkbox',
              label: 'Har post uchun story',
              defaultValue: true,
              admin: {
                width: '33%',
                description: 'O‘chiq — faqat dayjest karuseli (postlar alohida chiqmaydi).',
              },
            },
            {
              name: 'instagramDigestTimes',
              type: 'text',
              label: 'Dayjest vaqtlari (Toshkent)',
              defaultValue: DEFAULT_INSTAGRAM_DIGEST_TIMES,
              validate: validateDigestTimes,
              admin: {
                width: '33%',
                description:
                  'HH:MM, vergul bilan (1–6 ta). Har slotda oldingi dayjestdan keyin chiqqan postlar: muqova + ko‘pi bilan 9 ta post (muhimlik, keyin yangiligi); sig‘maganlari Instagram’ga chiqmaydi. Scheduler har 10 daqiqada tekshiradi; 60 daqiqadan ko‘p kechikkan slot keyingisiga qo‘shiladi.',
              },
            },
            {
              name: 'instagramDailyLimit',
              type: 'number',
              label: 'Kunlik limit (24 soat)',
              defaultValue: DEFAULT_INSTAGRAM_DAILY_LIMIT,
              min: MIN_INSTAGRAM_DAILY_LIMIT,
              max: MAX_INSTAGRAM_DAILY_LIMIT,
              admin: {
                width: '33%',
                description:
                  'Instagram API: hisobga 24 soatda 50 ta nashr (story ham). Dayjest slotlari uchun joy qoldiriladi; limitga 5 ta qolganda faqat muhimligi > 0 postlar story’si, limitda — story yuborilmaydi (post dayjestga baribir tushadi).',
              },
            },
          ],
        },
      ],
    },
  ],
}
