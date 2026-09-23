/**
 * Slug o'zgarganda 301 redirect (TZ §8.1) — mantiq mock Payload bilan. `redirects` kolleksiyasi
 * va end-to-end 301 tekshiruvi OBLOG-9 da.
 */
import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { createSlugBeforeValidateHook } from '@/fields/slug'
import {
  createSlugRedirectHook,
  planSlugRedirects,
  SLUG_REDIRECT_SKIP_CONTEXT,
  withValueAtPath,
} from '@/hooks/slugRedirect'

type Row = { id: number; from: string; to: { type: string; url: string }; type: string }

/** `redirects` kolleksiyasining xotiradagi mock'i (faqat hook ishlatadigan amallar). */
function mockPayload(initial: Omit<Row, 'id'>[] = []) {
  let nextId = 1
  const rows: Row[] = initial.map((r) => ({ ...r, id: nextId++ }))
  const calls: string[] = []
  const match = (row: Row, where: Record<string, { equals?: unknown }>) =>
    Object.entries(where).every(([path, cond]) => {
      const value = path.split('.').reduce<unknown>((acc, k) => (acc as never)?.[k], row)
      return value === cond.equals
    })
  const payload = {
    find: async ({ collection, where }: { collection: string; where: Record<string, never> }) => {
      calls.push(`find:${collection}`)
      const docs = rows.filter((r) => match(r, where))
      return { docs, totalDocs: docs.length }
    },
    create: async ({ collection, data }: { collection: string; data: Omit<Row, 'id'> }) => {
      calls.push(`create:${collection}`)
      const row = { ...data, id: nextId++ }
      rows.push(row)
      return row
    },
    update: async ({ id, data }: { id: number; data: Partial<Row> }) => {
      calls.push('update')
      const row = rows.find((r) => r.id === id)!
      Object.assign(row, data)
      return row
    },
    delete: async ({ where }: { where: Record<string, never> }) => {
      calls.push('delete')
      for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i]!, where)) rows.splice(i, 1)
      return { docs: [] }
    },
    count: async () => ({ totalDocs: 0 }),
  }
  return { rows, calls, req: { payload, context: {} } as unknown as PayloadRequest }
}

type Doc = { id: number; slug: string; category?: string; _status?: string }
const buildPath = ({ doc }: { doc: Doc }) =>
  doc.slug ? `/${doc.category ?? 'news'}/${doc.slug}` : null

async function runHook(
  hook: ReturnType<typeof createSlugRedirectHook>,
  req: PayloadRequest,
  previousDoc: Doc,
  doc: Doc,
  operation: 'create' | 'update' = 'update',
  context: Record<string, unknown> = {},
) {
  return hook({
    doc,
    previousDoc,
    operation,
    req,
    context,
    collection: { slug: 'posts' } as never,
    data: doc,
  })
}

describe('planSlugRedirects', () => {
  it('lotin va kirill (/kr) prefikslari uchun juftlar', () => {
    expect(planSlugRedirects('/ai/eski', '/ai/yangi')).toEqual([
      { from: '/ai/eski', to: '/ai/yangi' },
      { from: '/kr/ai/eski', to: '/kr/ai/yangi' },
    ])
  })
  it('yo‘l o‘zgarmasa yoki bo‘sh bo‘lsa — hech narsa', () => {
    expect(planSlugRedirects('/a', '/a')).toEqual([])
    expect(planSlugRedirects(null, '/a')).toEqual([])
    expect(planSlugRedirects('/a', undefined)).toEqual([])
  })
  it('bosh sahifa va maxsus prefikslar', () => {
    expect(planSlugRedirects('eski', '/', ['', '/kr'])).toEqual([
      { from: '/eski', to: '/' },
      { from: '/kr/eski', to: '/kr' },
    ])
  })
  it('withValueAtPath ichki obyektni saqlaydi', () => {
    expect(withValueAtPath({ to: { type: 'custom', url: '/a' } }, 'to.url', '/b')).toEqual({
      to: { type: 'custom', url: '/b' },
    })
    expect(withValueAtPath({}, 'target', '/b')).toEqual({ target: '/b' })
  })
})

describe('createSlugRedirectHook', () => {
  const hook = createSlugRedirectHook<Doc>({ buildPath })

  it('slug o‘zgarganda 301 redirect yaratadi (lotin + kirill)', async () => {
    const { rows, req } = mockPayload()
    await runHook(hook, req, { id: 1, slug: 'eski' }, { id: 1, slug: 'yangi' })
    expect(rows.map(({ from, to, type }) => ({ from, to: to.url, type }))).toEqual([
      { from: '/news/eski', to: '/news/yangi', type: '301' },
      { from: '/kr/news/eski', to: '/kr/news/yangi', type: '301' },
    ])
    expect(rows[0]!.to.type).toBe('custom')
  })

  it('kategoriya o‘zgarsa ham (yo‘l o‘zgaradi) redirect yaratiladi', async () => {
    const { rows, req } = mockPayload()
    await runHook(
      hook,
      req,
      { id: 1, slug: 'x', category: 'ai' },
      { id: 1, slug: 'x', category: 'texnologiyalar' },
    )
    expect(rows[0]).toMatchObject({ from: '/ai/x', to: { url: '/texnologiyalar/x' } })
  })

  it('slug o‘zgarmasa — hech narsa qilinmaydi', async () => {
    const { calls, req } = mockPayload()
    await runHook(hook, req, { id: 1, slug: 'a' }, { id: 1, slug: 'a' })
    expect(calls).toEqual([])
  })

  it('create operatsiyasida ishlamaydi', async () => {
    const { calls, req } = mockPayload()
    await runHook(hook, req, { id: 1, slug: 'a' }, { id: 1, slug: 'b' }, 'create')
    expect(calls).toEqual([])
  })

  it('qoralama (hali chop etilmagan) uchun redirect yaratilmaydi', async () => {
    const { rows, req } = mockPayload()
    await runHook(hook, req, { id: 1, slug: 'a', _status: 'draft' }, { id: 1, slug: 'b' })
    expect(rows).toEqual([])
  })

  it('skipSlugRedirect context — o‘tkazib yuboriladi', async () => {
    const { rows, req } = mockPayload()
    await runHook(hook, req, { id: 1, slug: 'a' }, { id: 1, slug: 'b' }, 'update', {
      [SLUG_REDIRECT_SKIP_CONTEXT]: true,
    })
    expect(rows).toEqual([])
  })

  it('zanjir qisqartiriladi: A → B mavjud, B → C bo‘lganda A → C', async () => {
    const { rows, req } = mockPayload([
      { from: '/news/a', to: { type: 'custom', url: '/news/b' }, type: '301' },
    ])
    await runHook(hook, req, { id: 1, slug: 'b' }, { id: 1, slug: 'c' })
    const byFrom = Object.fromEntries(rows.map((r) => [r.from, r.to.url]))
    expect(byFrom['/news/a']).toBe('/news/c')
    expect(byFrom['/news/b']).toBe('/news/c')
  })

  it('sikl oldini olinadi: eski nomga qaytilsa, yangi yo‘ldan chiquvchi redirect o‘chiriladi', async () => {
    const { rows, req } = mockPayload()
    await runHook(hook, req, { id: 1, slug: 'a' }, { id: 1, slug: 'b' })
    await runHook(hook, req, { id: 1, slug: 'b' }, { id: 1, slug: 'a' })
    const latin = rows.filter((r) => !r.from.startsWith('/kr'))
    expect(latin.map((r) => [r.from, r.to.url])).toEqual([['/news/b', '/news/a']])
  })

  it('mavjud redirect (bir xil from) yangilanadi, dublikat yaratilmaydi', async () => {
    const { rows, req } = mockPayload([
      { from: '/news/a', to: { type: 'custom', url: '/news/old' }, type: '301' },
    ])
    await runHook(hook, req, { id: 1, slug: 'a' }, { id: 1, slug: 'z' })
    expect(rows.filter((r) => r.from === '/news/a')).toHaveLength(1)
    expect(rows.find((r) => r.from === '/news/a')!.to.url).toBe('/news/z')
  })

  it('sozlanadigan kolleksiya, maydonlar va yozuv shakli', async () => {
    const { calls, req } = mockPayload()
    const custom = createSlugRedirectHook<Doc>({
      buildPath,
      redirectsCollection: 'my-redirects',
      prefixes: [''],
      toRedirectData: ({ from, to }) => ({ from, to: { type: 'custom', url: to }, type: '302' }),
    })
    await runHook(custom, req, { id: 1, slug: 'a' }, { id: 1, slug: 'b' })
    expect(calls).toContain('create:my-redirects')
  })
})

describe('slug maydoni hook’i', () => {
  const collection = { slug: 'categories' }

  it('bo‘sh slug sarlavhadan yaratiladi', async () => {
    const { req } = mockPayload()
    const hook = createSlugBeforeValidateHook({ sourceField: 'name', checkReserved: true })
    const value = await hook({
      value: '',
      data: { name: 'Sunʼiy intellekt' },
      collection,
      req,
    } as never)
    expect(value).toBe('suniy-intellekt')
  })

  it('band yoki zaxiralangan slug uchun suffiks', async () => {
    const { req } = mockPayload()
    ;(
      req.payload as unknown as { count: (a: { where: { slug: { equals: string } } }) => unknown }
    ).count = async ({ where }) => ({ totalDocs: where.slug.equals === 'kibersport' ? 1 : 0 })
    const hook = createSlugBeforeValidateHook({ sourceField: 'name', checkReserved: true })
    expect(await hook({ value: '', data: { name: 'Kibersport' }, collection, req } as never)).toBe(
      'kibersport-2',
    )
    expect(await hook({ value: undefined, data: { name: 'KR' }, collection, req } as never)).toBe(
      'kr-2',
    )
  })

  it('qo‘lda kiritilgan slug o‘zgartirilmaydi', async () => {
    const { req } = mockPayload()
    const hook = createSlugBeforeValidateHook()
    expect(await hook({ value: 'mening-slugim', data: {}, collection, req } as never)).toBe(
      'mening-slugim',
    )
  })
})
