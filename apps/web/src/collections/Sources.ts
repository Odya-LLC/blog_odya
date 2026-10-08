import { FETCH_MODES, SOURCE_LANGUAGES } from '@blog-odya/shared'
import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'
import { slugField } from '@/fields/slug'
import { DEFAULT_POLL_INTERVAL_MIN } from '@/jobs/constants'
import { FEED_ERROR_KINDS } from '@/scraping/feed'
import { CLEAR_FEED_BACKOFF } from '@/scraping/feedBackoff'

const readOnlySidebar = { readOnly: true, position: 'sidebar' as const }

interface FeedRowLike {
  id?: string | null
  url?: string | null
}

/**
 * Feed backoff'ini (OBLOG-53) admin harakatida tozalash — feed keyingi scheduler tsiklida darhol
 * tekshiriladi: feed URL'i o'zgarsa (yangi manzil — eski xatolar tegishli emas) yoki manba
 * nofaoldan faolga o'tkazilsa (masalan, Cloudflare himoyasi olib tashlangach HLTV qayta yoqilsa).
 * `feed.poll` o'zi URL'ni ham, `isActive` ni ham o'zgartirmaydi — uning yozuvlariga ta'sir yo'q.
 */
export const resetFeedBackoffOnAdminChange: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  operation,
}) => {
  if (operation !== 'update' || !originalDoc) return data
  const reactivated = data.isActive === true && originalDoc.isActive === false
  // Qisman yangilash (`{ isActive: true }`) — feed'lar asl hujjatdan olinadi.
  if (!Array.isArray(data.feeds)) {
    if (!reactivated || !Array.isArray(originalDoc.feeds)) return data
    data.feeds = originalDoc.feeds
  }
  const previousUrls = new Map<string, string | null | undefined>(
    ((originalDoc.feeds ?? []) as FeedRowLike[])
      .filter((feed) => feed.id)
      .map((feed) => [feed.id!, feed.url]),
  )
  data.feeds = (data.feeds as FeedRowLike[]).map((feed) => {
    const urlChanged = feed.id ? previousUrls.get(feed.id) !== feed.url : false
    return reactivated || urlChanged ? { ...feed, ...CLEAR_FEED_BACKOFF } : feed
  })
  return data
}

/**
 * Manbalar (TZ §10.1). Boshlang'ich ro'yxat — `packages/shared/seed/sources.json` (M0-04),
 * `pnpm seed` orqali yuklanadi. Boshqarish — faqat admin (TZ §4.2), editor faqat ko'radi.
 *
 * `feeds[]` qatoridagi `etag`, `lastModified`, `lastPolledAt`, `lastStatus`, `lastError` —
 * `feed.poll` holati (shartli so'rovlar va `pollIntervalMin` hisobi uchun); admin'da faqat o'qish.
 * Ularni faqat `feed.poll` yozadi (bitta manba uchun bir vaqtda bitta job — `scheduler.ts`).
 *
 * `lastRequestAt` — domen bo'yicha rate limit soati (`feed.poll` va `item.fetch` uchun umumiy),
 * `robotsCache` — robots.txt keshi; `item.fetch` ularni atomar SQL bilan yangilaydi
 * (`src/scraping/sourceState.ts`).
 */
export const Sources: CollectionConfig = {
  slug: 'sources',
  labels: {
    singular: 'Manba',
    plural: 'Manbalar',
  },
  access: {
    read: isAdminOrEditor,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'language', 'fetchMode', 'priority', 'isActive', 'updatedAt'],
    group: 'Scraping',
  },
  defaultSort: '-priority',
  hooks: {
    beforeChange: [resetFeedBackoffOnAdminChange],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Nomi',
      required: true,
    },
    slugField('name'),
    {
      name: 'homepageUrl',
      type: 'text',
      label: 'Bosh sahifa URL',
      required: true,
    },
    {
      name: 'feeds',
      type: 'array',
      label: 'Feedlar (RSS/Atom)',
      labels: { singular: 'Feed', plural: 'Feedlar' },
      minRows: 1,
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'url',
              type: 'text',
              label: 'Feed URL',
              required: true,
              admin: { width: '60%' },
            },
            {
              name: 'feedCategory',
              type: 'text',
              label: 'Manbadagi bo‘lim',
              admin: { width: '40%' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'mapsTo',
              type: 'relationship',
              relationTo: 'categories',
              label: 'Bizning kategoriya',
              admin: { width: '40%' },
            },
            {
              name: 'mappingWeight',
              type: 'number',
              label: 'Mapping bali',
              defaultValue: 10,
              min: 0,
              max: 20,
              admin: {
                width: '30%',
                description:
                  'Bo‘lim feedi — 10, keng bo‘lim — 5, umumiy feed — 1 (kalit so‘zlar hal qiladi)',
              },
            },
            {
              name: 'isActive',
              type: 'checkbox',
              label: 'Faol',
              defaultValue: true,
              admin: { width: '30%' },
            },
          ],
        },
        {
          type: 'collapsible',
          label: 'Poll holati',
          admin: { initCollapsed: true },
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'lastPolledAt',
                  type: 'date',
                  label: 'Oxirgi poll',
                  admin: { readOnly: true, width: '33%', date: { pickerAppearance: 'dayAndTime' } },
                },
                {
                  name: 'lastStatus',
                  type: 'number',
                  label: 'HTTP status',
                  admin: { readOnly: true, width: '33%' },
                },
                {
                  name: 'lastNewItems',
                  type: 'number',
                  label: 'Yangi elementlar',
                  admin: { readOnly: true, width: '33%' },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'etag',
                  type: 'text',
                  label: 'ETag',
                  admin: { readOnly: true, width: '50%' },
                },
                {
                  name: 'lastModified',
                  type: 'text',
                  label: 'Last-Modified',
                  admin: { readOnly: true, width: '50%' },
                },
              ],
            },
            {
              name: 'lastError',
              type: 'textarea',
              label: 'Oxirgi xato',
              admin: { readOnly: true },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'failureCount',
                  type: 'number',
                  label: 'Ketma-ket xatolar',
                  defaultValue: 0,
                  admin: { readOnly: true, width: '33%' },
                },
                {
                  name: 'lastErrorKind',
                  type: 'select',
                  label: 'Xato turi',
                  options: [
                    { label: 'Cloudflare challenge', value: FEED_ERROR_KINDS[0] },
                    { label: 'HTTP xato', value: FEED_ERROR_KINDS[1] },
                    { label: 'Timeout', value: FEED_ERROR_KINDS[2] },
                    { label: 'Tarmoq', value: FEED_ERROR_KINDS[3] },
                    { label: 'Parse', value: FEED_ERROR_KINDS[4] },
                  ],
                  admin: { readOnly: true, width: '33%' },
                },
                {
                  name: 'nextPollAt',
                  type: 'date',
                  label: 'Keyingi tekshiruv (backoff)',
                  admin: {
                    readOnly: true,
                    width: '33%',
                    date: { pickerAppearance: 'dayAndTime' },
                    description:
                      'Doimiy xatoda so‘rovlar siyraklashadi (Cloudflare — kuniga 1 marta). URL o‘zgarsa yoki manba qayta yoqilsa — tozalanadi.',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'language',
          type: 'select',
          label: 'Til',
          required: true,
          options: SOURCE_LANGUAGES.map((value) => ({ label: value, value })),
          admin: { width: '33%' },
        },
        {
          name: 'fetchMode',
          type: 'select',
          label: 'Yig‘ish rejimi',
          required: true,
          defaultValue: 'rss_only',
          options: [
            { label: 'Faqat RSS', value: FETCH_MODES[0] },
            { label: 'RSS + sahifa', value: FETCH_MODES[1] },
          ],
          admin: { width: '33%' },
        },
        {
          name: 'priority',
          type: 'number',
          label: 'Prioritet (0–50)',
          defaultValue: 25,
          min: 0,
          max: 50,
          admin: { width: '33%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'pollIntervalMin',
          type: 'number',
          label: 'Poll oralig‘i (daqiqa)',
          defaultValue: DEFAULT_POLL_INTERVAL_MIN,
          min: 5,
          max: 1440,
          admin: {
            width: '50%',
            description:
              'Scraping har 30 daqiqada ishlaydi — oraliq 30 ga karrali qilib yuqoriga yaxlitlanadi (≤ 30 → har tick, 45 → 60 daqiqa)',
          },
        },
        {
          name: 'rateLimitSec',
          type: 'number',
          label: 'So‘rovlar orasidagi pauza (s, domen)',
          defaultValue: 10,
          min: 1,
          max: 600,
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'selectors',
      type: 'json',
      label: 'CSS selektorlar (rss_plus_page)',
      admin: {
        description: '{ "content": "...", "title"?, "author"?, "publishedAt"?, "remove"?: [] }',
      },
    },
    {
      name: 'keywordRules',
      type: 'array',
      label: 'Kalit so‘z qoidalari',
      labels: { singular: 'Qoida', plural: 'Qoidalar' },
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'keyword',
              type: 'text',
              label: 'Kalit so‘z',
              required: true,
              admin: { width: '40%' },
            },
            {
              name: 'category',
              type: 'relationship',
              relationTo: 'categories',
              label: 'Kategoriya',
              required: true,
              admin: { width: '40%' },
            },
            {
              name: 'boost',
              type: 'number',
              label: 'Boost',
              defaultValue: 0,
              min: -10,
              max: 10,
              admin: { width: '20%' },
            },
          ],
        },
      ],
    },
    {
      name: 'tosNotes',
      type: 'textarea',
      label: 'robots.txt / ToS izohlari',
    },
    {
      name: 'isActive',
      type: 'checkbox',
      label: 'Faol',
      defaultValue: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'robotsCheckedAt',
      type: 'date',
      label: 'robots.txt tekshirilgan',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'lastRequestAt',
      type: 'date',
      label: 'Domenga oxirgi so‘rov',
      admin: {
        ...readOnlySidebar,
        description: 'Domen bo‘yicha rate limit (rateLimitSec) uchun',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'robotsCache',
      type: 'json',
      label: 'robots.txt keshi',
      admin: {
        ...readOnlySidebar,
        description: 'item.fetch: origin → qoidalar, 24 soat keshlanadi (src/scraping/robots.ts)',
      },
    },
    {
      name: 'stats',
      type: 'json',
      label: 'Statistika',
      admin: {
        ...readOnlySidebar,
        description: 'Oxirgi muvaffaqiyat/xato, ketma-ket xatolar soni',
      },
    },
  ],
}
