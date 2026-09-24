import type { GlobalConfig } from 'payload'

import { anyone, isAdmin } from '@/access'

export const SITE_SOCIALS = [
  { label: 'Telegram (lotin)', value: 'telegram_latn' },
  { label: 'Telegram (kirill)', value: 'telegram_cyrl' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'X (Twitter)', value: 'x' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'LinkedIn', value: 'linkedin' },
] as const

/**
 * Sayt sozlamalari (TZ §10.15) **(L)**: brend nomi ("Blog Odya" / "Блог Одя"), logo, ijtimoiy
 * tarmoqlar, default OG rasm, analitika ID'lari (TZ §9.5).
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Sayt sozlamalari',
  access: {
    read: anyone,
    update: isAdmin,
  },
  fields: [
    {
      name: 'siteName',
      type: 'text',
      label: 'Sayt nomi',
      localized: true,
      required: true,
    },
    {
      name: 'tagline',
      type: 'text',
      label: 'Shior',
      localized: true,
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Tavsif (default meta description)',
      localized: true,
    },
    {
      type: 'row',
      fields: [
        { name: 'logo', type: 'upload', label: 'Logo', relationTo: 'media' },
        { name: 'logoDark', type: 'upload', label: 'Logo (qorong‘i rejim)', relationTo: 'media' },
        { name: 'defaultOgImage', type: 'upload', label: 'Default OG rasm', relationTo: 'media' },
      ],
    },
    {
      name: 'socials',
      type: 'array',
      label: 'Ijtimoiy tarmoqlar',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'platform',
              type: 'select',
              label: 'Tarmoq',
              required: true,
              options: SITE_SOCIALS.map(({ label, value }) => ({ label, value })),
              admin: { width: '30%' },
            },
            { name: 'url', type: 'text', label: 'Havola', required: true, admin: { width: '70%' } },
          ],
        },
      ],
    },
    {
      name: 'analytics',
      type: 'group',
      label: 'Analitika va veb-master',
      fields: [
        { name: 'ga4MeasurementId', type: 'text', label: 'GA4 Measurement ID (G-…)' },
        { name: 'yandexMetrikaId', type: 'text', label: 'Yandex Metrica ID' },
        {
          name: 'googleSiteVerification',
          type: 'text',
          label: 'Google Search Console tasdiq kodi',
        },
        { name: 'yandexVerification', type: 'text', label: 'Yandex Webmaster tasdiq kodi' },
      ],
    },
  ],
}
