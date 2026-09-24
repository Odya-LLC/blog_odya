import { XMLValidator } from 'fast-xml-parser'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Category, Post } from '@/payload-types'
import { seed } from '@/seed'
import { SEED_POSTS } from '@/seed/data'
import {
  loadFeed,
  loadNewsPosts,
  loadSitemapCategories,
  loadSitemapMonths,
  loadSitemapPages,
  loadSitemapPosts,
} from '@/site/seo/data'
import { localizedSitemapUrls, monthKey, newsSitemapXml, urlsetXml } from '@/site/seo/sitemap'

import {
  as,
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  testSlug,
  type TestUsers,
} from './helpers/content'
import { deleteTestUsers, initTestPayload } from './helpers/payload'
import { createTestS3Client, ensureBucket } from './helpers/s3'

/**
 * SEO ma'lumot qatlami (M1-06): sitemap (oylar, postlar, kategoriyalar, sahifalar), Google News
 * (48 soat), RSS — Payload Local API, faqat chop etilgan va `noindex` bo'lmagan hujjatlar.
 * (`unstable_cache` o'ramlari Next.js ichida ishlaydi — bu yerda `load*` funksiyalari.)
 */
let payload: Payload
let users: TestUsers
let category: Category

const esports = SEED_POSTS.find((post) => post.category === 'kibersport')!

async function publishedTestPost(title: string, data: Partial<Post> = {}): Promise<Post> {
  const editor = as(users.editor)
  const post = await payload.create({
    collection: 'posts',
    data: { title, slug: testSlug('seo'), category: category.id, workflowStatus: 'draft', ...data },
    ...editor,
  })
  for (const workflowStatus of ['in_progress', 'review'] as const) {
    await payload.update({ collection: 'posts', id: post.id, data: { workflowStatus }, ...editor })
  }
  return payload.update({
    collection: 'posts',
    id: post.id,
    data: { _status: 'published' },
    ...editor,
  })
}

describe('SEO ma’lumotlari (Local API)', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await ensureBucket(createTestS3Client())
    await seed(payload)
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
  })

  afterAll(async () => {
    if (payload) {
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
      await payload.db?.destroy?.()
    }
  })

  it('sitemap: oylar va oylik postlar (lotin yo‘li), noindex va qoralama yo‘q', async () => {
    const fresh = await publishedTestPost('SEO sitemap test')
    const hidden = await publishedTestPost('SEO noindex test', {
      meta: { noindex: true },
    } as Partial<Post>)
    const draft = await payload.create({
      collection: 'posts',
      data: {
        title: 'Qoralama',
        slug: testSlug('seo-draft'),
        category: category.id,
        workflowStatus: 'draft',
      },
    })

    const month = monthKey(fresh.publishedAt!)!
    const months = await loadSitemapMonths()
    expect(months.map((entry) => entry.month)).toContain(month)
    expect(months.map((entry) => entry.month)).toEqual(
      [...months.map((entry) => entry.month)].sort().reverse(),
    )

    const posts = await loadSitemapPosts(month)
    const paths = posts.map((entry) => entry.path)
    expect(paths).toContain(`/${category.slug}/${fresh.slug}`)
    expect(paths).not.toContain(`/${category.slug}/${hidden.slug}`)
    expect(paths).not.toContain(`/${category.slug}/${draft.slug}`)
    expect(posts.every((entry) => entry.lastmod)).toBe(true)

    const xml = urlsetXml(
      posts.flatMap((entry) => localizedSitemapUrls(entry.path, entry.lastmod, 'https://x.uz')),
    )
    expect(XMLValidator.validate(xml)).toBe(true)
    expect(xml).toContain(`https://x.uz/kr/${category.slug}/${fresh.slug}`)
  })

  it('sitemap: kategoriyalar va sahifalar (bosh sahifa + huquqiy sahifalar)', async () => {
    const categories = await loadSitemapCategories()
    expect(categories.map((entry) => entry.path)).toContain('/kibersport')
    const pages = await loadSitemapPages()
    expect(pages[0]?.path).toBe('/')
    expect(pages.length).toBeGreaterThan(1)
  })

  it('news: oxirgi 48 soat, lotin va kirill sarlavhalar', async () => {
    const fresh = await publishedTestPost('SEO news test')
    await payload.update({
      collection: 'posts',
      id: fresh.id,
      locale: 'uz-Cyrl',
      data: { title: 'СЕО янгилик тести' },
      ...as(users.editor),
    })
    const news = await loadNewsPosts()
    const entry = news.find((post) => post.path === `/${category.slug}/${fresh.slug}`)
    expect(entry?.title).toEqual({ 'uz-Latn': 'SEO news test', 'uz-Cyrl': 'СЕО янгилик тести' })
    // 48 soatdan eski — kirmaydi.
    const later = new Date(Date.now() + 49 * 60 * 60 * 1000)
    expect((await loadNewsPosts(later)).some((post) => post.path === entry?.path)).toBe(false)

    const xml = newsSitemapXml([
      {
        loc: `https://x.uz${entry!.path}`,
        title: entry!.title['uz-Latn'],
        publicationDate: entry!.publishedAt,
        publicationName: 'Blog Odya',
        language: 'uz',
      },
    ])
    expect(XMLValidator.validate(xml)).toBe(true)
  })

  it('RSS: umumiy va kategoriya lentasi, kirill URL’lar; noma’lum kategoriya — null', async () => {
    const feed = await loadFeed('uz-Cyrl', 'kibersport', 30)
    expect(feed?.category?.name).toBe('Киберспорт')
    const item = feed?.items.find((post) => post.path.endsWith(`/${esports.slug}`))
    expect(item).toMatchObject({
      title: esports.title['uz-Cyrl'],
      path: `/kr/kibersport/${esports.slug}`,
      category: 'Киберспорт',
    })
    const all = await loadFeed('uz-Latn', null, 5)
    expect(all?.category).toBeNull()
    expect(all?.items.length).toBeGreaterThan(0)
    expect(all?.items.length).toBeLessThanOrEqual(5)
    expect(await loadFeed('uz-Latn', 'bunday-kategoriya-yoq', 5)).toBeNull()
  })
})

vi.setConfig({ testTimeout: 120_000 })
