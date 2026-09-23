import { getPayload, type Migration, type Payload } from 'payload'

import { migrations } from '@/migrations'
import config from '@/payload.config'

/**
 * Integratsion testlar uchun Payload (lokal — infra/docker-compose.dev.yml, CI — service
 * container'lar). Migratsiyalar shu yerda qo'llanadi, shuning uchun toza DB'da ham ishlaydi.
 */
export async function initTestPayload(): Promise<Payload> {
  const payload = await getPayload({ config: await config })
  // Migratsiyalarni Vitest transformi orqali uzatamiz (Node native TS stripping
  // `.ts` migratsiya fayllarini to'g'ridan-to'g'ri import qila olmaydi).
  await payload.db.migrate({ migrations: migrations as unknown as Migration[] })
  return payload
}

/** Testlarda yaratiladigan foydalanuvchilar domeni — tozalash shu bo'yicha. */
export const TEST_EMAIL_DOMAIN = 'test.blog-odya.local'

export function testEmail(name: string): string {
  return `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@${TEST_EMAIL_DOMAIN}`
}

/** Local API `user` argumenti uchun: auth kolleksiyasi belgisi bilan. */
export function asUser<T extends object>(doc: T): T & { collection: 'users' } {
  return { ...doc, collection: 'users' }
}

export async function deleteTestUsers(payload: Payload): Promise<void> {
  await payload.delete({
    collection: 'users',
    where: { email: { like: `@${TEST_EMAIL_DOMAIN}` } },
  })
}
