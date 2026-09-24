import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'
import { scrapedItemEndpoints } from '@/editorial/endpoints'

/**
 * `scraped-items` holatlari (TZ §10.2). `pending` — RSS'dan topilgan, sahifa hali yuklanmagan /
 * matn ajratilmagan (`scrapeItem` workflow navbatda, M2-02); `scraped` — to'liq matn tayyor.
 */
export const SCRAPED_ITEM_STATUSES = [
  'pending',
  'scraped',
  'drafted',
  'rejected',
  'duplicate',
  'error',
] as const

export type ScrapedItemStatus = (typeof SCRAPED_ITEM_STATUSES)[number]

const STATUS_LABELS: Record<ScrapedItemStatus, string> = {
  pending: 'Navbatda',
  scraped: "Yig'ilgan",
  drafted: 'Qoralama yaratilgan',
  rejected: 'Rad etilgan',
  duplicate: 'Dublikat',
  error: 'Xato',
}

/**
 * Yig'ilgan yangiliklar (TZ §3.5, §10.2) — "to'liq manba" arxivi.
 *
 * DB'da faqat metadata va `extractedText` (Markdown) saqlanadi; raw/clean HTML — R2
 * (`rawHtmlKey`, `cleanHtmlKey`, 30 kun TTL). Manba rasmlari yuklanmaydi — faqat URL.
 * Dedupe — `urlHash` (SHA-256, normallashtirilgan URL, unique). Yaratish — faqat job'lar
 * (`feed.poll`, `overrideAccess`); editor ko'radi va holatini o'zgartiradi (TZ §4.2).
 */
export const ScrapedItems: CollectionConfig = {
  slug: 'scraped-items',
  labels: {
    singular: "Yig'ilgan element",
    plural: "Yig'ilgan elementlar",
  },
  access: {
    read: isAdminOrEditor,
    create: isAdmin,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'source', 'status', 'score', 'publishedAt', 'createdAt'],
    listSearchableFields: ['title', 'url'],
    group: 'Scraping',
  },
  defaultSort: '-createdAt',
  // Tahririyat navbati (M2-04): "Qoralamaga olish" va "Rad etish" — `src/editorial/`.
  endpoints: scrapedItemEndpoints,
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Sarlavha',
    },
    {
      type: 'row',
      fields: [
        {
          name: 'source',
          type: 'relationship',
          relationTo: 'sources',
          label: 'Manba',
          required: true,
          index: true,
          admin: { width: '50%' },
        },
        {
          name: 'status',
          type: 'select',
          label: 'Holat',
          required: true,
          defaultValue: 'pending',
          index: true,
          options: SCRAPED_ITEM_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'url',
      type: 'text',
      label: 'Asl URL',
      required: true,
    },
    {
      name: 'canonicalUrl',
      type: 'text',
      label: 'Canonical URL',
    },
    {
      name: 'urlHash',
      type: 'text',
      label: 'URL hash (SHA-256)',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'author',
          type: 'text',
          label: 'Muallif',
          admin: { width: '33%' },
        },
        {
          name: 'publishedAt',
          type: 'date',
          label: 'Manbada chop etilgan',
          index: true,
          admin: { width: '33%', date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'language',
          type: 'select',
          label: 'Til',
          options: [
            { label: 'en', value: 'en' },
            { label: 'ru', value: 'ru' },
          ],
          admin: { width: '33%' },
        },
      ],
    },
    {
      name: 'excerpt',
      type: 'textarea',
      label: 'Qisqacha (RSS description)',
    },
    {
      name: 'extractedText',
      type: 'textarea',
      label: 'To‘liq matn (Markdown)',
    },
    {
      name: 'imageUrls',
      type: 'array',
      label: 'Rasmlar (faqat havolalar)',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'url', type: 'text', label: 'URL', required: true, admin: { width: '60%' } },
            { name: 'alt', type: 'text', label: 'Alt', admin: { width: '40%' } },
          ],
        },
      ],
    },
    {
      name: 'sourceTags',
      type: 'text',
      label: 'Manba teglari',
      hasMany: true,
    },
    {
      type: 'collapsible',
      label: 'Texnik ma’lumotlar',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'contentHash',
              type: 'text',
              label: 'Content hash (SimHash)',
              index: true,
              admin: { width: '50%' },
            },
            {
              name: 'clusterId',
              type: 'text',
              label: 'Klaster',
              index: true,
              admin: { width: '50%' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'rawHtmlKey',
              type: 'text',
              label: 'R2: raw HTML',
              admin: { width: '50%' },
            },
            {
              name: 'cleanHtmlKey',
              type: 'text',
              label: 'R2: clean HTML',
              admin: { width: '50%' },
            },
          ],
        },
        {
          name: 'fetchMeta',
          type: 'json',
          label: 'HTTP / feed metadata',
        },
        {
          name: 'error',
          type: 'textarea',
          label: 'Xato',
        },
      ],
    },
    {
      name: 'score',
      type: 'number',
      label: 'Score (0–100)',
      min: 0,
      max: 100,
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'wordCount',
      type: 'number',
      label: 'So‘zlar soni',
      admin: { position: 'sidebar' },
    },
    {
      name: 'suggestedCategory',
      type: 'relationship',
      relationTo: 'categories',
      label: 'Taklif qilingan kategoriya',
      admin: { position: 'sidebar' },
    },
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      label: 'Post',
      admin: { position: 'sidebar' },
    },
    {
      name: 'rejectReason',
      type: 'textarea',
      label: 'Rad etish sababi',
      admin: {
        position: 'sidebar',
        condition: (data) => data?.status === 'rejected',
      },
    },
    {
      name: 'handledBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Kim ko‘rib chiqdi',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'handledAt',
      type: 'date',
      label: 'Ko‘rib chiqilgan vaqt',
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
