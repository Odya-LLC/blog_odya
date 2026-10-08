import type { GlobalConfig } from 'payload'

import { isAdmin } from '@/access'

export const DEFAULT_BRAND_HASHTAG = '#BlogOdya'
export const DEFAULT_INSTAGRAM_CTA = 'To‘liq maqola — profildagi havolada.'
export const DEFAULT_SOCIAL_HASHTAGS_COUNT = 8
export const MAX_SOCIAL_HASHTAGS = 15

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
  ],
}
