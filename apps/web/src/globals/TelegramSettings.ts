import type { GlobalConfig } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'

export const DEFAULT_TELEGRAM_TEMPLATE =
  '<b>{{title}}</b>\n\n{{excerpt}}\n\nBatafsil: {{url}}\n\n{{hashtags}}'

/**
 * Telegram avtopost sozlamalari (TZ §7.1, §10.15). Env (`TELEGRAM_CHANNEL_LATN/CYRL`,
 * `TELEGRAM_ALERT_CHAT_ID`) — standart qiymat, shu global ustun turadi. Bot tokeni — faqat env'da.
 * Yuborish mantig'i — M3-01.
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
      name: 'channels',
      type: 'array',
      label: 'Kanallar',
      maxRows: 2,
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
          "O'rinbosarlar: {{title}}, {{excerpt}}, {{url}}, {{hashtags}}. Caption ≤ 1024 belgi.",
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
  ],
}
