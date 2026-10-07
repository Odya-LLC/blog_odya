import {
  BlocksFeature,
  CodeBlock,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import type { Access, Block, CollectionConfig, FieldAccess, Where } from 'payload'

import { isAdmin, isAdminOrEditor, isAdminOrEditorUser } from '@/access'
import { postRevisionEndpoints } from '@/editorial/endpoints'
import { viewsTotalField } from '@/pageviews/field'
import { slugField } from '@/fields/slug'
import { postRedirectHooks } from '@/hooks/contentRedirects'
import { revalidatePostAfterChange, revalidatePostAfterDelete } from '@/site/revalidate'
import { makeEndpoint } from '@/social/make/endpoint'
import { resyncCyrlEndpoint } from '@/translit/resync'

import { applyDefaultAuthor } from './defaultAuthor'
import { deriveFields, enforceWorkflow, syncScheduledPublish } from './hooks'
import {
  queueIndexNowAfterChange,
  queueIndexNowAfterDelete,
  rememberIndexNowState,
} from './indexnow'
import { keepRevisionMarker } from './revisionMarker'
import { queueMakeAfterChange } from './make'
import { preserveTelegramState, queueTelegramAfterChange } from './telegram'
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

/** `keepLatin` ko'pi bilan shuncha atama (har biri ≤ 100 belgi). */
export const KEEP_LATIN_MAX = 50

/** `keepLatin`: bo'sh yoki satrlar ro'yxati (lotin, kirill harflarisiz). */
export function validateKeepLatin(value: unknown): true | string {
  if (value === null || value === undefined) return true
  if (!Array.isArray(value)) return 'Roʻyxat boʻlishi kerak: ["Figure", "Game Informer"]'
  if (value.length > KEEP_LATIN_MAX) return `Koʻpi bilan ${KEEP_LATIN_MAX} ta atama`
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) return 'Har bir element — boʻsh boʻlmagan matn'
    if (item.length > 100) return `"${item.slice(0, 20)}…": koʻpi bilan 100 belgi`
    if (/[Ѐ-ӿ]/.test(item)) return `"${item}": kirill harflari boʻlmasin`
  }
  return true
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
    defaultColumns: [
      'title',
      'workflowStatus',
      'category',
      'assignee',
      'publishedAt',
      'viewsTotal',
      'updatedAt',
    ],
    listSearchableFields: ['title', 'slug'],
  },
  defaultSort: '-updatedAt',
  // OBLOG-67: `POST /api/posts/resync-cyrl` — chop etilgan postlar kirillini qayta yaratish (admin).
  // OBLOG-64: `/:id/publish-revision`, `/:id/discard-revision` — /admin/review navbati.
  // OBLOG-91: `/:id/make` — Make sinov yuborish / qo'lda yuborish (admin).
  endpoints: [resyncCyrlEndpoint, ...postRevisionEndpoints, makeEndpoint],
  versions: {
    drafts: {
      autosave: { interval: 10_000 },
      schedulePublish: true,
    },
    // Bepul DB hajmi uchun cheklangan (TZ §7).
    maxPerDoc: 10,
  },
  hooks: {
    // Bo'sh `authors` → standart muallif (yaratish va chop etishda, OBLOG-57).
    beforeChange: [
      enforceWorkflow,
      deriveFields,
      applyDefaultAuthor,
      ...postRedirectHooks.beforeChange,
      rememberIndexNowState,
    ],
    // Sayt keshi (ISR): publish/unpublish/arxivlash → revalidateTag (M1-05). Slug/kategoriya
    // o'zgarsa (publish'da) — 301 redirect (`hooks/contentRedirects.ts`, TZ §8.1).
    // Telegram avtopost (M3-01, TZ §7.1): chop etilganda `telegram.post` job'lari.
    // IndexNow (OBLOG-57): publish/unpublish/slug o'zgarishida `indexnow.submit` job'i.
    afterChange: [
      syncScheduledPublish,
      ...postRedirectHooks.afterChange,
      revalidatePostAfterChange,
      queueTelegramAfterChange,
      queueIndexNowAfterChange,
      queueMakeAfterChange,
    ],
    afterDelete: [revalidatePostAfterDelete, queueIndexNowAfterDelete],
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
              // OBLOG-64: chop etilgan postdagi o'zgarish tekshiruvga yuborilgan (MCP
              // `submit_for_review`) — `/admin/review` dagi "Chop etilgan postlardagi o'zgarishlar".
              // Faqat qoralama versiyada; har qanday chop etish o'chiradi (`revisionMarker.ts`).
              type: 'row',
              admin: { condition: (data) => Boolean(data?.revisionSubmittedAt) },
              fields: [
                {
                  name: 'revisionSubmittedAt',
                  type: 'date',
                  label: 'O‘zgarishlar tekshiruvga yuborilgan',
                  hooks: { beforeChange: [keepRevisionMarker('revisionSubmittedAt')] },
                  admin: {
                    readOnly: true,
                    width: '50%',
                    date: { pickerAppearance: 'dayAndTime' },
                  },
                },
                {
                  name: 'revisionSubmittedBy',
                  type: 'relationship',
                  label: 'Kim yuborgan',
                  relationTo: 'users',
                  hooks: { beforeChange: [keepRevisionMarker('revisionSubmittedBy')] },
                  admin: { readOnly: true, width: '50%' },
                },
              ],
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
              // Holat faqat `telegram.post` job'i yozadi (asosiy jadvalga) — `preserveTelegramState`.
              // Admin'da ko'rinishi — yon paneldagi "Telegram" bloki (`TelegramPanel`).
              name: 'telegram',
              type: 'array',
              label: 'Telegram (kanal bo‘yicha holat)',
              access: { create: systemOnly, update: systemOnly },
              hooks: { beforeChange: [preserveTelegramState] },
              admin: { readOnly: true, hidden: true },
              fields: [
                {
                  name: 'script',
                  type: 'select',
                  label: 'Yozuv',
                  required: true,
                  options: SCRIPTS.map(({ label, value }) => ({ label, value })),
                },
                { name: 'chatId', type: 'text', label: 'Kanal (chat ID)' },
                { name: 'messageId', type: 'text', label: 'Xabar ID' },
                {
                  name: 'kind',
                  type: 'select',
                  label: 'Xabar turi',
                  options: [
                    { label: 'Rasm + caption (sendPhoto)', value: 'photo' },
                    { label: 'Matn (sendMessage)', value: 'text' },
                  ],
                },
                { name: 'hash', type: 'text', label: 'Matn xeshi' },
                { name: 'sentAt', type: 'date', label: 'Yuborilgan' },
                { name: 'error', type: 'textarea', label: 'Xato' },
              ],
            },
            {
              // OBLOG-67: kirill versiyasida lotinda qoladigan atamalar (brend, mahsulot, asl ism).
              name: 'keepLatin',
              type: 'json',
              label: 'Kirillda lotinda qoladigan atamalar',
              validate: validateKeepLatin,
              admin: {
                description:
                  'JSON roʻyxat, masalan ["Figure", "Game Informer"]: shu postning kirill versiyasida bu atamalar transliteratsiya qilinmaydi (katta-kichik harf farqlanadi; qoʻshimcha qoʻshilsa ham — "Figuredan"). Hamma postlar uchun — glossariy (doNotTransliterate). MCP agent save_rewrite(keepLatin) bilan yozadi.',
              },
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
    viewsTotalField,
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
    // Telegram holati (kanal bo'yicha: yuborilgan / navbatda / xato) — faqat o'qish (M3-01).
    {
      name: 'telegramPanel',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/TelegramPanel#TelegramPanel' },
      },
    },
    {
      // OBLOG-91: Make.com avtopost (Instagram va boshqalar) — chop etilganda yuborilmasin.
      name: 'socialSkip',
      type: 'checkbox',
      label: 'Ijtimoiy tarmoqlarga (Make) yubormaslik',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    // Make holati (yozuv bo'yicha: yuborilgan / navbatda / xato) + sinov tugmasi (OBLOG-91).
    {
      name: 'makePanel',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/MakePanel#MakePanel' },
      },
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
