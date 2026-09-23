import { LEGAL_PAGES } from '@blog-odya/guidelines'
import categoriesJson from '@blog-odya/shared/seed/categories.json' with { type: 'json' }
import type { CollectionSlug, Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { seed } from '@/seed'
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

describe('seed: idempotent', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
  })

  afterAll(async () => {
    await payload?.db?.destroy?.()
  })

  it('ikki marta ishga tushirilganda dublikat yaratmaydi', async () => {
    const first = await seed(payload)
    const second = await seed(payload)

    // Ikkinchi ishga tushirishda hech narsa yaratilmaydi.
    for (const key of ['categories', 'pages', 'authors', 'tags', 'posts'] as const) {
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
