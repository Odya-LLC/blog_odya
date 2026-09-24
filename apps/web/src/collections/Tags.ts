import type { CollectionConfig } from 'payload'

import { anyone, isAdmin, isAdminOrEditor } from '@/access'
import { slugField } from '@/fields/slug'
import { revalidatePostListsAfterChange } from '@/site/revalidate'

/**
 * Teglar (TZ §10.5): o'yin/platforma/kompaniya nomlari (CS2, ChatGPT, iPhone ...).
 * SEO `meta` (L) guruhi — `plugin-seo`.
 */
export const Tags: CollectionConfig = {
  slug: 'tags',
  labels: {
    singular: 'Teg',
    plural: 'Teglar',
  },
  access: {
    read: anyone,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [revalidatePostListsAfterChange],
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'updatedAt'],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Asosiy',
          fields: [
            {
              name: 'name',
              type: 'text',
              label: 'Nomi',
              localized: true,
              required: true,
            },
            {
              name: 'description',
              type: 'textarea',
              label: 'Tavsif',
              localized: true,
            },
            {
              name: 'synonyms',
              type: 'array',
              label: 'Sinonimlar',
              admin: {
                description:
                  'Qidiruv va klassifikatsiya uchun muqobil yozilishlar (masalan, "Counter-Strike 2")',
              },
              fields: [
                {
                  name: 'value',
                  type: 'text',
                  label: 'Sinonim',
                  required: true,
                },
              ],
            },
          ],
        },
      ],
    },
    slugField('name'),
  ],
}
