import type { GlobalConfig } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'

export const DEFAULT_TELEGRAM_TEMPLATE =
  '<b>{{title}}</b>\n\n{{excerpt}}\n\nBatafsil: {{url}}\n\n{{hashtags}}'

/**
 * Kanalga yuborish rejimi (OBLOG-116): `post` — har post alohida (darhol); `digest` — har
 * `intervalHours` soatda bitta dayjest (galereya + ro'yxat); `hybrid` — "Tezkor" belgili post darhol
 * alohida, qolganlari dayjestda.
 */
export const TELEGRAM_MODES = ['post', 'digest', 'hybrid'] as const
export type TelegramMode = (typeof TELEGRAM_MODES)[number]
export const DEFAULT_TELEGRAM_MODE: TelegramMode = 'digest'

/** Dayjest standartlari (OBLOG-116): 07, 10, 13, 16, 19, 22 (Toshkent), 10 band, 5 rasm. */
export const DEFAULT_DIGEST_SETTINGS = {
  intervalHours: 3,
  startHour: 7,
  endHour: 22,
  maxItems: 10,
  maxPhotos: 5,
  header: '📰 Kun yangiliklari — {{date}}, {{time}}',
  footer: '🔗 Barchasi: {{site}}',
} as const

/**
 * Telegram avtopost sozlamalari (TZ §7.1, §10.15). Env (`TELEGRAM_CHANNEL_LATN/CYRL`,
 * `TELEGRAM_ALERT_CHAT_ID`) — standart qiymat, shu global ustun turadi. Bot tokeni — faqat env'da.
 * Yuborish mantig'i (M3-01) — `src/telegram/` (`telegram.post` job'i), sozlamalarni o'qish —
 * `src/telegram/config.ts`.
 */
export const TelegramSettings: GlobalConfig = {
  slug: 'telegram-settings',
  label: 'Telegram sozlamalari',
  access: {
    read: isAdminOrEditor,
    update: isAdmin,
  },
  fields: [
    {
      name: 'mode',
      type: 'select',
      label: 'Yuborish rejimi',
      required: true,
      defaultValue: DEFAULT_TELEGRAM_MODE,
      options: [
        { label: 'Har post alohida (darhol)', value: 'post' },
        { label: 'Dayjest (har necha soatda bitta xabar)', value: 'digest' },
        { label: 'Aralash: "Tezkor" postlar darhol, qolgani dayjestda', value: 'hybrid' },
      ],
      admin: {
        description:
          'Dayjest — jadval bo‘yicha (Toshkent vaqti) bitta xabar: eng muhim postlar muqovalari galereyasi va sarlavhalar ro‘yxati (havola bilan). Tartib — postdagi “Dayjestda muhimlik”, keyin yangiligi. Bitta post bo‘lsa — odatdagi alohida xabar, post bo‘lmasa — hech narsa. Aralash rejimda postdagi “Telegram’ga darhol (alohida)” belgilangan post chop etilishi bilan yuboriladi.',
      },
    },
    {
      name: 'digest',
      type: 'group',
      label: 'Dayjest',
      admin: {
        condition: (data) => data?.mode !== 'post',
        description:
          'Slotlar: birinchi soatdan har N soatda, oxirgi soatgacha (standart 07, 10, 13, 16, 19, 22). Oxirgi slotdan keyin ertalabgacha xabar yuborilmaydi — tungi postlar ertalabki birinchi dayjestga tushadi. Scheduler har 10 daqiqada tekshiradi (10 daqiqagacha kechikish). Ro‘yxatga sig‘magan postlar Telegram’ga yuborilmaydi (dayjest yozuvida — “Sig‘magan postlar”).',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'intervalHours',
              type: 'number',
              label: 'Har necha soatda',
              defaultValue: DEFAULT_DIGEST_SETTINGS.intervalHours,
              min: 1,
              max: 12,
              admin: { width: '33%' },
            },
            {
              name: 'startHour',
              type: 'number',
              label: 'Birinchi dayjest (soat)',
              defaultValue: DEFAULT_DIGEST_SETTINGS.startHour,
              min: 0,
              max: 23,
              admin: { width: '33%' },
            },
            {
              name: 'endHour',
              type: 'number',
              label: 'Oxirgi dayjest (soatgacha)',
              defaultValue: DEFAULT_DIGEST_SETTINGS.endHour,
              min: 0,
              max: 23,
              admin: { width: '33%' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'maxItems',
              type: 'number',
              label: 'Ro‘yxatda ko‘pi bilan (post)',
              defaultValue: DEFAULT_DIGEST_SETTINGS.maxItems,
              min: 2,
              max: 10,
              admin: {
                width: '50%',
                description:
                  'Caption 1024 belgiga sig‘masa — sarlavhalar qisqaradi, keyin postlar kamayadi.',
              },
            },
            {
              name: 'maxPhotos',
              type: 'number',
              label: 'Galereyada ko‘pi bilan (rasm)',
              defaultValue: DEFAULT_DIGEST_SETTINGS.maxPhotos,
              min: 2,
              max: 10,
              admin: {
                width: '50%',
                description: 'Ro‘yxatdagi birinchi postlar muqovalari, tartib — raqam bo‘yicha.',
              },
            },
          ],
        },
        {
          name: 'header',
          type: 'text',
          label: 'Sarlavha qatori',
          defaultValue: DEFAULT_DIGEST_SETTINGS.header,
          admin: {
            description:
              'O‘rinbosarlar: {{date}} (10-oktabr), {{time}} (15:00). Kirill kanal uchun matn avtomatik kirillga o‘giriladi.',
          },
        },
        {
          name: 'footer',
          type: 'text',
          label: 'Pastki qator',
          defaultValue: DEFAULT_DIGEST_SETTINGS.footer,
          admin: {
            description:
              '{{site}} — sayt havolasi (kirill kanalda — kirill bosh sahifa). Ostida — heshteglar (“Heshteglar soni”).',
          },
        },
      ],
    },
    {
      name: 'channels',
      type: 'array',
      label: 'Kanallar',
      maxRows: 2,
      admin: {
        description:
          "Yozuv bo'yicha qator bo'lmasa — env TELEGRAM_CHANNEL_LATN / TELEGRAM_CHANNEL_CYRL. Bot kanalda admin bo'lishi kerak.",
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'script',
              type: 'select',
              label: 'Yozuv',
              required: true,
              options: [
                { label: 'Lotin (uz-Latn)', value: 'uz-Latn' },
                { label: 'Kirill (uz-Cyrl)', value: 'uz-Cyrl' },
              ],
              admin: { width: '30%' },
            },
            {
              name: 'chatId',
              type: 'text',
              label: 'Chat ID yoki @username',
              required: true,
              admin: { width: '50%' },
            },
            {
              name: 'isEnabled',
              type: 'checkbox',
              label: 'Yoqilgan',
              defaultValue: true,
              admin: { width: '20%' },
            },
          ],
        },
      ],
    },
    {
      name: 'template',
      type: 'textarea',
      label: 'Xabar shabloni (HTML)',
      defaultValue: DEFAULT_TELEGRAM_TEMPLATE,
      admin: {
        description:
          "O'rinbosarlar: {{title}}, {{excerpt}}, {{url}}, {{hashtags}}. Caption ≤ 1024 belgi (oshsa lid qisqartiriladi). Kirill kanal uchun shablon matni avtomatik kirillga o'giriladi.",
      },
    },
    {
      name: 'hashtagsCount',
      type: 'number',
      label: 'Heshteglar soni',
      defaultValue: 3,
      min: 0,
      max: 5,
    },
    {
      name: 'alertChatId',
      type: 'text',
      label: 'Admin ogohlantirish guruhi (chat ID)',
    },
    {
      type: 'row',
      fields: [
        {
          name: 'notifyNewItems',
          type: 'checkbox',
          label: 'Yangi yangiliklar haqida xabar berish',
          defaultValue: true,
          admin: {
            width: '50%',
            description:
              "Har scheduler tick'idan keyin (yangi element bo'lsa) ogohlantirish guruhiga qisqa xabar: nechta yangi yangilik, manbalar bo'yicha.",
          },
        },
        {
          name: 'newItemsMinCount',
          type: 'number',
          label: 'Xabar uchun minimal soni',
          defaultValue: 1,
          min: 1,
          admin: {
            width: '50%',
            description:
              "Yangi yangiliklar shundan kam bo'lsa — xabar keyingi tick'ga qoldiriladi (yig'iladi).",
          },
        },
      ],
    },
  ],
}
