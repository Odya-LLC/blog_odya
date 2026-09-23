import { getPayload, type Migration, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrations } from '@/migrations'
import config from '@/payload.config'

/**
 * Integratsion test: Postgres kerak (lokal — infra/docker-compose.dev.yml, CI — service container).
 * Migratsiyalar shu yerda qo'llanadi, shuning uchun toza DB'da ham ishlaydi.
 */
let payload: Payload

describe('Payload + Postgres', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    // Migratsiyalarni Vitest transformi orqali uzatamiz (Node native TS stripping
    // `.ts` migratsiya fayllarini to'g'ridan-to'g'ri import qila olmaydi).
    await payload.db.migrate({ migrations: migrations as unknown as Migration[] })
  })

  afterAll(async () => {
    await payload?.db?.destroy?.()
  })

  it('users kolleksiyasini o‘qiydi', async () => {
    const users = await payload.find({ collection: 'users', limit: 1 })
    expect(users.docs).toBeInstanceOf(Array)
  })

  it('migratsiyalar qo‘llangan', async () => {
    const result = await payload.find({ collection: 'payload-migrations', limit: 100 })
    const names = result.docs.map((doc) => doc.name ?? '')
    expect(names.some((name) => name.endsWith('_initial'))).toBe(true)
  })
})
