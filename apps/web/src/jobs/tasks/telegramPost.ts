import type { TaskConfig } from 'payload'

import { runTelegramPost } from '@/telegram/autopost'

import { TELEGRAM_POST_TASK } from '../constants'

/**
 * `telegram.post` (TZ §7.1, §10.14): chop etilgan postni bitta kanalga (yozuv bo'yicha) yuborish
 * yoki mavjud xabarni tahrirlash. Navbatga `posts` `afterChange` qo'yadi
 * (`collections/Posts/telegram.ts`), mantiq — `telegram/autopost.ts`.
 *
 * Telegram xatolari task ichida boshqariladi (429 `retry_after`, 3 qayta urinish, keyin
 * ogohlantirish) — task muvaffaqiyatli tugaydi. Payload `retries` faqat kutilmagan xatolar
 * (masalan, DB) uchun.
 */
export const telegramPostTask: TaskConfig<'telegram.post'> = {
  slug: TELEGRAM_POST_TASK,
  label: 'Telegram avtopost (telegram.post)',
  interfaceName: 'TaskTelegramPost',
  retries: { attempts: 2, backoff: { type: 'exponential', delay: 30_000 } },
  inputSchema: [
    { name: 'postId', type: 'number', required: true },
    {
      name: 'script',
      type: 'select',
      required: true,
      options: [
        { label: 'uz-Latn', value: 'uz-Latn' },
        { label: 'uz-Cyrl', value: 'uz-Cyrl' },
      ],
    },
    { name: 'attempt', type: 'number' },
  ],
  outputSchema: [
    { name: 'status', type: 'text' },
    { name: 'reason', type: 'text' },
    { name: 'messageId', type: 'text' },
  ],
  handler: async ({ input, req }) => {
    const output = await runTelegramPost(req.payload, input, { req })
    return { output }
  },
}
