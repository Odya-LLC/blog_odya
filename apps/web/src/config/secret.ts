import { randomBytes } from 'crypto'

import type { DatabaseMode } from './database'

/**
 * Payload `secret` (JWT/cookie imzolash).
 *
 * Runtime'da `PAYLOAD_SECRET` env sxemasi bo'yicha majburiy. Migratsiya rejimida esa ixtiyoriy:
 * prod migratsiya workflow'i (`.github/workflows/migrate-prod.yml`) faqat DB sirini oladi, lekin
 * Payload `init` bo'sh secret bilan ishga tushmaydi ("missing secret key"). Migratsiyalar hech
 * narsani imzolamaydi va shifrlamaydi, shuning uchun bu holda har jarayonda yangi tasodifiy
 * qiymat ishlatiladi — u hech qayerda saqlanmaydi va runtime'ga ta'sir qilmaydi.
 */
export function getPayloadSecret(
  // `Env` turida majburiy, lekin build/migrate rejimlarida `undefined` bo'lishi mumkin.
  env: { PAYLOAD_SECRET?: string },
  mode: DatabaseMode,
): string {
  if (env.PAYLOAD_SECRET) return env.PAYLOAD_SECRET
  if (mode === 'migrate') return randomBytes(32).toString('hex')
  return ''
}
