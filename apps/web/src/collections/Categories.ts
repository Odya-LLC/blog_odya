import type { CollectionConfig } from 'payload'

import { anyone, isAdmin, isAdminOrEditor } from '@/access'
import { slugField } from '@/fields/slug'
import { categoryRedirectHooks } from '@/hooks/contentRedirects'
import { revalidateCategoryAfterChange, revalidateCategoryAfterDelete } from '@/site/revalidate'

/**
 * Kategoriyalar (TZ §10.4). Ierarxiya — `@payloadcms/plugin-nested-docs` (`parent`, `breadcrumbs`
 * maydonlarini plagin qo'shadi, `payload.config.ts`). SEO `meta` (L) guruhi — `plugin-seo`.
 * Boshlang'ich 9 kategoriya — `pnpm seed` (`packages/shared/seed/categories.json`).
 */
export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: {
    singular: 'Kategoriya',
    plural: 'Kategoriyalar',
  },
  access: {
    read: anyone,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'order', 'isInMenu', 'updatedAt'],
  },
  defaultSort: 'order',
  hooks: {
    // Slug o'zgarsa — 301 redirect (`hooks/contentRedirects.ts`, TZ §8.1).
    afterChange: [...categoryRedirectHooks.afterChange, revalidateCategoryAfterChange],
    afterDelete: [revalidateCategoryAfterDelete],
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
          ],
        },
      ],
    },
    slugField('name', { checkReserved: true, uniqueAcross: 'pages' }),
    {
      name: 'color',
      type: 'text',
      label: 'Rang',
      admin: {
        position: 'sidebar',
        description: 'HEX, masalan #52397F (design/brand/tokens.json → category.*.solid)',
      },
      validate: (value: string | null | undefined) =>
        !value || /^#[0-9a-fA-F]{6}$/.test(value) ? true : 'Rang #RRGGBB formatida bo‘lishi kerak',
    },
    {
      name: 'order',
      type: 'number',
      label: 'Tartib',
      defaultValue: 100,
      admin: { position: 'sidebar' },
    },
    {
      name: 'isInMenu',
      type: 'checkbox',
      label: 'Asosiy menyuda',
      defaultValue: true,
      admin: { position: 'sidebar' },
    },
  ],
}
