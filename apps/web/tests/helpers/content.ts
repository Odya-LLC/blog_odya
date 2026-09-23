import type { CollectionSlug, Payload } from 'payload'

import type { Category, User } from '@/payload-types'

import { asUser, testEmail } from './payload'

/** Testlarda yaratiladigan kontent slug prefiksi — tozalash shu bo'yicha. */
export const TEST_SLUG_PREFIX = 'test-m102-'

export function testSlug(name: string): string {
  return `${TEST_SLUG_PREFIX}${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

export const TEST_PASSWORD = 'Test-parol-123456'

export interface TestUsers {
  admin: User
  editor: User
  editor2: User
}

export async function createTestUsers(payload: Payload): Promise<TestUsers> {
  const make = (name: string, role: 'admin' | 'editor') =>
    payload.create({
      collection: 'users',
      data: { email: testEmail(name), password: TEST_PASSWORD, name, role },
    })
  return {
    admin: await make('admin', 'admin'),
    editor: await make('editor', 'editor'),
    editor2: await make('editor2', 'editor'),
  }
}

/** Local API chaqiruvi uchun access argumentlari (`null` — anonim). */
export function as(user: User | null): {
  overrideAccess: false
  user?: User & { collection: 'users' }
} {
  return user ? { overrideAccess: false, user: asUser(user) } : { overrideAccess: false }
}

export async function createTestCategory(payload: Payload): Promise<Category> {
  return payload.create({
    collection: 'categories',
    data: { name: 'Test kategoriya', slug: testSlug('cat') },
  })
}

const SLUGGED: CollectionSlug[] = ['posts', 'pages', 'categories', 'tags', 'authors']

/** Test kontentini o'chiradi (posts → boshqalar tartibida, bog'liqliklar uchun). */
export async function deleteTestContent(payload: Payload): Promise<void> {
  // Rejalashtirilgan test postlarining kutilayotgan job'lari.
  const { docs: posts } = await payload.find({
    collection: 'posts',
    where: { slug: { like: TEST_SLUG_PREFIX } },
    draft: true,
    depth: 0,
    pagination: false,
  })
  for (const post of posts) {
    await payload.delete({
      collection: 'payload-jobs',
      where: {
        taskSlug: { equals: 'schedulePublish' },
        'input.doc.value': { equals: post.id },
      },
    })
  }
  for (const collection of SLUGGED) {
    await payload.delete({
      collection,
      where: { slug: { like: TEST_SLUG_PREFIX } },
    })
  }
  await payload.delete({
    collection: 'redirects',
    where: { from: { like: `/${TEST_SLUG_PREFIX}` } },
  })
}
