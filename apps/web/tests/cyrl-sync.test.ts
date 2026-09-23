/**
 * `createCyrlSyncFieldHook` mantiqi (DB'siz): richText, jsonb kalit tartibi, parallel hook'lar,
 * `withCyrlSync` konfiguratsiyasi.
 */
import type { CollectionConfig, FieldHook, PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  createCyrlSyncFieldHook,
  cyrlValuesEqual,
  parseCyrlLocked,
  withCyrlSync,
  withCyrlSyncGlobal,
} from '@/translit/cyrlSync'
import { invalidateTransliteratorCache } from '@/translit/transliterator'

function mockReq(locale: string, context: Record<string, unknown> = {}): PayloadRequest {
  invalidateTransliteratorCache()
  return {
    locale,
    context,
    payload: {
      find: async () => ({ docs: [] }),
      logger: { warn: () => {}, error: () => {} },
    },
  } as unknown as PayloadRequest
}

type HookArgs = Parameters<FieldHook>[0]

async function run(
  hook: FieldHook,
  args: {
    name: string
    value: unknown
    req: PayloadRequest
    data?: Record<string, unknown>
    stored?: Record<string, unknown>
    originalDoc?: Record<string, unknown>
  },
) {
  const siblingDocWithLocales: Record<string, unknown> = args.stored
    ? { [args.name]: args.stored }
    : {}
  const data = args.data ?? {}
  const result = await hook({
    data,
    field: { name: args.name, type: 'text', localized: true },
    originalDoc: args.originalDoc ?? {},
    req: args.req,
    siblingData: data,
    siblingDocWithLocales,
    value: args.value,
  } as unknown as HookArgs)
  return {
    result,
    data,
    cyrl: (siblingDocWithLocales[args.name] as Record<string, unknown>)?.['uz-Cyrl'],
  }
}

const lexical = (text: string) => ({
  root: {
    type: 'root',
    version: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [
          { type: 'text', text, format: 0, version: 1, detail: 0, mode: 'normal', style: '' },
        ],
      },
    ],
  },
})

describe('createCyrlSyncFieldHook', () => {
  it('text: uz-Latn → siblingDocWithLocales[uz-Cyrl]', async () => {
    const hook = createCyrlSyncFieldHook({ path: 'title' })
    const { result, cyrl } = await run(hook, {
      name: 'title',
      value: 'Yangi yil',
      req: mockReq('uz-Latn'),
    })
    expect(result).toBe('Yangi yil')
    expect(cyrl).toBe('Янги йил')
  })

  it('richText: faqat matn tugunlari, kod formati saqlanadi', async () => {
    const hook = createCyrlSyncFieldHook({ path: 'content', kind: 'richText' })
    const { cyrl } = await run(hook, {
      name: 'content',
      value: lexical('Salom dunyo'),
      req: mockReq('uz-Latn'),
    })
    expect(cyrl).toEqual(lexical('Салом дунё'))
  })

  it('richText: jsonb kalit tartibi farqi “o‘zgarish” deb hisoblanmaydi (qulf qo‘yilmaydi)', async () => {
    const hook = createCyrlSyncFieldHook({ path: 'content', kind: 'richText' })
    const stored = lexical('Салом')
    const reordered = JSON.parse(
      JSON.stringify(stored, (_k, v) =>
        v && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v).reverse())
          : v,
      ),
    )
    const { data } = await run(hook, {
      name: 'content',
      value: reordered,
      req: mockReq('uz-Cyrl'),
      stored: { 'uz-Latn': lexical('Salom'), 'uz-Cyrl': stored },
    })
    expect(parseCyrlLocked(data.cyrlLocked)).toEqual({})
  })

  it('uz-Cyrl: forma fallback (lotin) qiymatini yuborsa — qulflanmaydi, generatsiya qilinadi', async () => {
    const hook = createCyrlSyncFieldHook({ path: 'title' })
    const { result, data } = await run(hook, {
      name: 'title',
      value: 'Salom',
      req: mockReq('uz-Cyrl'),
      stored: { 'uz-Latn': 'Salom' },
    })
    expect(result).toBe('Салом')
    expect(parseCyrlLocked(data.cyrlLocked)).toEqual({})
  })

  it('parallel hook’lar bitta cyrlLocked obyektini yangilaydi (yo‘qolgan yozuv yo‘q)', async () => {
    const req = mockReq('uz-Cyrl')
    const data: Record<string, unknown> = {}
    const siblingDocWithLocales = {
      a: { 'uz-Latn': 'bir', 'uz-Cyrl': 'бир' },
      b: { 'uz-Latn': 'ikki', 'uz-Cyrl': 'икки' },
    }
    const call = (name: string, value: string) =>
      createCyrlSyncFieldHook({ path: name })({
        data,
        field: { name, type: 'text', localized: true },
        originalDoc: { cyrlLocked: { c: true } },
        req,
        siblingData: data,
        siblingDocWithLocales,
        value,
      } as unknown as HookArgs)
    await Promise.all([call('a', 'БИР'), call('b', 'ИККИ')])
    expect(data.cyrlLocked).toEqual({ a: true, b: true, c: true })
    expect(data.cyrlStale).toBe(false)
  })

  it('boshqa locale yoki disableCyrlSync — hech narsa qilinmaydi', async () => {
    const hook = createCyrlSyncFieldHook({ path: 'title' })
    expect(
      (await run(hook, { name: 'title', value: 'a', req: mockReq('en') })).cyrl,
    ).toBeUndefined()
    expect(
      (
        await run(hook, {
          name: 'title',
          value: 'a',
          req: mockReq('uz-Latn', { disableCyrlSync: true }),
        })
      ).cyrl,
    ).toBeUndefined()
  })

  it('maxsus transform (masalan, FAQ array)', async () => {
    const hook = createCyrlSyncFieldHook({
      path: 'faq',
      transform: (value, t) =>
        (value as { question: string }[]).map((row) => ({ question: t.toCyrillic(row.question) })),
    })
    const { cyrl } = await run(hook, {
      name: 'faq',
      value: [{ question: 'Nima uchun?' }],
      req: mockReq('uz-Latn'),
    })
    expect(cyrl).toEqual([{ question: 'Нима учун?' }])
  })
})

describe('yordamchilar', () => {
  it('cyrlValuesEqual: bo‘sh qiymatlar teng', () => {
    expect(cyrlValuesEqual('', null)).toBe(true)
    expect(cyrlValuesEqual(undefined, '  ')).toBe(true)
    expect(cyrlValuesEqual('a', 'b')).toBe(false)
  })
  it('parseCyrlLocked: satr, noto‘g‘ri qiymatlar', () => {
    expect(parseCyrlLocked('{"alt":true,"x":false}')).toEqual({ alt: true })
    expect(parseCyrlLocked('xato')).toEqual({})
    expect(parseCyrlLocked(null)).toEqual({})
  })
})

describe('withCyrlSync', () => {
  const base: CollectionConfig = {
    slug: 'things',
    fields: [
      { name: 'title', type: 'text', localized: true, label: 'Sarlavha' },
      {
        name: 'meta',
        type: 'group',
        fields: [{ name: 'description', type: 'textarea', localized: true }],
      },
      { name: 'plain', type: 'text' },
    ],
  }

  it('hook, maydonlar va endpoint qo‘shiladi (ichki guruh — nuqtali yo‘l)', () => {
    const config = withCyrlSync(base, { fields: ['title', 'meta.description'] })
    const names = config.fields.map((f) => ('name' in f ? f.name : f.type))
    expect(names).toEqual(['title', 'meta', 'plain', 'cyrlLocked', 'cyrlStale', 'cyrlSyncPanel'])
    const title = config.fields[0] as { hooks?: { beforeChange?: unknown[] } }
    expect(title.hooks?.beforeChange).toHaveLength(1)
    const meta = config.fields[1] as { fields: { hooks?: { beforeChange?: unknown[] } }[] }
    expect(meta.fields[0]!.hooks?.beforeChange).toHaveLength(1)
    expect(config.endpoints).toEqual([
      expect.objectContaining({ path: '/:id/regenerate-cyrl', method: 'post' }),
    ])
  })

  it('lokalizatsiya qilinmagan yoki mavjud bo‘lmagan maydon — xato', () => {
    expect(() => withCyrlSync(base, { fields: ['plain'] })).toThrow(/localized/)
    expect(() => withCyrlSync(base, { fields: ['nope'] })).toThrow(/topilmadi/)
  })

  it('global uchun endpoint yo‘li', () => {
    const config = withCyrlSyncGlobal(
      { slug: 'site-settings', fields: [{ name: 'name', type: 'text', localized: true }] },
      { fields: ['name'] },
    )
    expect(config.endpoints).toEqual([expect.objectContaining({ path: '/regenerate-cyrl' })])
  })
})
