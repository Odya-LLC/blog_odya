import type { GlobalConfig } from 'payload'

import { anyone, isAdminOrEditor } from '@/access'
import { linkFields } from '@/fields/link'
import { revalidateNavAfterChange } from '@/site/revalidate'

/**
 * Header menyusi (TZ §10.15, §12.3) **(L)**: asosiy menyu va "Yana" menyusi.
 * Menyu boshqarish — admin va editor (TZ §4.2).
 */
export const Header: GlobalConfig = {
  slug: 'header',
  label: 'Header (menyu)',
  hooks: {
    afterChange: [revalidateNavAfterChange],
  },
  access: {
    read: anyone,
    update: isAdminOrEditor,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      label: 'Asosiy menyu',
      fields: linkFields(),
    },
    {
      name: 'moreItems',
      type: 'array',
      label: '"Yana" menyusi',
      fields: linkFields(),
    },
  ],
}
