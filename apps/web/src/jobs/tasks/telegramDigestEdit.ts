import type { TaskConfig } from 'payload'

import { runTelegramDigestEdit } from '@/telegram/digest'

import { TELEGRAM_DIGEST_EDIT_TASK } from '../constants'

/**
 * `telegram.digestEdit` (OBLOG-116): yuborilgan dayjestdagi post qayta chop etilganda (sarlavha
 * o'zgargan bo'lishi mumkin) caption'ni qayta yig'ib, xesh o'zgargan bo'lsa tahrirlash. Navbatga
 * `posts` `afterChange` qo'yadi (`collections/Posts/telegram.ts`), mantiq — `telegram/digest.ts`.
 * Xatolar `telegram.post` dagidek task ichida boshqariladi (429, qayta urinish, ogohlantirish).
 */
export const telegramDigestEditTask: TaskConfig<'telegram.digestEdit'> = {
  slug: TELEGRAM_DIGEST_EDIT_TASK,
  label: 'Telegram dayjestini tahrirlash (telegram.digestEdit)',
  interfaceName: 'TaskTelegramDigestEdit',
  retries: { attempts: 2, backoff: { type: 'exponential', delay: 30_000 } },
  inputSchema: [
    { name: 'digestId', type: 'number', required: true },
    { name: 'attempt', type: 'number' },
  ],
  outputSchema: [
    { name: 'status', type: 'text' },
    { name: 'reason', type: 'text' },
  ],
  handler: async ({ input, req }) => {
    const output = await runTelegramDigestEdit(req.payload, input, { req })
    return { output }
  },
}
