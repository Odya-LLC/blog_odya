import type {
  CollectionAfterLoginHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
} from 'payload'

import {
  isAdmin,
  isAdminFieldLevel,
  isAdminOrEditorUser,
  isAdminOrSelf,
  ROLE_LABELS,
  ROLES,
} from '@/access'

/**
 * API kalit invarianti (TZ §9.2): kalit bor ⇔ `enableAPIKey: true`.
 *
 * Payload 3.90 admin'idagi "Generate"/"Revoke" `{ apiKey, enableAPIKey }` ni birga yuboradi
 * (revoke — `apiKey: null`, indeks tozalanadi). Lekin API orqali `enableAPIKey: false` bilan
 * birga kalit ham yuborilsa, Payload indeksni qoldiradi va "bekor qilingan" kalit ishlashda
 * davom etardi — shu yerda har doim tozalanadi. Yangi foydalanuvchi formasida kalit
 * `enableAPIKey` siz keladi — bayroq to'ldiriladi.
 */
export const revokeDisabledAPIKey: CollectionBeforeChangeHook = ({ data }) => {
  if (data.enableAPIKey === false) return { ...data, apiKey: null, apiKeyIndex: null }
  if (data.apiKey === null) return { ...data, enableAPIKey: false, apiKeyIndex: null }
  if (typeof data.apiKey === 'string' && data.apiKey) return { ...data, enableAPIKey: true }
  return data
}

/** `lastLoginAt` (TZ §10.11) — hook'larsiz yoziladi (audit'da har kirish shovqin bo'lmasin). */
const recordLastLogin: CollectionAfterLoginHook = async ({ req, user }) => {
  await req.payload.db.updateOne({
    collection: 'users',
    id: user.id,
    data: { lastLoginAt: new Date().toISOString() },
    req,
  })
}

/**
 * Admin panel foydalanuvchilari (TZ §4.2, §10.11).
 *
 * - Rollar: `admin`, `editor`. Foydalanuvchini faqat admin yaratadi/o'chiradi.
 * - Birinchi foydalanuvchi (`/admin/create-first-user`) avtomatik `admin` bo'ladi.
 * - Editor faqat o'z profilini ko'radi/tahrirlaydi; o'z rolini o'zgartira olmaydi.
 * - `enableAPIKey` — shaxsiy API kalit (REST va MCP uchun, TZ §6.3).
 *
 * - `author` — ommaviy muallif profili (TZ §10.11), faqat admin belgilaydi.
 * - API kalit: editor — faqat o'ziniki, admin — hammaniki (`isAdminOrSelf`); kalit va indeks hech
 *   qachon o'qilmaydi (Payload `read: false`), bekor qilish — `revokeDisabledAPIKey`.
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
      revokeDisabledAPIKey,
    ],
    afterLogin: [recordLastLogin],
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
    {
      name: 'author',
      type: 'relationship',
      label: 'Muallif profili',
      relationTo: 'authors',
      access: {
        // Qaysi ommaviy profil nomidan yozishni admin belgilaydi.
        create: isAdminFieldLevel,
        update: isAdminFieldLevel,
      },
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'lastLoginAt',
      type: 'date',
      label: 'Oxirgi kirish',
      access: {
        // Faqat `afterLogin` hook'i yozadi (DB'ga to'g'ridan-to'g'ri).
        create: () => false,
        update: () => false,
      },
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
  ],
}
