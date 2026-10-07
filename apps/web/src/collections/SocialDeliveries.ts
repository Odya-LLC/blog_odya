import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'

/**
 * Ijtimoiy tarmoqlarga (hozircha — Make.com webhook'i, OBLOG-91) yuborish jurnali va
 * idempotentlik kaliti. Faqat tizim (`make.webhook` job'i, `overrideAccess`) yozadi.
 *
 * `key` = `make:{postId}:{event}:{script}` — UNIQUE: bitta post bitta yozuvda bir marta
 * yuboriladi (qayta saqlash, unpublish → publish ham dublikat bermaydi). Qatorni o'chirsangiz
 * (faqat admin) — post panelidagi "Make'ga yuborish" bilan qayta yuborish mumkin.
 */
export const SocialDeliveries: CollectionConfig = {
  slug: 'social-deliveries',
  labels: { singular: 'Ijtimoiy yuborish', plural: 'Ijtimoiy yuborishlar' },
  access: {
    read: isAdminOrEditor,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  admin: {
    group: 'Tizim',
    useAsTitle: 'key',
    defaultColumns: ['key', 'status', 'httpStatus', 'attempts', 'sentAt', 'updatedAt'],
    description:
      'Make webhook’iga yuborishlar (post + yozuv bo‘yicha bir marta). Qatorni o‘chirish — qayta yuborishga ruxsat.',
  },
  defaultSort: '-updatedAt',
  fields: [
    { name: 'key', type: 'text', label: 'Kalit', required: true, unique: true, index: true },
    {
      name: 'post',
      type: 'relationship',
      label: 'Post',
      relationTo: 'posts',
      // Post o'chirilsa — `NULL` (jurnal qoladi).
      index: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'target',
          type: 'select',
          label: 'Qayerga',
          required: true,
          defaultValue: 'make',
          options: [{ label: 'Make.com webhook', value: 'make' }],
          admin: { width: '33%' },
        },
        {
          name: 'event',
          type: 'select',
          label: 'Hodisa',
          required: true,
          options: [{ label: 'post.published', value: 'post.published' }],
          admin: { width: '33%' },
        },
        {
          name: 'script',
          type: 'select',
          label: 'Yozuv',
          required: true,
          options: [
            { label: 'Lotin (uz-Latn)', value: 'uz-Latn' },
            { label: 'Kirill (uz-Cyrl)', value: 'uz-Cyrl' },
          ],
          admin: { width: '33%' },
        },
      ],
    },
    {
      name: 'status',
      type: 'select',
      label: 'Holat',
      required: true,
      options: [
        { label: 'Yuborildi', value: 'sent' },
        { label: 'Qayta urinish kutilmoqda', value: 'retry' },
        { label: 'Xato', value: 'failed' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'httpStatus', type: 'number', label: 'HTTP javob', admin: { width: '33%' } },
        { name: 'attempts', type: 'number', label: 'Urinishlar', admin: { width: '33%' } },
        {
          name: 'sentAt',
          type: 'date',
          label: 'Yuborilgan',
          admin: { width: '33%', date: { pickerAppearance: 'dayAndTime' } },
        },
      ],
    },
    { name: 'deliveryId', type: 'text', label: 'X-Odya-Delivery' },
    { name: 'error', type: 'textarea', label: 'Xato' },
  ],
}
