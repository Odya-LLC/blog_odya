import type { TaskConfig } from 'payload'

import { runIndexNowSubmit } from '@/indexnow'

import { INDEXNOW_SUBMIT_TASK } from '../constants'

/**
 * `indexnow.submit` (TZ §8.3, OBLOG-57): maqola URL'lari (lotin + `/kr`) → IndexNow (Bing,
 * Yandex, Seznam, Naver). Navbatga `posts` `afterChange`/`afterDelete` qo'yadi
 * (`collections/Posts/indexnow.ts`), mantiq — `src/indexnow`.
 *
 * HTTP xatolari task ichida boshqariladi (429/5xx — `waitUntil` bilan qayta navbat, keyin
 * `warn` log) — task muvaffaqiyatli tugaydi. Payload `retries` faqat kutilmagan xatolar uchun.
 */
export const indexNowSubmitTask: TaskConfig<'indexnow.submit'> = {
  slug: INDEXNOW_SUBMIT_TASK,
  label: 'IndexNow (indexnow.submit)',
  interfaceName: 'TaskIndexNowSubmit',
  retries: { attempts: 1, backoff: { type: 'fixed', delay: 60_000 } },
  inputSchema: [
    { name: 'urls', type: 'json', required: true },
    { name: 'attempt', type: 'number' },
  ],
  outputSchema: [
    { name: 'status', type: 'text' },
    { name: 'httpStatus', type: 'number' },
    { name: 'reason', type: 'text' },
  ],
  handler: async ({ input, req }) => {
    const output = await runIndexNowSubmit(req.payload, input, { req })
    return { output }
  },
}
