import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'

/**
 * Telegram dayjestlari (OBLOG-116) — jurnal va idempotentlik. Faqat tizim (`/api/jobs/run` nashr
 * bosqichi, `telegram.digestEdit` job'i — `src/telegram/digest.ts`) yozadi.
 *
 * `key` = `digest:{script}:{slotAt ISO}` — UNIQUE: bitta kanal + slot uchun bitta qator. Tick uni
 * yuborishdan **oldin** atomar band qiladi (`INSERT … ON CONFLICT DO UPDATE … WHERE` — `pending`),
 * parallel tick'lar va qayta urinishlar ikkinchi marta yubormaydi. `posts` — dayjestdagi postlar
 * (tartib — ro'yxat raqami), `skippedPosts` — sig'maganlar (keyingi dayjestlarga ham tushmaydi).
 */
export const TelegramDigests: CollectionConfig = {
  slug: 'telegram-digests',
  labels: { singular: 'Telegram dayjest', plural: 'Telegram dayjestlar' },
  access: {
    read: isAdminOrEditor,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  admin: {
    group: 'Tizim',
    useAsTitle: 'key',
    defaultColumns: ['slotAt', 'script', 'status', 'format', 'posts', 'attempts', 'sentAt'],
    description:
      'Telegram kanallariga yuborilgan dayjestlar (kanal + slot bo‘yicha bir marta). Sozlamalar — “Telegram sozlamalari” (rejim, jadval).',
  },
  defaultSort: '-slotAt',
  fields: [
    { name: 'key', type: 'text', label: 'Kalit', required: true, unique: true, index: true },
    {
      type: 'row',
      fields: [
        {
          name: 'script',
          type: 'select',
          label: 'Kanal (yozuv)',
          required: true,
          options: [
            { label: 'Lotin (uz-Latn)', value: 'uz-Latn' },
            { label: 'Kirill (uz-Cyrl)', value: 'uz-Cyrl' },
          ],
          admin: { width: '33%' },
        },
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
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'format',
          type: 'select',
          label: 'Xabar turi',
          options: [
            { label: 'Galereya + caption (sendMediaGroup)', value: 'album' },
            { label: 'Rasm + caption (sendPhoto)', value: 'photo' },
            { label: 'Matn (sendMessage)', value: 'text' },
            { label: 'Bitta post — alohida xabar (telegram.post)', value: 'single' },
          ],
          admin: { width: '33%' },
        },
        { name: 'chatId', type: 'text', label: 'Kanal (chat ID)', admin: { width: '33%' } },
        { name: 'attempts', type: 'number', label: 'Urinishlar', admin: { width: '33%' } },
      ],
    },
    {
      name: 'posts',
      type: 'relationship',
      label: 'Postlar (ro‘yxat tartibida)',
      relationTo: 'posts',
      hasMany: true,
    },
    {
      name: 'skippedPosts',
      type: 'relationship',
      label: 'Sig‘magan postlar (Telegram’ga yuborilmadi)',
      relationTo: 'posts',
      hasMany: true,
    },
    {
      name: 'messageIds',
      type: 'json',
      label: 'Xabar ID’lari',
      admin: { description: 'Galereya xabarlari; birinchisi — caption’li (tahrirlanadigan).' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'sentAt',
          type: 'date',
          label: 'Yuborilgan',
          admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' } },
        },
        { name: 'hash', type: 'text', label: 'Caption xeshi', admin: { width: '50%' } },
      ],
    },
    { name: 'error', type: 'textarea', label: 'Xato' },
  ],
}
