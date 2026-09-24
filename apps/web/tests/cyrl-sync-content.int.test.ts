/**
 * Integration (OBLOG-29): kirill sinxronlash — pages (`layout` bloklari), categories, authors va
 * globals (site-settings, header, footer): avtomatik to'ldirish, qo'lda tuzatish → qulf,
 * `cyrlStale`, "Kirillni qayta generatsiya qilish" endpoint'i. Globals test oxirida asl holatiga
 * qaytariladi.
 */
import { createLocalReq, type Endpoint, type GlobalSlug, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Category, Footer, Header, Page, SiteSetting } from '@/payload-types'
import { setRevalidator } from '@/site/revalidate'
import { CYRL_CONTEXT_DISABLE, REGENERATE_CYRL_ENDPOINT } from '@/translit/cyrlSync'
import { invalidateTransliteratorCache } from '@/translit/transliterator'

import {
  as,
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  testSlug,
  type TestUsers,
} from './helpers/content'
import { asUser, deleteTestUsers, initTestPayload } from './helpers/payload'

let payload: Payload
let users: TestUsers
let category: Category

const LATN = 'uz-Latn' as const
const CYRL = 'uz-Cyrl' as const

const lexical = (text: string) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph',
        format: '' as const,
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        textFormat: 0,
        children: [
          { type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 },
        ],
      },
    ],
  },
})

function endpointOf(endpoints: Endpoint[] | false | undefined): Endpoint {
  const endpoint = endpoints
    ? endpoints.find((e) => e.path.endsWith(REGENERATE_CYRL_ENDPOINT))
    : undefined
  if (!endpoint) throw new Error('regenerate-cyrl endpoint yo‘q')
  return endpoint
}

async function regenerateCollection(
  collection: 'pages' | 'categories' | 'authors',
  id: number,
  user = users.editor,
): Promise<Response> {
  const req = await createLocalReq({ user: asUser(user) }, payload)
  req.routeParams = { id: String(id) }
  return endpointOf(payload.collections[collection].config.endpoints).handler(req)
}

async function regenerateGlobal(slug: GlobalSlug, user = users.admin): Promise<Response> {
  const global = payload.globals.config.find((g) => g.slug === slug)!
  const req = await createLocalReq({ user: asUser(user) }, payload)
  return endpointOf(global.endpoints).handler(req)
}

beforeAll(async () => {
  payload = await initTestPayload()
  setRevalidator(() => {})
  invalidateTransliteratorCache()
  await deleteTestContent(payload)
  await deleteTestUsers(payload)
  users = await createTestUsers(payload)
  category = await createTestCategory(payload)
})

afterAll(async () => {
  if (!payload) return
  await deleteTestContent(payload)
  await deleteTestUsers(payload)
  await payload?.db?.destroy?.()
})

describe('pages: title, layout (content + faq bloklari), meta', () => {
  let page: Page

  const readPage = (locale: typeof LATN | typeof CYRL) =>
    payload.findByID({
      collection: 'pages',
      id: page.id,
      locale,
      fallbackLocale: false,
      draft: true,
      depth: 0,
    })

  beforeAll(async () => {
    page = await payload.create({
      collection: 'pages',
      locale: LATN,
      data: {
        title: 'Biz haqimizda',
        slug: testSlug('page-cyrl'),
        _status: 'published',
        layout: [
          { blockType: 'content', richText: lexical('Tahririyat siyosati') as never },
          {
            blockType: 'faq',
            title: 'Savollar',
            items: [{ question: 'Kim yozadi?', answer: 'Tahririyat.' }],
          },
        ],
        meta: { title: 'Biz haqimizda — Blog Odya', description: 'Loyiha haqida' },
      },
      ...as(users.editor),
    })
  })

  it('lotin saqlanganda kirill avtomatik: sarlavha, bloklar, meta; qatorlar o‘z id si bilan', async () => {
    const cyrl = await readPage(CYRL)
    expect(cyrl.title).toBe('Биз ҳақимизда')
    expect(cyrl.meta).toMatchObject({
      title: 'Биз ҳақимизда — Блог Одя',
      description: 'Лойиҳа ҳақида',
    })
    const [content, faq] = cyrl.layout ?? []
    expect(content?.blockType).toBe('content')
    expect(JSON.stringify(content)).toContain('Таҳририят сиёсати')
    expect(faq).toMatchObject({
      blockType: 'faq',
      title: 'Саволлар',
      items: [{ question: 'Ким ёзади?', answer: 'Таҳририят.' }],
    })
    const latn = await readPage(LATN)
    expect(latn.title).toBe('Biz haqimizda')
    expect(latn.layout?.[1]).toMatchObject({ title: 'Savollar' })
    const latnIds = (latn.layout ?? []).map((b) => b.id)
    for (const block of cyrl.layout ?? []) expect(latnIds).not.toContain(block.id)
    expect(cyrl.cyrlStale).toBe(false)
  })

  it('kirill qo‘lda → qulf; lotin o‘zgarsa qayta yozilmaydi va cyrlStale; regenerate', async () => {
    const edited = await payload.update({
      collection: 'pages',
      id: page.id,
      locale: CYRL,
      data: { title: 'Биз ҳақимизда (таҳрир)' },
      ...as(users.editor),
    })
    expect(edited.cyrlLocked).toEqual({ title: true })

    const latin = await payload.update({
      collection: 'pages',
      id: page.id,
      locale: LATN,
      data: {
        title: 'Loyiha haqida',
        layout: [{ blockType: 'content', richText: lexical('Yangi matn') as never }],
      },
      ...as(users.editor),
    })
    expect(latin.cyrlStale).toBe(true)
    let cyrl = await readPage(CYRL)
    expect(cyrl.title).toBe('Биз ҳақимизда (таҳрир)')
    expect(cyrl.layout).toHaveLength(1)
    expect(JSON.stringify(cyrl.layout)).toContain('Янги матн')

    const response = await regenerateCollection('pages', page.id)
    expect(response.status).toBe(200)
    cyrl = await readPage(CYRL)
    expect(cyrl.title).toBe('Лойиҳа ҳақида')
    expect(cyrl.cyrlLocked).toEqual({})
    expect(cyrl.cyrlStale).toBe(false)
  })
})

describe('categories: name, description, meta', () => {
  it('avtomatik kirill, qulf va regenerate', async () => {
    const created = await payload.create({
      collection: 'categories',
      locale: LATN,
      data: {
        name: 'Kosmik texnologiyalar',
        slug: testSlug('cat-cyrl'),
        description: 'Raketalar va sunʼiy yoʻldoshlar',
        meta: { title: 'Kosmos', description: 'Kosmos yangiliklari' },
      },
      ...as(users.editor),
    })
    const read = () =>
      payload.findByID({
        collection: 'categories',
        id: created.id,
        locale: CYRL,
        fallbackLocale: false,
        depth: 0,
      })
    let cyrl = await read()
    expect(cyrl.name).toBe('Космик технологиялар')
    expect(cyrl.description).toBe('Ракеталар ва сунъий йўлдошлар')
    expect(cyrl.meta).toMatchObject({ title: 'Космос', description: 'Космос янгиликлари' })

    await payload.update({
      collection: 'categories',
      id: created.id,
      locale: CYRL,
      data: { name: 'Коинот технологиялари' },
      ...as(users.editor),
    })
    const latin = await payload.update({
      collection: 'categories',
      id: created.id,
      locale: LATN,
      data: { name: 'Kosmos texnologiyalari', description: 'Raketalar' },
      ...as(users.editor),
    })
    expect(latin.cyrlStale).toBe(true)
    cyrl = await read()
    expect(cyrl.name).toBe('Коинот технологиялари')
    expect(cyrl.description).toBe('Ракеталар')

    expect((await regenerateCollection('categories', created.id)).status).toBe(200)
    cyrl = await read()
    expect(cyrl.name).toBe('Космос технологиялари')
    expect(cyrl.cyrlLocked).toEqual({})
  })
})

describe('authors: name, position, bio', () => {
  it('avtomatik kirill va regenerate', async () => {
    const author = await payload.create({
      collection: 'authors',
      locale: LATN,
      data: {
        name: 'Odil Toshmatov',
        slug: testSlug('author-cyrl'),
        position: 'Bosh muharrir',
        bio: 'Texnologiya jurnalisti.',
      },
      ...as(users.editor),
    })
    const read = () =>
      payload.findByID({
        collection: 'authors',
        id: author.id,
        locale: CYRL,
        fallbackLocale: false,
        depth: 0,
      })
    expect(await read()).toMatchObject({
      name: 'Одил Тошматов',
      position: 'Бош муҳаррир',
      bio: 'Технология журналисти.',
    })
    await payload.update({
      collection: 'authors',
      id: author.id,
      locale: CYRL,
      data: { bio: 'Қўлда' },
      ...as(users.editor),
    })
    await payload.update({
      collection: 'authors',
      id: author.id,
      locale: LATN,
      data: { bio: 'Kiberxavfsizlik jurnalisti.' },
      ...as(users.editor),
    })
    expect((await read()).bio).toBe('Қўлда')
    expect((await regenerateCollection('authors', author.id)).status).toBe(200)
    expect((await read()).bio).toBe('Киберхавфсизлик журналисти.')
  })
})

// ---------------------------------------------------------------------------
// Globals — haqiqiy yozuvlar: test oldidan saqlanadi va oxirida tiklanadi.
// ---------------------------------------------------------------------------

type GlobalDoc = SiteSetting | Header | Footer
const GLOBALS = ['site-settings', 'header', 'footer'] as const

describe('globals: site-settings, header, footer', () => {
  const saved = new Map<string, Record<string, GlobalDoc>>()

  const read = <T extends GlobalDoc>(slug: (typeof GLOBALS)[number], locale: string) =>
    payload.findGlobal({
      slug,
      locale: locale as never,
      fallbackLocale: false,
      depth: 0,
    }) as Promise<T>

  beforeAll(async () => {
    for (const slug of GLOBALS) {
      saved.set(slug, { [LATN]: await read(slug, LATN), [CYRL]: await read(slug, CYRL) })
    }
  })

  afterAll(async () => {
    const strip = (doc: GlobalDoc) => {
      const {
        id: _id,
        createdAt: _c,
        updatedAt: _u,
        globalType: _g,
        ...rest
      } = doc as GlobalDoc & {
        globalType?: string
      }
      return rest
    }
    for (const slug of GLOBALS) {
      const docs = saved.get(slug)
      if (!docs) continue
      for (const locale of [LATN, CYRL]) {
        await payload.updateGlobal({
          slug,
          locale,
          data: strip(docs[locale]!) as never,
          context: { [CYRL_CONTEXT_DISABLE]: true },
        })
      }
    }
  })

  it('site-settings: avtomatik kirill, qulf va regenerate (faqat admin)', async () => {
    await payload.updateGlobal({
      slug: 'site-settings',
      locale: LATN,
      data: { siteName: 'Blog Odya', tagline: 'Texnologiya yangiliklari', cyrlLocked: {} },
    })
    let cyrl = await read<SiteSetting>('site-settings', CYRL)
    expect(cyrl.tagline).toBe('Технология янгиликлари')

    await payload.updateGlobal({
      slug: 'site-settings',
      locale: CYRL,
      data: { tagline: 'Технология янгиликлари (қўлда)' },
    })
    const latin = await payload.updateGlobal({
      slug: 'site-settings',
      locale: LATN,
      data: { tagline: 'IT yangiliklari' },
    })
    expect(latin.cyrlStale).toBe(true)
    cyrl = await read<SiteSetting>('site-settings', CYRL)
    expect(cyrl.tagline).toBe('Технология янгиликлари (қўлда)')
    expect(cyrl.cyrlLocked).toMatchObject({ tagline: true })

    // site-settings — faqat admin (update access).
    expect((await regenerateGlobal('site-settings', users.editor)).status).toBe(403)
    expect((await regenerateGlobal('site-settings', users.admin)).status).toBe(200)
    cyrl = await read<SiteSetting>('site-settings', CYRL)
    expect(cyrl.tagline).toBe('ИТ янгиликлари')
    expect(cyrl.cyrlLocked).toEqual({})
    expect(cyrl.cyrlStale).toBe(false)
  })

  it('header: menyu yorliqlari (array qatorlari) kirillda avtomatik; yangi qator ham', async () => {
    const saved = await payload.updateGlobal({
      slug: 'header',
      locale: LATN,
      data: {
        cyrlLocked: {},
        navItems: [{ type: 'category', category: category.id, label: 'Sunʼiy intellekt' }],
        moreItems: [{ type: 'custom', url: '/qidiruv', label: 'Qidiruv' }],
      },
    })
    let cyrl = await read<Header>('header', CYRL)
    expect(cyrl.navItems?.map((i) => i.label)).toEqual(['Сунъий интеллект'])
    expect(cyrl.moreItems?.map((i) => i.label)).toEqual(['Қидирув'])

    // Qator qo'shiladi (lotin): mavjud va yangi qatorlar kirillda.
    await payload.updateGlobal({
      slug: 'header',
      locale: LATN,
      data: {
        navItems: [
          ...(saved.navItems ?? []),
          { type: 'category', category: category.id, label: 'Oʻyinlar' },
        ],
      },
    })
    cyrl = await read<Header>('header', CYRL)
    expect(cyrl.navItems?.map((i) => i.label)).toEqual(['Сунъий интеллект', 'Ўйинлар'])

    // Qo'lda tuzatish — butun menyu qulfi; regenerate — qayta yoziladi.
    await payload.updateGlobal({
      slug: 'header',
      locale: CYRL,
      data: {
        navItems: (cyrl.navItems ?? []).map((item, index) =>
          index === 0 ? { ...item, label: 'СИ' } : item,
        ),
      },
    })
    expect((await read<Header>('header', LATN)).cyrlLocked).toEqual({ navItems: true })
    expect((await regenerateGlobal('header', users.editor)).status).toBe(200)
    cyrl = await read<Header>('header', CYRL)
    expect(cyrl.navItems?.map((i) => i.label)).toEqual(['Сунъий интеллект', 'Ўйинлар'])
    expect(cyrl.cyrlLocked).toEqual({})
  })

  it('footer: ichma-ich massiv (columns[].links[].label) va copyright', async () => {
    await payload.updateGlobal({
      slug: 'footer',
      locale: LATN,
      data: {
        cyrlLocked: {},
        copyright: '© Odya jamoasi',
        columns: [
          {
            title: 'Kategoriyalar',
            links: [{ type: 'custom', url: '/kibersport', label: 'Kibersport' }],
          },
        ],
      },
    })
    const cyrl = await read<Footer>('footer', CYRL)
    expect(cyrl.copyright).toBe('© Одя жамоаси')
    expect(cyrl.columns?.[0]?.title).toBe('Категориялар')
    expect(cyrl.columns?.[0]?.links?.[0]?.label).toBe('Киберспорт')
  })
})
