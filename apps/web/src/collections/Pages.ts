import type { Block, CollectionConfig } from 'payload'

import { isAdmin, isAdminOrEditor, publishedOrAdminEditor } from '@/access'
import { slugField } from '@/fields/slug'
import { revalidatePagesAfterChange, revalidatePagesAfterDelete } from '@/site/revalidate'

/** Matn bloki (Lexical). Huquqiy sahifalar seed'da shu blokka yuklanadi. */
export const ContentBlock: Block = {
  slug: 'content',
  interfaceName: 'ContentBlock',
  labels: { singular: 'Matn', plural: 'Matn bloklari' },
  fields: [
    {
      name: 'richText',
      type: 'richText',
      label: 'Matn',
      required: true,
    },
  ],
}

/** Savol-javob bloki (FAQ; sahifada FAQPage JSON-LD uchun — M1-06). */
export const FaqBlock: Block = {
  slug: 'faq',
  interfaceName: 'FaqBlock',
  labels: { singular: 'Savol-javob', plural: 'Savol-javob bloklari' },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Sarlavha',
    },
    {
      name: 'items',
      type: 'array',
      label: 'Savollar',
      minRows: 1,
      fields: [
        { name: 'question', type: 'text', label: 'Savol', required: true },
        { name: 'answer', type: 'textarea', label: 'Javob', required: true },
      ],
    },
  ],
}

/**
 * Statik sahifalar (TZ §10.13): `title` (L), `slug`, `layout` (L, bloklar), `meta` (L — plugin-seo).
 * Drafts yoqilgan (versiyalar DB hajmi uchun cheklangan). Huquqiy sahifalar — `pnpm seed`.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: {
    singular: 'Sahifa',
    plural: 'Sahifalar',
  },
  access: {
    read: publishedOrAdminEditor,
    readVersions: isAdminOrEditor,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
  },
  versions: {
    drafts: true,
    maxPerDoc: 10,
  },
  hooks: {
    // Sitemap (M1-06): sahifalar ro'yxati keshi.
    afterChange: [revalidatePagesAfterChange],
    afterDelete: [revalidatePagesAfterDelete],
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
              name: 'layout',
              type: 'blocks',
              label: 'Bloklar',
              localized: true,
              blocks: [ContentBlock, FaqBlock],
            },
          ],
        },
      ],
    },
    slugField('title', { topLevel: true }),
  ],
}
