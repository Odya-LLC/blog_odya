import type { CollectionConfig } from 'payload'

import { anyone, isAdmin, isAdminOrEditor } from '@/access'
import { slugField } from '@/fields/slug'

export const SOCIAL_PLATFORMS = [
  { label: 'Telegram', value: 'telegram' },
  { label: 'X (Twitter)', value: 'x' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'GitHub', value: 'github' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Veb-sayt', value: 'website' },
] as const

/** Mualliflar — ommaviy profil (TZ §10.6). Foydalanuvchi (`users`) bilan ixtiyoriy bog'lanadi. */
export const Authors: CollectionConfig = {
  slug: 'authors',
  labels: {
    singular: 'Muallif',
    plural: 'Mualliflar',
  },
  access: {
    read: anyone,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'isActive', 'updatedAt'],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Ism',
      localized: true,
      required: true,
    },
    slugField('name'),
    {
      name: 'position',
      type: 'text',
      label: 'Lavozim',
      localized: true,
    },
    {
      name: 'bio',
      type: 'textarea',
      label: 'Biografiya',
      localized: true,
    },
    {
      name: 'avatar',
      type: 'upload',
      label: 'Avatar',
      relationTo: 'media',
    },
    {
      name: 'user',
      type: 'relationship',
      label: 'Foydalanuvchi',
      relationTo: 'users',
      admin: { position: 'sidebar' },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      label: 'Faol',
      defaultValue: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'socials',
      type: 'array',
      label: 'Ijtimoiy tarmoqlar',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'platform',
              type: 'select',
              label: 'Tarmoq',
              required: true,
              options: SOCIAL_PLATFORMS.map(({ label, value }) => ({ label, value })),
              admin: { width: '30%' },
            },
            {
              name: 'url',
              type: 'text',
              label: 'Havola',
              required: true,
              admin: { width: '70%' },
            },
          ],
        },
      ],
    },
  ],
}
