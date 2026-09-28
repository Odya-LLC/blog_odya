import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { checkHealth } from '@/lib/health'

import { deleteTestUsers, initTestPayload, testEmail } from './helpers/payload'

/**
 * OBLOG-23 (TZ §9.2, §9.4): kuchli parol, 5 xato urinishdan keyin blok, `/api/health` DB tekshiruvi
 * (haqiqiy Postgres va ishlamaydigan ulanish). Docker Postgres.
 */
let payload: Payload
const password = 'Test-parol-123456'

describe('xavfsizlik (integratsion)', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await deleteTestUsers(payload)
  })

  afterAll(async () => {
    if (payload) await deleteTestUsers(payload)
    await payload?.db?.destroy?.()
  })

  it('kuchsiz parol bilan foydalanuvchi yaratilmaydi', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: { email: testEmail('weak'), password: 'parol123', name: 'Weak', role: 'editor' },
      }),
    ).rejects.toMatchObject({
      status: 400,
      data: { errors: [expect.objectContaining({ path: 'password' })] },
    })
  })

  it('parolni kuchsiziga almashtirib bo‘lmaydi; boshqa maydonlar parolsiz yangilanadi', async () => {
    const user = await payload.create({
      collection: 'users',
      data: { email: testEmail('update'), password, name: 'Update', role: 'editor' },
    })
    await expect(
      payload.update({ collection: 'users', id: user.id, data: { password: 'short' } }),
    ).rejects.toMatchObject({ status: 400 })
    const renamed = await payload.update({
      collection: 'users',
      id: user.id,
      data: { name: 'Renamed' },
    })
    expect(renamed.name).toBe('Renamed')
  })

  it('5 ta noto‘g‘ri paroldan keyin to‘g‘ri parol bilan ham kirib bo‘lmaydi', async () => {
    const email = testEmail('lock')
    await payload.create({
      collection: 'users',
      data: { email, password, name: 'Lock', role: 'editor' },
    })
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(
        payload.login({ collection: 'users', data: { email, password: 'Notogri-parol-1' } }),
      ).rejects.toBeTruthy()
    }
    await expect(
      payload.login({ collection: 'users', data: { email, password } }),
    ).rejects.toMatchObject({ name: 'LockedAuth' })

    const { docs } = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      showHiddenFields: true,
    })
    const lockUntil = new Date(String(docs[0]?.lockUntil)).getTime()
    // ~15 daqiqa (sekundlar farqi bilan).
    expect(lockUntil - Date.now()).toBeGreaterThan(14 * 60 * 1000)
    expect(lockUntil - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000)
  })

  it('health: haqiqiy DB — ok', async () => {
    const { httpStatus, body } = await checkHealth({
      ping: async () => {
        await payload.db.pool.query('select 1')
      },
    })
    expect(httpStatus).toBe(200)
    expect(body.db).toBe('ok')
  })

  it('health: DB ishlamaydi — 503', async () => {
    const pg = payload.db.pg
    if (!pg) throw new Error('postgres adapter: pg moduli yo‘q')
    const pool = new pg.Pool({
      connectionString: 'postgresql://nobody:nothing@127.0.0.1:1/none',
      connectionTimeoutMillis: 2_000,
    })
    try {
      const { httpStatus, body } = await checkHealth({
        ping: async () => {
          await pool.query('select 1')
        },
        timeoutMs: 5_000,
      })
      expect(httpStatus).toBe(503)
      expect(body.db).toBe('error')
    } finally {
      await pool.end()
    }
  })
})
