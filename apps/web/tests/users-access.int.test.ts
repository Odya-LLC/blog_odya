import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Users } from '@/collections/Users'
import type { User } from '@/payload-types'

import { asUser, deleteTestUsers, initTestPayload, testEmail } from './helpers/payload'

/**
 * Rollar (TZ §4.2): foydalanuvchini faqat admin yaratadi; editor o'z rolini o'zgartira olmaydi.
 * Payload Local API (`overrideAccess: false`) + Docker Postgres.
 */
let payload: Payload
let admin: User
let editor: User

const password = 'Test-parol-123456'

describe('users: rollar va access', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await deleteTestUsers(payload)

    admin = await payload.create({
      collection: 'users',
      data: { email: testEmail('admin'), password, name: 'Admin', role: 'admin' },
    })
    editor = await payload.create({
      collection: 'users',
      data: { email: testEmail('editor'), password, name: 'Editor', role: 'editor' },
    })
  })

  afterAll(async () => {
    if (payload) await deleteTestUsers(payload)
    await payload?.db?.destroy?.()
  })

  it('editor foydalanuvchi yarata olmaydi', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: { email: testEmail('by-editor'), password, name: 'X', role: 'editor' },
        overrideAccess: false,
        user: asUser(editor),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('anonim foydalanuvchi yarata olmaydi', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: { email: testEmail('anon'), password, name: 'X', role: 'editor' },
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('admin foydalanuvchi (editor va admin) yaratadi', async () => {
    const created = await payload.create({
      collection: 'users',
      data: { email: testEmail('by-admin'), password, name: 'Yangi', role: 'editor' },
      overrideAccess: false,
      user: asUser(admin),
    })
    expect(created.role).toBe('editor')

    const createdAdmin = await payload.create({
      collection: 'users',
      data: { email: testEmail('by-admin-admin'), password, name: 'Yangi admin', role: 'admin' },
      overrideAccess: false,
      user: asUser(admin),
    })
    expect(createdAdmin.role).toBe('admin')
  })

  it('editor o‘z rolini o‘zgartira olmaydi, lekin ismini o‘zgartiradi', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: editor.id,
      data: { role: 'admin', name: 'Editor 2' },
      overrideAccess: false,
      user: asUser(editor),
    })
    expect(updated.name).toBe('Editor 2')

    const fresh = await payload.findByID({ collection: 'users', id: editor.id })
    expect(fresh.role).toBe('editor')
  })

  it('editor faqat o‘zini ko‘radi, boshqalarni tahrirlay olmaydi', async () => {
    const visible = await payload.find({
      collection: 'users',
      overrideAccess: false,
      user: asUser(editor),
      limit: 100,
    })
    expect(visible.docs.map((doc) => doc.id)).toEqual([editor.id])

    await expect(
      payload.update({
        collection: 'users',
        id: admin.id,
        data: { name: 'Buzildi' },
        overrideAccess: false,
        user: asUser(editor),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('editor foydalanuvchini o‘chira olmaydi', async () => {
    await expect(
      payload.delete({
        collection: 'users',
        id: admin.id,
        overrideAccess: false,
        user: asUser(editor),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('editor o‘ziga API kalit yoqa oladi', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: editor.id,
      data: { enableAPIKey: true, apiKey: crypto.randomUUID() },
      overrideAccess: false,
      user: asUser(editor),
    })
    expect(updated.enableAPIKey).toBe(true)
  })

  it('admin paneliga faqat admin va editor kiradi', async () => {
    const adminAccess = Users.access?.admin
    if (!adminAccess) throw new Error('access.admin yo‘q')
    const check = (user: unknown) => adminAccess({ req: { user } } as never)
    expect(await check(asUser(admin))).toBe(true)
    expect(await check(asUser(editor))).toBe(true)
    expect(await check(null)).toBe(false)
    expect(await check(asUser({ ...editor, role: 'guest' }))).toBe(false)
  })

  it('birinchi foydalanuvchi har doim admin bo‘ladi', async () => {
    const hook = Users.hooks?.beforeChange?.[0]
    if (!hook) throw new Error('beforeChange hook yo‘q')
    const run = (totalDocs: number) =>
      hook({
        data: { role: 'editor' },
        operation: 'create',
        req: { payload: { count: async () => ({ totalDocs }) } },
      } as never)
    expect(await run(0)).toMatchObject({ role: 'admin' })
    expect(await run(1)).toMatchObject({ role: 'editor' })
  })
})
