import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'

/**
 * Instagram dayjest karusellari (OBLOG-118) — jurnal va idempotentlik. Faqat tizim
 * (`/api/jobs/run` nashr bosqichi — `src/social/instagram/digest.ts`) yozadi. Telegram
 * dayjestlaridan (`telegram-digests`) alohida — ularning ma'lumotiga tegmaydi.
 *
 * `key` = `ig-digest:{slotAt ISO}` — UNIQUE: bitta slot uchun bitta qator. Tick uni Make'ga
 * yuborishdan **oldin** atomar band qiladi (`INSERT … ON CONFLICT DO UPDATE … WHERE` — `pending`),
 * parallel tick'lar va qayta urinishlar ikkinchi marta yubormaydi. `posts` — karuseldagi postlar
 * (slayd tartibida), `skippedPosts` — sig'maganlar (keyingi dayjestlarga ham tushmaydi).
 */
export const InstagramDigests: CollectionConfig = {
  slug: 'instagram-digests',
  labels: { singular: 'Instagram dayjest', plural: 'Instagram dayjestlar' },
  access: {
    read: isAdminOrEditor,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  admin: {
    group: 'Tizim',
    useAsTitle: 'key',
    defaultColumns: ['slotAt', 'status', 'format', 'posts', 'attempts', 'sentAt'],
    description:
      'Make orqali Instagram’ga yuborilgan dayjest karusellari (slot bo‘yicha bir marta, faqat lotin). Sozlamalar — “Ijtimoiy tarmoqlar (Make)” → Instagram rejimi.',
  },
  defaultSort: '-slotAt',
  fields: [
    { name: 'key', type: 'text', label: 'Kalit', required: true, unique: true, index: true },
    {
      type: 'row',
      fields: [
        {
          name: 'slotAt',
          type: 'date',
          label: 'Slot',
          required: true,
          index: true,
          admin: { width: '33%', date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'status',
          type: 'select',
          label: 'Holat',
          required: true,
          defaultValue: 'pending',
          options: [
            { label: 'Yuborilmoqda', value: 'pending' },
            { label: 'Yuborildi', value: 'sent' },
            { label: 'Post yo‘q (yuborilmadi)', value: 'empty' },
            { label: 'Qayta urinish kutilmoqda', value: 'retry' },
            { label: 'Xato', value: 'failed' },
          ],
          admin: { width: '33%' },
        },
        {
          name: 'format',
          type: 'select',
          label: 'Turi',
          options: [
            { label: 'Karusel (muqova + postlar)', value: 'carousel' },
            { label: 'Bitta post — odatdagi rasmli post', value: 'single' },
          ],
          admin: { width: '33%' },
        },
      ],
    },
    {
      name: 'posts',
      type: 'relationship',
      label: 'Postlar (slayd tartibida)',
      relationTo: 'posts',
      hasMany: true,
    },
    {
      name: 'skippedPosts',
      type: 'relationship',
      label: 'Sig‘magan postlar (Instagram’ga yuborilmadi)',
      relationTo: 'posts',
      hasMany: true,
    },
    {
      type: 'row',
      fields: [
        { name: 'attempts', type: 'number', label: 'Urinishlar', admin: { width: '25%' } },
        { name: 'httpStatus', type: 'number', label: 'HTTP javob', admin: { width: '25%' } },
        {
          name: 'sentAt',
          type: 'date',
          label: 'Yuborilgan',
          admin: { width: '25%', date: { pickerAppearance: 'dayAndTime' } },
        },
        { name: 'deliveryId', type: 'text', label: 'X-Odya-Delivery', admin: { width: '25%' } },
      ],
    },
    { name: 'coverUrl', type: 'text', label: 'Muqova slaydi (URL)' },
    { name: 'error', type: 'textarea', label: 'Xato' },
  ],
}
