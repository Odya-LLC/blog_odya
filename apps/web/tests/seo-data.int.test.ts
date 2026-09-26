import { sql } from '@payloadcms/db-postgres'
import { XMLValidator } from 'fast-xml-parser'
import { createLocalReq, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { up as backfillMetaImage } from '@/migrations/20260926_164339_oblog_47_meta_image_backfill'
import type { Category, Media, Post } from '@/payload-types'
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
import { mediaOgImage } from '@/site/seo/metadata'
import { articleImages } from '@/site/seo/pages'
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
const mediaIds: number[] = []

async function createMedia(alt: string): Promise<Media> {
  const png = await sharp({
    create: { width: 1200, height: 630, channels: 3, background: { r: 30, g: 90, b: 200 } },
  })
    .png()
    .toBuffer()
  const doc = await payload.create({
    collection: 'media',
    locale: 'uz-Latn',
    data: { alt },
    file: {
      data: png,
      mimetype: 'image/png',
      name: `seo-meta-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
      size: png.length,
    },
  })
  mediaIds.push(doc.id)
  return doc
}

type Id = number | string | null | undefined
const idOf = (value: unknown): Id =>
  typeof value === 'object' && value !== null ? (value as { id: Id }).id : (value as Id)

/** `meta.image` ID'lari har bir locale'da (fallback'siz; `draft` — oxirgi versiya). */
async function metaImages(id: number, draft = true): Promise<Record<string, Id>> {
  const out: Record<string, Id> = {}
  for (const locale of ['uz-Latn', 'uz-Cyrl'] as const) {
    const doc = await payload.findByID({
      collection: 'posts',
      id,
      locale,
      fallbackLocale: false,
      draft,
      depth: 0,
    })
    out[locale] = idOf(doc.meta?.image) ?? null
  }
  return out
}

const both = (id: number | null) => ({ 'uz-Latn': id, 'uz-Cyrl': id })

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
      for (const id of mediaIds) await payload.delete({ collection: 'media', id }).catch(() => {})
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

  it('meta.image ← coverImage: ikkala locale, qo‘lda tanlangan SEO rasmi saqlanadi', async () => {
    const editor = as(users.editor)
    const [cover1, cover2, cover3, manual] = await Promise.all([
      createMedia('Birinchi muqova rasmi'),
      createMedia('Ikkinchi muqova rasmi'),
      createMedia('Uchinchi muqova rasmi'),
      createMedia('Qo‘lda tanlangan SEO rasmi'),
    ])

    // Yaratishda muqova — meta.image ikkala locale'da.
    const created = await payload.create({
      collection: 'posts',
      data: {
        title: 'SEO rasm test',
        slug: testSlug('seo-image'),
        category: category.id,
        workflowStatus: 'draft',
        coverImage: cover1.id,
      },
      ...editor,
    })
    expect(await metaImages(created.id)).toEqual(both(cover1.id))

    // Muqovasiz post → keyin faqat coverImage (MCP set_cover kabi, qoralama saqlash).
    const bare = await payload.create({
      collection: 'posts',
      data: {
        title: 'SEO rasm test 2',
        slug: testSlug('seo-image'),
        category: category.id,
        workflowStatus: 'draft',
        meta: { title: 'SEO sarlavha', description: 'SEO tavsif' },
      },
      ...editor,
    })
    expect(await metaImages(bare.id)).toEqual(both(null))
    await payload.update({
      collection: 'posts',
      id: bare.id,
      data: { coverImage: cover1.id },
      draft: true,
      ...editor,
    })
    expect(await metaImages(bare.id)).toEqual(both(cover1.id))
    const bareDoc = await payload.findByID({
      collection: 'posts',
      id: bare.id,
      draft: true,
      depth: 0,
    })
    expect(bareDoc.meta).toMatchObject({ title: 'SEO sarlavha', description: 'SEO tavsif' })

    // Muqova almashsa — oldin muqovaga teng bo'lgan meta.image ham (uz-Cyrl'da saqlansa ham).
    await payload.update({
      collection: 'posts',
      id: created.id,
      locale: 'uz-Cyrl',
      data: { coverImage: cover2.id },
      ...editor,
    })
    expect(await metaImages(created.id)).toEqual(both(cover2.id))

    // Lotin'da qo'lda tanlangan SEO rasmi: keyingi saqlashlar va muqova almashishi unga tegmaydi.
    await payload.update({
      collection: 'posts',
      id: created.id,
      locale: 'uz-Latn',
      data: { meta: { image: manual.id } },
      ...editor,
    })
    await payload.update({
      collection: 'posts',
      id: created.id,
      data: { title: 'SEO rasm test (yangi)' },
      ...editor,
    })
    expect(await metaImages(created.id)).toEqual({ 'uz-Latn': manual.id, 'uz-Cyrl': cover2.id })
    await payload.update({
      collection: 'posts',
      id: created.id,
      data: { coverImage: cover3.id },
      ...editor,
    })
    expect(await metaImages(created.id)).toEqual({ 'uz-Latn': manual.id, 'uz-Cyrl': cover3.id })

    // Muqova olib tashlansa — unga teng meta.image ham tozalanadi, qo'lda tanlangani qoladi.
    await payload.update({
      collection: 'posts',
      id: created.id,
      data: { coverImage: null },
      ...editor,
    })
    expect(await metaImages(created.id)).toEqual({ 'uz-Latn': manual.id, 'uz-Cyrl': null })
  })

  it('og:image o‘zgarmaydi: meta.image = muqova bo‘lganda ham muqovadan', async () => {
    const cover = await createMedia('OG muqova rasmi')
    const published = await publishedTestPost('SEO og test', { coverImage: cover.id })
    expect(idOf(published.meta?.image)).toBe(cover.id)
    for (const locale of ['uz-Latn', 'uz-Cyrl'] as const) {
      const post = await payload.findByID({
        collection: 'posts',
        id: published.id,
        locale,
        depth: 1,
      })
      const withMeta = articleImages(locale, post, 'https://x.uz')
      const withoutMeta = articleImages(
        locale,
        { ...post, meta: { ...post.meta, image: null } },
        'https://x.uz',
      )
      expect(withMeta).toEqual(withoutMeta)
      expect(withMeta.og.url).toBe(mediaOgImage(post.coverImage as Media, 'https://x.uz')?.url)
    }
  })

  it('backfill migratsiyasi: bo‘sh meta.image ← muqova, barcha locale va oxirgi versiya', async () => {
    const [cover, manual] = await Promise.all([
      createMedia('Backfill muqova rasmi'),
      createMedia('Backfill qo‘lda SEO rasmi'),
    ])
    const legacy = await publishedTestPost('SEO backfill test', { coverImage: cover.id })
    const custom = await publishedTestPost('SEO backfill test 2', {
      coverImage: cover.id,
      meta: { image: manual.id },
    } as Partial<Post>)
    // Hook'dan oldingi holat: meta.image bo'sh; kirill qatori umuman yo'q.
    const db = payload.db.drizzle
    const versions = sql`SELECT "id" FROM "_posts_v" WHERE "parent_id" = ${legacy.id}`
    for (const statement of [
      sql`UPDATE "posts_locales" SET "meta_image_id" = NULL WHERE "_parent_id" = ${legacy.id}`,
      sql`UPDATE "_posts_v_locales" SET "version_meta_image_id" = NULL WHERE "_parent_id" IN (${versions})`,
      sql`DELETE FROM "posts_locales" WHERE "_parent_id" = ${legacy.id} AND "_locale" = 'uz-Cyrl'`,
      sql`DELETE FROM "_posts_v_locales" WHERE "_locale" = 'uz-Cyrl' AND "_parent_id" IN (${versions})`,
    ]) {
      await db.execute(statement)
    }
    expect(await metaImages(legacy.id, false)).toEqual(both(null))
    expect(await metaImages(legacy.id, true)).toEqual(both(null))

    const req = await createLocalReq({}, payload)
    await backfillMetaImage({ db, payload, req } as Parameters<typeof backfillMetaImage>[0])
    // Idempotent.
    await backfillMetaImage({ db, payload, req } as Parameters<typeof backfillMetaImage>[0])

    expect(await metaImages(legacy.id, false)).toEqual(both(cover.id))
    expect(await metaImages(legacy.id, true)).toEqual(both(cover.id))
    const latin = await payload.findByID({ collection: 'posts', id: legacy.id, depth: 0 })
    expect(latin.title).toBe('SEO backfill test')
    // Qo'lda tanlangan SEO rasmi (lotin) — tegilmaydi.
    expect((await metaImages(custom.id, false))['uz-Latn']).toBe(manual.id)
  })
})

vi.setConfig({ testTimeout: 120_000 })
