import type { GlobalConfig } from 'payload'

import { anyone, isAdminOrEditor } from '@/access'
import { linkFields } from '@/fields/link'
import { revalidateNavAfterChange } from '@/site/revalidate'

/**
 * Footer (TZ §10.15, §12.3) **(L)**: havola ustunlari (kategoriyalar, huquqiy sahifalar),
 * mualliflik qatori ("© Odya LLC").
 */
export const Footer: GlobalConfig = {
  slug: 'footer',
  label: 'Footer',
  hooks: {
    afterChange: [revalidateNavAfterChange],
  },
  access: {
    read: anyone,
    update: isAdminOrEditor,
  },
  fields: [
    {
      name: 'columns',
      type: 'array',
      label: 'Ustunlar',
      fields: [
        { name: 'title', type: 'text', label: 'Sarlavha', localized: true },
        {
          name: 'links',
          type: 'array',
          label: 'Havolalar',
          fields: linkFields(),
        },
      ],
    },
    {
      name: 'copyright',
      type: 'text',
      label: 'Mualliflik qatori',
      localized: true,
      defaultValue: '© Odya LLC',
    },
  ],
}
