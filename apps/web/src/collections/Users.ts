import type { CollectionConfig } from 'payload'

import {
  isAdmin,
  isAdminFieldLevel,
  isAdminOrEditorUser,
  isAdminOrSelf,
  ROLE_LABELS,
  ROLES,
} from '@/access'

/**
 * Admin panel foydalanuvchilari (TZ §4.2, §10.11).
 *
 * - Rollar: `admin`, `editor`. Foydalanuvchini faqat admin yaratadi/o'chiradi.
 * - Birinchi foydalanuvchi (`/admin/create-first-user`) avtomatik `admin` bo'ladi.
 * - Editor faqat o'z profilini ko'radi/tahrirlaydi; o'z rolini o'zgartira olmaydi.
 * - `enableAPIKey` — shaxsiy API kalit (REST va MCP uchun, TZ §6.3).
 *
 * `author` (rel) va `lastLoginAt` — M1-02 / M2-05 da qo'shiladi.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: 'Foydalanuvchi',
    plural: 'Foydalanuvchilar',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role', 'updatedAt'],
  },
  auth: {
    useAPIKey: true,
  },
  access: {
    admin: ({ req }) => isAdminOrEditorUser(req.user),
    create: isAdmin,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
    unlock: isAdmin,
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        // Birinchi foydalanuvchi har doim admin (aks holda tizimni boshqarib bo'lmaydi).
        if (operation === 'create') {
          const { totalDocs } = await req.payload.count({ collection: 'users', req })
          if (totalDocs === 0) return { ...data, role: 'admin' }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Ism',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      label: 'Rol',
      required: true,
      defaultValue: 'editor',
      saveToJWT: true,
      options: ROLES.map((value) => ({ label: ROLE_LABELS[value], value })),
      access: {
        // Rolni faqat admin belgilaydi/o'zgartiradi (editor o'z rolini ko'taraolmaydi).
        create: isAdminFieldLevel,
        update: isAdminFieldLevel,
      },
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
