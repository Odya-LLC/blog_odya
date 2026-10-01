import type { CollectionConfig } from 'payload'

import { anyone, isAdmin, isAdminOrEditor } from '@/access'
import { slugField } from '@/fields/slug'
import { tagRedirectHooks } from '@/hooks/contentRedirects'
import { revalidatePostListsAfterChange } from '@/site/revalidate'

/**
 * Teglar (TZ §10.5): o'yin/platforma/kompaniya nomlari (CS2, ChatGPT, iPhone ...).
 * `doNotTransliterate` (OBLOG-67) — brend teg: nomi postlar kirill versiyasida lotinda qoladi
 * (`src/translit/post-terms.ts`).
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
    // Slug o'zgarsa — 301 redirect (`/tag/{slug}`, TZ §8.1).
    afterChange: [...tagRedirectHooks.afterChange, revalidatePostListsAfterChange],
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
            {
              // OBLOG-67: brend teg — nomi kirill versiyasida ham lotinda qoladi.
              name: 'doNotTransliterate',
              type: 'checkbox',
              label: 'Kirillda lotinda qoladi (brend)',
              defaultValue: false,
              admin: {
                description:
                  'Belgilansa, teg nomi (masalan, "Figure", "Game Informer") tegning oʻzida va shu teg biriktirilgan postlarning kirill versiyasida transliteratsiya qilinmaydi. Kirill nomi lotin nomi bilan bir xil boʻlsa ham shunday ishlaydi.',
              },
            },
          ],
        },
      ],
    },
    slugField('name', { checkReserved: false }),
  ],
}
