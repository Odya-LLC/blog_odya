import type { Field } from 'payload'

export const LINK_TYPES = [
  { label: 'Kategoriya', value: 'category' },
  { label: 'Sahifa', value: 'page' },
  { label: 'Ixtiyoriy URL', value: 'custom' },
] as const

/**
 * Menyu havolasi (header/footer): kategoriya, sahifa yoki ixtiyoriy URL.
 * `label` lokalizatsiya qilinadi (lotin / kirill), qolganlari ikkala yozuvda umumiy.
 */
export function linkFields(): Field[] {
  return [
    {
      name: 'label',
      type: 'text',
      label: 'Matn',
      localized: true,
      required: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          label: 'Havola turi',
          required: true,
          defaultValue: 'category',
          options: LINK_TYPES.map(({ label, value }) => ({ label, value })),
          admin: { width: '30%' },
        },
        {
          name: 'category',
          type: 'relationship',
          label: 'Kategoriya',
          relationTo: 'categories',
          required: true,
          admin: {
            width: '70%',
            condition: (_, siblingData) => siblingData?.type === 'category',
          },
        },
        {
          name: 'page',
          type: 'relationship',
          label: 'Sahifa',
          relationTo: 'pages',
          required: true,
          admin: {
            width: '70%',
            condition: (_, siblingData) => siblingData?.type === 'page',
          },
        },
        {
          name: 'url',
          type: 'text',
          label: 'URL',
          required: true,
          admin: {
            width: '70%',
            condition: (_, siblingData) => siblingData?.type === 'custom',
          },
        },
      ],
    },
    {
      name: 'newTab',
      type: 'checkbox',
      label: 'Yangi oynada ochish',
      defaultValue: false,
    },
  ]
}
