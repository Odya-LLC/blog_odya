import {
  BlocksFeature,
  CodeBlock,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import type { Access, Block, CollectionConfig, FieldAccess, Where } from 'payload'

import { isAdmin, isAdminOrEditor, isAdminOrEditorUser } from '@/access'
import { slugField } from '@/fields/slug'
import { postRedirectHooks } from '@/hooks/contentRedirects'
import { revalidatePostAfterChange, revalidatePostAfterDelete } from '@/site/revalidate'

import { deriveFields, enforceWorkflow, syncScheduledPublish } from './hooks'
import { POST_WORKFLOW_STATUSES, WORKFLOW_STATUS_LABELS } from './workflow'

export * from './workflow'

/** Tashqi embed (YouTube, X, Telegram post va h.k.) — URL bo'yicha frontend'da chiziladi. */
export const EmbedBlock: Block = {
  slug: 'embed',
  interfaceName: 'EmbedBlock',
  labels: { singular: 'Embed', plural: 'Embedlar' },
  fields: [
    { name: 'url', type: 'text', label: 'URL', required: true },
    { name: 'caption', type: 'text', label: 'Izoh' },
  ],
}

/** Ommaviy o'qish: faqat chop etilgan va arxivlanmagan postlar; admin/editor — hammasi. */
const readPosts: Access = ({ req }) => {
  if (isAdminOrEditorUser(req.user)) return true
  const where: Where = {
    and: [{ _status: { equals: 'published' } }, { workflowStatus: { not_equals: 'archived' } }],
  }
  return where
}

/** Faqat tizim (job'lar, `overrideAccess`) yozadigan maydonlar. */
const systemOnly: FieldAccess = () => false

export const SCRIPTS = [
  { label: 'Lotin (uz-Latn)', value: 'uz-Latn' },
  { label: 'Kirill (uz-Cyrl)', value: 'uz-Cyrl' },
] as const

/**
 * Postlar (TZ §10.3): drafts + autosave (10 s) + versiyalar (maxPerDoc 10), scheduled publish,
 * workflow (TZ §4.1) — `hooks.ts`, o'tishlar — `workflow.ts`. SEO `meta` (L) — `plugin-seo`.
 *
 * Kirill avtomatik generatsiyasi (TZ §3.6): `cyrlSyncPlugin` (`payload.config.ts`, plugin-seo'dan
 * keyin — `meta.*` ham) — `title`, `excerpt`, `content`, `faq`, `coverAlt`, `meta.*` lotin
 * saqlanganda uz-Cyrl o'sha saqlashda yoziladi; `cyrlLocked` / `cyrlStale` — `src/translit/cyrlSync.ts`.
 * `sources[].scrapedItem` — rel → scraped-items (M2-01).
 */
export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: {
    singular: 'Post',
    plural: 'Postlar',
  },
  access: {
    read: readPosts,
    readVersions: isAdminOrEditor,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    // Postni o'chirish — faqat admin (TZ §4.2).
    delete: isAdmin,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'workflowStatus', 'category', 'assignee', 'publishedAt', 'updatedAt'],
    listSearchableFields: ['title', 'slug'],
  },
  defaultSort: '-updatedAt',
  versions: {
    drafts: {
      autosave: { interval: 10_000 },
      schedulePublish: true,
    },
    // Bepul DB hajmi uchun cheklangan (TZ §7).
    maxPerDoc: 10,
  },
  hooks: {
    beforeChange: [enforceWorkflow, deriveFields, ...postRedirectHooks.beforeChange],
    // Sayt keshi (ISR): publish/unpublish/arxivlash → revalidateTag (M1-05). Slug/kategoriya
    // o'zgarsa (publish'da) — 301 redirect (`hooks/contentRedirects.ts`, TZ §8.1).
    afterChange: [
      syncScheduledPublish,
      ...postRedirectHooks.afterChange,
      revalidatePostAfterChange,
    ],
    afterDelete: [revalidatePostAfterDelete],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Tarkib',
          fields: [
            {
              name: 'title',
              type: 'text',
              label: 'Sarlavha',
              localized: true,
              required: true,
            },
            {
              name: 'excerpt',
              type: 'textarea',
              label: 'Lid',
              localized: true,
            },
            {
              name: 'coverImage',
              type: 'upload',
              label: 'Muqova',
              relationTo: 'media',
            },
            {
              name: 'coverAlt',
              type: 'text',
              label: 'Muqova alt matni (taklif)',
              localized: true,
              admin: {
                description:
                  'AI agent taklifi (MCP set_seo): muqova rasmi tanlanganda uning alt matni sifatida ishlating',
              },
            },
            {
              name: 'content',
              type: 'richText',
              label: 'Matn',
              localized: true,
              editor: lexicalEditor({
                features: ({ defaultFeatures }) => [
                  ...defaultFeatures,
                  FixedToolbarFeature(),
                  EXPERIMENTAL_TableFeature(),
                  BlocksFeature({ blocks: [CodeBlock(), EmbedBlock] }),
                ],
              }),
            },
            {
              name: 'faq',
              type: 'array',
              label: 'FAQ',
              localized: true,
              fields: [
                { name: 'question', type: 'text', label: 'Savol', required: true },
                { name: 'answer', type: 'textarea', label: 'Javob', required: true },
              ],
            },
          ],
        },
        {
          label: 'Manbalar',
          fields: [
            {
              name: 'sources',
              type: 'array',
              label: 'Manbalar (atributsiya)',
              admin: {
                description: 'Saytda "Manba: …" blokida ko‘rsatiladi (TZ §2.3).',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'name', type: 'text', label: 'Nomi', admin: { width: '40%' } },
                    {
                      name: 'url',
                      type: 'text',
                      label: 'URL',
                      required: true,
                      admin: { width: '60%' },
                    },
                  ],
                },
                {
                  name: 'scrapedItem',
                  type: 'relationship',
                  relationTo: 'scraped-items',
                  label: 'Yig‘ilgan element',
                },
              ],
            },
            {
              name: 'relatedPosts',
              type: 'relationship',
              label: "O'xshash postlar",
              relationTo: 'posts',
              hasMany: true,
              filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true),
            },
          ],
        },
        {
          label: 'Tahririyat',
          fields: [
            {
              name: 'notesForEditor',
              type: 'textarea',
              label: 'Muharrir uchun izoh (agent)',
            },
            {
              name: 'reviewNotes',
              type: 'array',
              label: 'Tekshiruv izohlari',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'user',
                      type: 'relationship',
                      label: 'Kim',
                      relationTo: 'users',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'createdAt',
                      type: 'date',
                      label: 'Sana',
                      admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' } },
                    },
                  ],
                },
                { name: 'note', type: 'textarea', label: 'Izoh', required: true },
              ],
            },
            {
              name: 'rejectReason',
              type: 'textarea',
              label: 'Rad etish sababi',
              admin: {
                condition: (data) => data?.workflowStatus === 'rejected',
              },
            },
            {
              name: 'telegram',
              type: 'array',
              label: 'Telegram (kanal bo‘yicha holat)',
              access: { create: systemOnly, update: systemOnly },
              admin: { readOnly: true },
              fields: [
                {
                  name: 'script',
                  type: 'select',
                  label: 'Yozuv',
                  required: true,
                  options: SCRIPTS.map(({ label, value }) => ({ label, value })),
                },
                { name: 'messageId', type: 'text', label: 'Xabar ID' },
                { name: 'sentAt', type: 'date', label: 'Yuborilgan' },
                { name: 'error', type: 'textarea', label: 'Xato' },
              ],
            },
            {
              name: 'cyrlLocked',
              type: 'json',
              label: 'Qo‘lda tuzatilgan kirill maydonlari',
              admin: {
                readOnly: true,
                description:
                  '{ title, excerpt, content, meta, faq, coverAlt } — kirill qoʻlda tuzatilganda avtomatik qulflanadi; "Kirillni qayta generatsiya qilish" qulfni oladi',
              },
            },
          ],
        },
      ],
    },
    // Asl manba (read-only) — `sources[].scrapedItem` bo'yicha, sidebar tepasida (M2-04).
    {
      name: 'sourcePanel',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/SourcePanel#SourcePanel' },
      },
    },
    slugField('title', { checkReserved: false }),
    {
      name: 'workflowStatus',
      type: 'select',
      label: 'Holat',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: POST_WORKFLOW_STATUSES.map((value) => ({
        label: WORKFLOW_STATUS_LABELS[value],
        value,
      })),
      admin: { position: 'sidebar' },
    },
    {
      name: 'category',
      type: 'relationship',
      label: 'Kategoriya',
      relationTo: 'categories',
      required: true,
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'tags',
      type: 'relationship',
      label: 'Teglar',
      relationTo: 'tags',
      hasMany: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'authors',
      type: 'relationship',
      label: 'Mualliflar',
      relationTo: 'authors',
      hasMany: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'assignee',
      type: 'relationship',
      label: 'Mas’ul',
      relationTo: 'users',
      admin: { position: 'sidebar' },
    },
    {
      name: 'lockedUntil',
      type: 'date',
      label: 'Band qilingan (gacha)',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Chop etilgan sana',
      index: true,
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'scheduledAt',
      type: 'date',
      label: 'Rejalashtirilgan vaqt',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: '"Rejalashtirilgan" holatida shu vaqtda avtomatik chop etiladi',
      },
    },
    {
      name: 'rewrittenBy',
      type: 'select',
      label: 'Kim qayta yozgan',
      defaultValue: 'human',
      options: [
        { label: 'Inson', value: 'human' },
        { label: 'AI agent', value: 'ai_agent' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'aiDisclosure',
      type: 'checkbox',
      label: 'AI shaffoflik izohi',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: '"AI agent" tanlanganda avtomatik yoqiladi',
      },
    },
    {
      name: 'isFeatured',
      type: 'checkbox',
      label: 'Asosiy yangilik',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    {
      name: 'isBreaking',
      type: 'checkbox',
      label: 'Tezkor xabar',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    {
      name: 'telegramSkip',
      type: 'checkbox',
      label: "Telegram'ga yubormaslik",
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    {
      name: 'cyrlStale',
      type: 'checkbox',
      label: 'Kirill eskirgan',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description:
          'Lotin o‘zgargan, lekin qulflangan kirill maydonlari yangilanmadi. Tekshirib, belgini oling yoki kirillni qayta generatsiya qiling.',
      },
    },
    {
      name: 'readingTime',
      type: 'number',
      label: "O'qish vaqti (daqiqa)",
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'views',
      type: 'number',
      label: "Ko'rishlar",
      defaultValue: 0,
      access: { create: systemOnly, update: systemOnly },
      admin: { position: 'sidebar', readOnly: true },
    },
  ],
}
