import type { TaskConfig } from 'payload'

import { runMakeWebhook } from '@/social/make/deliver'

import { MAKE_WEBHOOK_TASK } from '../constants'

/**
 * `make.webhook` (OBLOG-91): chop etilgan postni (bitta yozuv) Make.com webhook'iga yuborish —
 * Make ssenariysi Instagram va boshqa tarmoqlarga post qiladi. Navbatga `posts` `afterChange`
 * qo'yadi (`collections/Posts/make.ts`), mantiq — `social/make/deliver.ts`.
 *
 * HTTP xatolari task ichida boshqariladi (429/5xx/tarmoq — `waitUntil` bilan qayta navbat 1, 5,
 * 15 daqiqa; keyin — ogohlantirish) — task muvaffaqiyatli tugaydi. Payload `retries` faqat
 * kutilmagan xatolar (DB) uchun.
 */
export const makeWebhookTask: TaskConfig<'make.webhook'> = {
  slug: MAKE_WEBHOOK_TASK,
  label: 'Make avtopost (make.webhook)',
  interfaceName: 'TaskMakeWebhook',
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
    { name: 'httpStatus', type: 'number' },
  ],
  handler: async ({ input, req }) => {
    const output = await runMakeWebhook(req.payload, input, { req })
    return { output }
  },
}
