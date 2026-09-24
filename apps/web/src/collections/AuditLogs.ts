import { APIError, type CollectionConfig } from 'payload'

import { isAdminOrEditor } from '@/access'
import {
  AUDIT_ACTOR_TYPES,
  AUDIT_CHANNEL_LABELS,
  AUDIT_CHANNELS,
  type AuditActorType,
} from '@/audit/channel'

export const AUDIT_LOGS_SLUG = 'audit-logs'

export const AUDIT_ACTIONS = ['create', 'update', 'publish', 'delete'] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

const ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Yaratildi',
  update: "O'zgartirildi",
  publish: 'Chop etildi',
  delete: "O'chirildi",
}

const ACTOR_LABELS: Record<AuditActorType, string> = {
  user: 'Foydalanuvchi',
  system: 'Tizim',
}

/**
 * `req.context.auditRetention === true` — faqat saqlash muddati (TZ §6.4: 1 yil) o'tgan
 * yozuvlarni tozalaydigan kelajakdagi job uchun (Local API, `overrideAccess`).
 */
export interface AuditRetentionContext {
  auditRetention?: boolean
}

const immutable = (message: string) => new APIError(message, 403, null, true)

const readOnly = { readOnly: true }

/**
 * Audit log (TZ §6.4, §10.12): barcha kontent o'zgarishlari izi — faqat yoziladi.
 *
 * - Yozuvlarni faqat audit hook'lari yaratadi (`src/audit`, `overrideAccess`); REST/GraphQL/admin
 *   orqali hech kim yarata, o'zgartira yoki o'chira olmaydi (access `false`).
 * - `overrideAccess` bilan ham o'zgartirish rad etiladi (`beforeChange`); o'chirish — faqat
 *   `context.auditRetention` bilan (saqlash muddati tozalovi).
 * - O'qish: admin va editor (TZ §4.2: editor — faqat o'qish).
 * - Bu kolleksiyaning o'zi audit qilinmaydi (rekursiya yo'q).
 */
export const AuditLogs: CollectionConfig = {
  slug: AUDIT_LOGS_SLUG,
  labels: {
    singular: 'Audit yozuvi',
    plural: 'Audit log',
  },
  access: {
    read: isAdminOrEditor,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['createdAt', 'action', 'collection', 'title', 'user', 'channel'],
    listSearchableFields: ['docId', 'title', 'collection'],
    group: 'Tizim',
  },
  defaultSort: '-createdAt',
  disableDuplicate: true,
  hooks: {
    beforeChange: [
      ({ operation }) => {
        if (operation !== 'create') throw immutable("Audit yozuvini o'zgartirib bo'lmaydi")
      },
    ],
    beforeDelete: [
      ({ req }) => {
        if ((req.context as AuditRetentionContext).auditRetention !== true) {
          throw immutable("Audit yozuvini o'chirib bo'lmaydi")
        }
      },
    ],
  },
  fields: [
    {
      name: 'action',
      type: 'select',
      label: 'Amal',
      required: true,
      options: AUDIT_ACTIONS.map((value) => ({ label: ACTION_LABELS[value], value })),
      admin: readOnly,
    },
    {
      name: 'collection',
      type: 'text',
      label: 'Kolleksiya',
      index: true,
      admin: readOnly,
    },
    {
      name: 'global',
      type: 'text',
      label: 'Global',
      admin: readOnly,
    },
    {
      name: 'docId',
      type: 'text',
      label: 'Hujjat ID',
      index: true,
      admin: readOnly,
    },
    {
      name: 'title',
      type: 'text',
      label: 'Hujjat nomi',
      admin: readOnly,
    },
    {
      name: 'locale',
      type: 'text',
      label: 'Locale',
      admin: readOnly,
    },
    {
      name: 'diff',
      type: 'json',
      label: "O'zgarishlar",
      admin: {
        ...readOnly,
        description:
          "Faqat o'zgargan maydonlar: { maydon: { from, to } }. Katta qiymatlar (masalan, matn) — { _omitted, chars }.",
      },
    },
    {
      name: 'actorType',
      type: 'select',
      label: 'Kim',
      required: true,
      options: AUDIT_ACTOR_TYPES.map((value) => ({ label: ACTOR_LABELS[value], value })),
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'user',
      type: 'relationship',
      label: 'Foydalanuvchi',
      relationTo: 'users',
      index: true,
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'channel',
      type: 'select',
      label: 'Kanal',
      required: true,
      index: true,
      options: AUDIT_CHANNELS.map((value) => ({ label: AUDIT_CHANNEL_LABELS[value], value })),
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'tool',
      type: 'text',
      label: 'MCP tool',
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'ip',
      type: 'text',
      label: 'IP',
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'userAgent',
      type: 'text',
      label: 'User-Agent',
      admin: { ...readOnly, position: 'sidebar' },
    },
  ],
}
