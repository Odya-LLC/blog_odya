import { LEGAL_PAGES } from '@blog-odya/guidelines'
import categoriesJson from '@blog-odya/shared/seed/categories.json' with { type: 'json' }
import sourcesJson from '@blog-odya/shared/seed/sources.json' with { type: 'json' }
import type { CollectionSlug, Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { parseSeedDemo, seed } from '@/seed'
import { SEED_AUTHOR, SEED_POSTS, SEED_TAGS } from '@/seed/data'

import { initTestPayload } from './helpers/payload'

/**
 * `pnpm seed` (TZ/TASKS M1-02): toza yoki allaqachon seed qilingan DB'da ikki marta ketma-ket
 * ishga tushiriladi — har bir seed hujjati aynan bitta bo'lishi kerak (dublikat yo'q).
 */
let payload: Payload

async function countBySlug(collection: CollectionSlug, slugs: readonly string[]) {
  const { totalDocs } = await payload.count({
    collection,
    where: { slug: { in: [...slugs] } },
  })
  return totalDocs
}

beforeAll(async () => {
  payload = await initTestPayload()
})

afterAll(async () => {
  await payload?.db?.destroy?.()
})

describe('parseSeedDemo (SEED_DEMO env)', () => {
  it('berilmagan/true/1 — demo yoqiq, false/0 — o‘chiq', () => {
    expect(parseSeedDemo(undefined)).toBe(true)
    expect(parseSeedDemo('')).toBe(true)
    expect(parseSeedDemo('true')).toBe(true)
    expect(parseSeedDemo('1')).toBe(true)
    expect(parseSeedDemo('false')).toBe(false)
    expect(parseSeedDemo(' FALSE ')).toBe(false)
    expect(parseSeedDemo('0')).toBe(false)
  })

  it('noma’lum qiymat — xato (imlo xatosi prod’ga demo yuklamasin)', () => {
    expect(() => parseSeedDemo('no')).toThrow(/SEED_DEMO/)
  })
})

// Toza DB'da (CI) birinchi bo'lib ishlaydi — demo'siz seed kategoriya/manba/sahifalarni o'zi yaratadi.
describe('seed: demo o‘chiq (prod, SEED_DEMO=false)', () => {
  it('teg/post/media yaratmaydi, qolganini yaratadi va idempotent', async () => {
    const counts = async () => ({
      posts: (await payload.count({ collection: 'posts' })).totalDocs,
      tags: (await payload.count({ collection: 'tags' })).totalDocs,
      media: (await payload.count({ collection: 'media' })).totalDocs,
    })
    const before = await counts()
    const createSpy = vi.spyOn(payload, 'create')
    const messages: string[] = []
    try {
      const first = await seed(payload, { demo: false, log: (m) => messages.push(m) })
      const second = await seed(payload, { demo: false })

      const created = createSpy.mock.calls.map(([args]) => args.collection)
      for (const collection of ['posts', 'tags', 'media'] as const) {
        expect(created, collection).not.toContain(collection)
      }
      for (const summary of [first, second]) {
        expect(summary.demo).toBe(false)
        expect(summary.posts).toEqual({ created: 0, existing: 0 })
        expect(summary.tags).toEqual({ created: 0, existing: 0 })
        expect(summary.media).toEqual({ created: 0, existing: 0, failed: 0 })
      }
      expect(messages.some((m) => m.includes("Demo kontent o'tkazib yuborildi"))).toBe(true)
      expect(await counts()).toEqual(before)

      // Ikkinchi ishga tushirish hech narsa yaratmaydi.
      for (const key of ['categories', 'pages', 'authors', 'sources'] as const) {
        expect(second[key].created, key).toBe(0)
      }
      expect(second.globals).toEqual({ siteSettings: false, header: false, footer: false })
    } finally {
      createSpy.mockRestore()
    }

    const categorySlugs = (categoriesJson as { slug: string }[]).map((c) => c.slug)
    expect(await countBySlug('categories', categorySlugs)).toBe(9)
    expect(
      await countBySlug(
        'pages',
        LEGAL_PAGES.map((p) => p.slug),
      ),
    ).toBe(6)
    expect(await countBySlug('authors', [SEED_AUTHOR.slug])).toBe(1)
    const sourceSlugs = (sourcesJson as { slug: string }[]).map((s) => s.slug)
    expect(await countBySlug('sources', sourceSlugs)).toBe(7)
    const header = await payload.findGlobal({ slug: 'header', depth: 0 })
    expect(header.navItems?.length).toBeGreaterThan(0)
    const footer = await payload.findGlobal({ slug: 'footer', depth: 0 })
    expect(footer.columns).toHaveLength(2)
  })
})

describe('seed: idempotent', () => {
  it('ikki marta ishga tushirilganda dublikat yaratmaydi', async () => {
    const first = await seed(payload)
    const second = await seed(payload)

    // Ikkinchi ishga tushirishda hech narsa yaratilmaydi.
    for (const key of ['categories', 'pages', 'authors', 'tags', 'posts', 'sources'] as const) {
      expect(second[key].created, key).toBe(0)
    }
    expect(second.globals).toEqual({ siteSettings: false, header: false, footer: false })
    expect(second.categories.existing).toBe(first.categories.created + first.categories.existing)

    const categorySlugs = (categoriesJson as { slug: string }[]).map((c) => c.slug)
    expect(categorySlugs).toHaveLength(9)
    expect(await countBySlug('categories', categorySlugs)).toBe(9)
    expect(
      await countBySlug(
        'pages',
        LEGAL_PAGES.map((p) => p.slug),
      ),
    ).toBe(6)
    expect(await countBySlug('authors', [SEED_AUTHOR.slug])).toBe(1)
    expect(
      await countBySlug(
        'tags',
        SEED_TAGS.map((t) => t.slug),
      ),
    ).toBe(3)
    expect(
      await countBySlug(
        'posts',
        SEED_POSTS.map((p) => p.slug),
      ),
    ).toBe(3)
    const sourceSlugs = (sourcesJson as { slug: string }[]).map((s) => s.slug)
    expect(sourceSlugs).toHaveLength(7)
    expect(await countBySlug('sources', sourceSlugs)).toBe(7)
  })

  it('manbalar: feed kategoriyalari va kalit so‘z qoidalari ID bilan bog‘langan', async () => {
    const { docs } = await payload.find({
      collection: 'sources',
      where: { slug: { equals: 'habr' } },
      depth: 1,
    })
    const habr = docs[0]!
    expect(habr).toMatchObject({ language: 'ru', fetchMode: 'rss_plus_page', isActive: true })
    expect(habr.feeds?.length).toBeGreaterThan(0)
    const mapsTo = habr.feeds?.[0]?.mapsTo
    expect(typeof mapsTo === 'object' && mapsTo?.slug).toBeTruthy()
    expect(habr.keywordRules?.length).toBeGreaterThan(0)
    expect((habr.selectors as { content?: string }).content).toBeTruthy()
    const backup = await payload.find({
      collection: 'sources',
      where: { slug: { equals: '3dnews' } },
    })
    expect(backup.docs[0]?.isActive).toBe(false)
  })

  it('site-settings: "Blog Odya" / "Блог Одя"', async () => {
    const latn = await payload.findGlobal({ slug: 'site-settings', locale: 'uz-Latn' })
    const cyrl = await payload.findGlobal({ slug: 'site-settings', locale: 'uz-Cyrl' })
    expect(latn.siteName).toBe('Blog Odya')
    expect(cyrl.siteName).toBe('Блог Одя')
  })

  it('kategoriyalar lotin/kirill nomlari va brend ranglari bilan', async () => {
    const latn = await payload.find({
      collection: 'categories',
      where: { slug: { equals: 'suniy-intellekt' } },
      locale: 'uz-Latn',
    })
    const cyrl = await payload.find({
      collection: 'categories',
      where: { slug: { equals: 'suniy-intellekt' } },
      locale: 'uz-Cyrl',
    })
    expect(latn.docs[0]?.name).toBe("Sun'iy intellekt")
    expect(cyrl.docs[0]?.name).toBe('Сунъий интеллект')
    expect(latn.docs[0]?.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    // Kirill nomlari qo'lda tasdiqlangan (TZ §10.4) — qulflangan, lotin o'zgarsa qayta yozilmaydi.
    expect(cyrl.docs[0]?.cyrlLocked).toMatchObject({ name: true, description: true, meta: true })
  })

  it('demo postlar chop etilgan va ommaga ko‘rinadi', async () => {
    const { docs } = await payload.find({
      collection: 'posts',
      where: { slug: { in: SEED_POSTS.map((p) => p.slug) } },
      overrideAccess: false,
    })
    expect(docs).toHaveLength(3)
    for (const post of docs) {
      expect(post.workflowStatus).toBe('published')
      expect(post.readingTime).toBeGreaterThan(0)
      expect(post.sources?.length).toBeGreaterThan(0)
    }
  })

  it('huquqiy sahifalar chop etilgan, matn Lexical blokida', async () => {
    const { docs } = await payload.find({
      collection: 'pages',
      where: { slug: { equals: 'biz-haqimizda' } },
      overrideAccess: false,
    })
    const block = docs[0]?.layout?.[0]
    expect(block?.blockType).toBe('content')
    expect(JSON.stringify(block)).toContain('Blog Odya')
  })
})
