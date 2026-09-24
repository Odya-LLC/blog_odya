/**
 * `createCyrlSyncFieldHook` mantiqi (DB'siz): richText, jsonb kalit tartibi, parallel hook'lar,
 * `withCyrlSync` konfiguratsiyasi.
 */
import type { CollectionConfig, Config, FieldHook, PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  createCyrlSyncFieldHook,
  cyrlSyncPlugin,
  type CyrlSyncFieldSpec,
  cyrlValuesEqual,
  faqCyrlSpec,
  parseCyrlLocked,
  withCyrlSync,
  withCyrlSyncGlobal,
} from '@/translit/cyrlSync'
import { CYRL_SYNC } from '@/translit/sync-config'
import {
  invalidateTransliteratorCache,
  mergeGlossary,
  seedGlossary,
} from '@/translit/transliterator'

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

describe('OBLOG-37: qulf kaliti, FAQ, plagin', () => {
  it('lockKey: bir nechta maydon bitta kalitni bo‘lishadi (meta.* → meta)', async () => {
    const req = mockReq('uz-Cyrl')
    const data: Record<string, unknown> = {}
    const hook = createCyrlSyncFieldHook({ path: 'meta.title', lockKey: 'meta' })
    await hook({
      data,
      field: { name: 'title', type: 'text', localized: true },
      originalDoc: {},
      req,
      siblingData: {},
      siblingDocWithLocales: { title: { 'uz-Latn': 'SEO', 'uz-Cyrl': 'СЕО' } },
      value: 'СЕО (таҳрир)',
    } as unknown as HookArgs)
    expect(data.cyrlLocked).toEqual({ meta: true })

    // Qulflangan kalit: boshqa meta maydoni ham qayta yozilmaydi, cyrlStale.
    const description = createCyrlSyncFieldHook({ path: 'meta.description', lockKey: 'meta' })
    const latinData: Record<string, unknown> = { cyrlLocked: { meta: true } }
    const sibling = { description: { 'uz-Latn': 'Eski', 'uz-Cyrl': 'Эски' } }
    const runDescription = (request: PayloadRequest) =>
      description({
        data: latinData,
        field: { name: 'description', type: 'textarea', localized: true },
        originalDoc: {},
        req: request,
        siblingData: {},
        siblingDocWithLocales: sibling,
        value: 'Yangi',
      } as unknown as HookArgs)
    await runDescription(mockReq('uz-Latn'))
    expect(sibling.description['uz-Cyrl']).toBe('Эски')
    expect(latinData.cyrlStale).toBe(true)

    // Qayta generatsiya — qulf kaliti bo'yicha.
    await runDescription(mockReq('uz-Latn', { cyrlRegenerate: ['meta'] }))
    expect(sibling.description['uz-Cyrl']).toBe('Янги')
    expect(latinData.cyrlLocked).toEqual({})
  })

  it('FAQ: kirill qatorlari — mavjud id qayta ishlatiladi, yangisiga yangi id', async () => {
    const hook = createCyrlSyncFieldHook(faqCyrlSpec())
    const { cyrl } = await run(hook, {
      name: 'faq',
      value: [
        { id: 'latn-1', question: 'Nima?', answer: 'Hech narsa.' },
        { question: 'Qachon?', answer: 'Ertaga.' },
      ],
      req: mockReq('uz-Latn'),
      stored: {
        'uz-Latn': [{ id: 'latn-1', question: 'Eski?', answer: 'Eski.' }],
        'uz-Cyrl': [{ id: 'cyrl-1', question: 'Эски?', answer: 'Эски.' }],
      },
    })
    const rows = cyrl as { id: string; question: string; answer: string }[]
    expect(rows.map((row) => [row.question, row.answer])).toEqual([
      ['Нима?', 'Ҳеч нарса.'],
      ['Қачон?', 'Эртага.'],
    ])
    expect(rows[0]!.id).toBe('cyrl-1')
    expect(rows[1]!.id).toMatch(/^[0-9a-f]{24}$/)
  })

  it('mavjud cyrlLocked/cyrlStale maydonlari qayta qo‘shilmaydi (posts)', () => {
    const config = withCyrlSync(
      {
        slug: 'things',
        fields: [
          {
            type: 'tabs',
            tabs: [
              {
                label: 'A',
                fields: [
                  { name: 'title', type: 'text', localized: true },
                  { name: 'cyrlLocked', type: 'json' },
                ],
              },
            ],
          },
          { name: 'cyrlStale', type: 'checkbox' },
        ],
      },
      { fields: ['title'] },
    )
    const names = config.fields.map((f) => ('name' in f ? f.name : f.type))
    expect(names).toEqual(['tabs', 'cyrlStale', 'cyrlSyncPanel'])
  })

  it('cyrlSyncPlugin: plaginlar qo‘shgan maydonlar ham topiladi; noma’lum kolleksiya — xato', () => {
    const incoming = {
      collections: [
        {
          slug: 'posts',
          fields: [
            { name: 'title', type: 'text', localized: true },
            {
              name: 'meta',
              type: 'group',
              fields: [{ name: 'title', type: 'text', localized: true }],
            },
          ],
        },
        { slug: 'other', fields: [{ name: 'x', type: 'text' }] },
      ],
    } as unknown as Config
    const out = cyrlSyncPlugin({
      collections: { posts: { fields: ['title', { path: 'meta.title', lockKey: 'meta' }] } },
    })(incoming) as Config
    const posts = out.collections!.find((c) => c.slug === 'posts')!
    expect(posts.endpoints).toEqual([
      expect.objectContaining({ path: '/:id/regenerate-cyrl', method: 'post' }),
    ])
    const panel = posts.fields.find(
      (f) => 'name' in f && f.name === 'cyrlSyncPanel',
    ) as unknown as {
      admin: { components: { Field: { clientProps: { fields: unknown[] } } } }
    }
    expect(panel.admin.components.Field.clientProps.fields).toEqual([
      { path: 'title', label: 'title' },
      { path: 'meta', label: 'meta' },
    ])
    expect(out.collections!.find((c) => c.slug === 'other')!.fields).toHaveLength(1)
    expect(() => cyrlSyncPlugin({ collections: { tags: { fields: ['name'] } } })(incoming)).toThrow(
      /tags/,
    )
  })

  it('CYRL_SYNC: barcha kontent kolleksiyalari va globals ulangan (OBLOG-29)', () => {
    expect(Object.keys(CYRL_SYNC.collections ?? {}).sort()).toEqual([
      'authors',
      'categories',
      'media',
      'pages',
      'posts',
      'tags',
    ])
    expect(Object.keys(CYRL_SYNC.globals ?? {}).sort()).toEqual([
      'footer',
      'header',
      'site-settings',
    ])
  })
})

// ---------------------------------------------------------------------------
// OBLOG-29: massiv ichidagi maydonlar, bloklar (layout), embed
// ---------------------------------------------------------------------------

type SpecItem = string | CyrlSyncFieldSpec

function specAt(items: ReadonlyArray<SpecItem> | undefined, path: string): CyrlSyncFieldSpec {
  const spec = items?.find(
    (item): item is CyrlSyncFieldSpec => typeof item !== 'string' && item.path === path,
  )
  if (!spec) throw new Error(`spec topilmadi: ${path}`)
  return spec
}

describe('OBLOG-29: menyu yorliqlari, layout bloklari, embed', () => {
  it('lokalizatsiya qilinmagan array ichidagi maydon (navItems.label) — hook ulanadi, qulf kaliti umumiy', () => {
    const config = withCyrlSyncGlobal(
      {
        slug: 'header',
        fields: [
          {
            name: 'navItems',
            type: 'array',
            fields: [
              { name: 'label', type: 'text', localized: true },
              { type: 'row', fields: [{ name: 'url', type: 'text' }] },
            ],
          },
        ],
      },
      { fields: [{ path: 'navItems.label', lockKey: 'navItems', lockLabel: 'Asosiy menyu' }] },
    )
    const nav = config.fields[0] as unknown as {
      fields: Array<{ hooks?: { beforeChange?: unknown[] } }>
    }
    expect(nav.fields[0]!.hooks?.beforeChange).toHaveLength(1)
    const panel = config.fields.find(
      (f) => 'name' in f && f.name === 'cyrlSyncPanel',
    ) as unknown as {
      admin: { components: { Field: { clientProps: { fields: unknown[] } } } }
    }
    expect(panel.admin.components.Field.clientProps.fields).toEqual([
      { path: 'navItems', label: 'Asosiy menyu' },
    ])
  })

  it('lokalizatsiya qilingan array ichiga kirilmaydi (butun massiv — bitta maydon)', () => {
    expect(() =>
      withCyrlSync(
        {
          slug: 'things',
          fields: [
            {
              name: 'faq',
              type: 'array',
              localized: true,
              fields: [{ name: 'question', type: 'text' }],
            },
          ],
        },
        { fields: ['faq.question'] },
      ),
    ).toThrow(/faq\.question/)
  })

  it('array qatori: kirill shu qatorning siblingDocWithLocales iga yoziladi, qulf — umumiy kalit', async () => {
    const hook = createCyrlSyncFieldHook({ path: 'navItems.label', lockKey: 'navItems' })
    const latin = await run(hook, {
      name: 'label',
      value: 'Sunʼiy intellekt',
      req: mockReq('uz-Latn'),
      stored: { 'uz-Latn': 'Eski', 'uz-Cyrl': 'Эски' },
    })
    expect(latin.cyrl).toBe('Сунъий интеллект')

    const cyrl = await run(hook, {
      name: 'label',
      value: 'Сунъий интеллект (қўлда)',
      req: mockReq('uz-Cyrl'),
      stored: { 'uz-Latn': 'Sunʼiy intellekt', 'uz-Cyrl': 'Сунъий интеллект' },
    })
    expect(cyrl.data.cyrlLocked).toEqual({ navItems: true })
  })

  it('layout: bloklar matni o‘giriladi, har qator (ichki massiv ham) o‘z id siga ega', async () => {
    const hook = createCyrlSyncFieldHook(specAt(CYRL_SYNC.collections?.pages?.fields, 'layout'))
    const layout = [
      { id: 'latn-1', blockType: 'content', blockName: 'Kirish', richText: lexical('Salom dunyo') },
      {
        id: 'latn-2',
        blockType: 'faq',
        title: 'Koʻp soʻraladigan savollar',
        items: [
          { id: 'latn-3', question: 'Nima?', answer: 'Hech narsa.' },
          { id: 'latn-4', question: 'Qachon?', answer: 'Ertaga.' },
        ],
      },
    ]
    const { cyrl } = await run(hook, {
      name: 'layout',
      value: layout,
      req: mockReq('uz-Latn'),
      stored: {
        'uz-Cyrl': [
          { id: 'cyrl-1', blockType: 'content', richText: lexical('Эски') },
          // Blok turi mos emas — id qayta ishlatilmaydi.
          { id: 'cyrl-2', blockType: 'content', richText: lexical('Эски') },
        ],
      },
    })
    const rows = cyrl as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    expect(rows[0]!.id).toBe('cyrl-1')
    expect(rows[0]!.blockName).toBe('Kirish')
    expect(JSON.stringify(rows[0]!.richText)).toContain('Салом дунё')
    expect(rows[1]!.id).toMatch(/^[0-9a-f]{24}$/)
    expect(rows[1]!.title).toBe('Кўп сўраладиган саволлар')
    const items = rows[1]!.items as Array<Record<string, string>>
    expect(items.map((i) => [i.question, i.answer])).toEqual([
      ['Нима?', 'Ҳеч нарса.'],
      ['Қачон?', 'Эртага.'],
    ])
    for (const id of [rows[1]!.id, ...items.map((i) => i.id)]) {
      expect(['latn-2', 'latn-3', 'latn-4']).not.toContain(id)
    }
    // Lotin qiymati o'zgarmaydi.
    expect(layout[1]!.title).toBe('Koʻp soʻraladigan savollar')
  })

  it('id va null farqlari “o‘zgarish” emas (qulf/eskirish qo‘yilmaydi)', () => {
    expect(
      cyrlValuesEqual(
        [{ id: 'a', blockType: 'faq', blockName: null, title: 'X' }],
        [{ id: 'b', blockType: 'faq', title: 'X' }],
      ),
    ).toBe(true)
  })

  it('posts.content: embed bloki izohi o‘giriladi, URL va kod o‘zgarmaydi', async () => {
    const spec = specAt(
      CYRL_SYNC.collections?.posts?.richTextFields as ReadonlyArray<SpecItem>,
      'content',
    )
    const hook = createCyrlSyncFieldHook({ ...spec, kind: 'richText' })
    const content = {
      root: {
        type: 'root',
        children: [
          {
            type: 'block',
            version: 2,
            fields: {
              id: 'b1',
              blockType: 'embed',
              url: 'https://youtube.com/watch?v=abc',
              caption: 'Taqdimot videosi',
            },
          },
          { type: 'block', version: 2, fields: { id: 'b2', blockType: 'code', code: 'salom()' } },
          ...lexical('Matn').root.children,
        ],
      },
    }
    const { cyrl } = await run(hook, { name: 'content', value: content, req: mockReq('uz-Latn') })
    const children = (cyrl as { root: { children: Array<{ fields: Record<string, string> }> } })
      .root.children
    expect(children[0]!.fields).toMatchObject({
      url: 'https://youtube.com/watch?v=abc',
      caption: 'Тақдимот видеоси',
    })
    expect(children[1]!.fields.code).toBe('salom()')
  })
})

describe('glossariy (seed + DB)', () => {
  it('DB yozuvi seed ustidan (kalit — atama + til), yangisi qo‘shiladi', () => {
    const seed = seedGlossary()
    const openai = seed.items.find((item) => item.term === 'OpenAI')!
    const merged = mergeGlossary([
      { ...openai, note: 'DB izohi', updatedAt: '2099-01-02T00:00:00Z' },
      {
        term: 'Odyagram',
        language: 'en',
        translation: 'Odyagram',
        kind: 'brand',
        doNotTranslate: true,
        doNotTransliterate: true,
      },
    ])
    expect(merged.source).toBe('seed+db')
    expect(merged.updatedAt).toBe('2099-01-02')
    expect(merged.items).toHaveLength(seed.items.length + 1)
    expect(merged.items.find((item) => item.term === 'OpenAI')?.note).toBe('DB izohi')
    expect(mergeGlossary([]).source).toBe('seed')
  })
})
