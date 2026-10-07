import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { decodeMediaSrc, encodeMediaSrc } from '@/lib/media-image'
import { recordView } from '@/pageviews/store'
import type { Category, Media, Post } from '@/payload-types'
import { seed } from '@/seed'
import { SEED_POSTS } from '@/seed/data'
import { postTag } from '@/site/cache-tags'
import {
  getCategoryPage,
  getHomeData,
  getPopularData,
  loadArticle,
  loadCategoryPage,
  loadCategoryTopics,
  loadHomeData,
  loadRedirect,
  loadSiteChrome,
} from '@/site/data'
import { setRevalidator } from '@/site/revalidate'

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
 * Ommaviy sayt ma'lumot qatlami (M1-05): Payload Local API, faqat chop etilgan postlar,
 * lotin/kirill, redirect'lar va publish/unpublish'da `revalidateTag` teglari.
 * ISR ma'lumotlari `load*` orqali; bosh/kategoriya `get*`lari ham Next.js Data Cache'siz ishlaydi.
 */
let payload: Payload
let users: TestUsers
let category: Category
const revalidated: string[] = []

const [featured, esports] = SEED_POSTS as [(typeof SEED_POSTS)[0], (typeof SEED_POSTS)[1]]

async function publishedTestPost(title: string, categoryId = category.id): Promise<Post> {
  const editor = as(users.editor)
  const post = await payload.create({
    collection: 'posts',
    data: { title, slug: testSlug('site'), category: categoryId, workflowStatus: 'draft' },
    ...editor,
  })
  await payload.update({
    collection: 'posts',
    id: post.id,
    data: { workflowStatus: 'in_progress' },
    ...editor,
  })
  await payload.update({
    collection: 'posts',
    id: post.id,
    data: { workflowStatus: 'review' },
    ...editor,
  })
  return payload.update({
    collection: 'posts',
    id: post.id,
    data: { _status: 'published' },
    ...editor,
  })
}

describe('sayt ma’lumotlari (Local API)', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await ensureBucket(createTestS3Client())
    await seed(payload)
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    setRevalidator((tag) => revalidated.push(tag))
  })

  afterAll(async () => {
    setRevalidator(null)
    if (payload) {
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
      await payload.db?.destroy?.()
    }
  })

  it('bosh sahifa: birinchi — eng so‘nggi yangilik, kirillda, /kr URL bilan (OBLOG-68)', async () => {
    const home = await loadHomeData('uz-Cyrl')
    const listed = [home.lead!, ...home.top, ...home.feed]
    expect(home.lead).not.toBeNull()
    expect(listed.length).toBeGreaterThanOrEqual(SEED_POSTS.length)
    const times = listed.map((post) => Date.parse(post.publishedAt))
    expect(times).toEqual([...times].sort((a, b) => b - a))
    const seeded = listed.find((post) => post.title === featured.title['uz-Cyrl'])
    expect(seeded?.href).toBe(`/kr/${featured.category}/${featured.slug}`)
    // Yuqori blokdagi postlar kategoriya bo'limlarida takrorlanmaydi.
    const topIds = new Set([home.lead!.id, ...home.top.map((post) => post.id)])
    for (const section of home.sections) {
      expect(section.posts.some((post) => topIds.has(post.id))).toBe(false)
    }
  })

  it('karkas: menyu kategoriyalari va footer havolalari joriy yozuvda', async () => {
    const chrome = await loadSiteChrome('uz-Cyrl')
    expect(chrome.categories.find((c) => c.slug === 'kibersport')).toMatchObject({
      name: 'Киберспорт',
      href: '/kr/kibersport',
      isInMenu: true,
    })
    expect(chrome.categories.find((c) => c.slug === 'ilm-fan')?.isInMenu).toBe(false)
    expect(chrome.legalLinks.every((link) => link.href.startsWith('/kr/'))).toBe(true)
  })

  it('kategoriya: postlar ro‘yxati; mavjud bo‘lmagan sahifa/kategoriya — null', async () => {
    const page = await loadCategoryPage('uz-Latn', esports.category, 1)
    expect(page?.category.name).toBe('Kibersport')
    expect(page?.posts.map((post) => post.href)).toContain(`/${esports.category}/${esports.slug}`)
    expect(page?.totalPages).toBe(1)
    expect(await loadCategoryPage('uz-Latn', esports.category, 2)).toBeNull()
    expect(await loadCategoryPage('uz-Latn', 'bunday-kategoriya-yoq', 1)).toBeNull()
  })

  it('maqola: kirill sarlavha, matn (avtomatik kirill sinxron), muqova variantlari, manba', async () => {
    const article = await loadArticle('uz-Cyrl', featured.slug)
    expect(article?.post.title).toBe(featured.title['uz-Cyrl'])
    expect(article?.category.slug).toBe(featured.category)
    // Kirill matn seed'da lotin saqlanganda withCyrlSync orqali yoziladi (TZ §3.6) — fallback emas.
    expect(JSON.stringify(article?.post.content)).toContain('намуна мақола')
    expect(article?.post.sources?.[0]?.url).toBe(featured.source.url)
    // Demo muqova (seed): kirill alt, WebP variantlar → custom loader src.
    const cover = article?.post.coverImage as Media
    expect(cover.alt).toContain('Сунъий')
    const { variants } = decodeMediaSrc(encodeMediaSrc(cover)!)
    expect(variants.map((variant) => variant.width)).toEqual([320, 640, 1280, 1920])
    expect(variants.every((variant) => variant.url.endsWith('.webp'))).toBe(true)
  })

  it('qoralama va arxivlangan postlar ko‘rinmaydi', async () => {
    const draft = await payload.create({
      collection: 'posts',
      data: {
        title: 'Qoralama',
        slug: testSlug('draft'),
        category: category.id,
        workflowStatus: 'draft',
      },
    })
    expect(await loadArticle('uz-Latn', draft.slug)).toBeNull()
  })

  it('keyingi o‘qish publish/arxivlashni darhol ko‘radi: ikkala yozuv, sahifalash va yon panel', async () => {
    const otherCategory = await createTestCategory(payload)
    // Birinchi o'qishlarni isitish. Revalidator yuqorida faqat teglarni yozib oladi:
    // Next.js cache invalidation yoki vaqt o'tishini kutishga tayanmaymiz.
    for (const locale of ['uz-Latn', 'uz-Cyrl'] as const) {
      await getHomeData(locale)
      await getPopularData(locale, { fresh: true })
      expect((await getCategoryPage(locale, category.slug, 1))?.posts).toEqual([])
      expect(await getCategoryPage(locale, category.slug, 2)).toBeNull()
    }
    const posts: Post[] = []
    for (let index = 0; index < 13; index++) {
      posts.push(await publishedTestPost(`Fresh news ${index}`))
    }
    const latest = await publishedTestPost('Sidebar fresh news', otherCategory.id)
    await recordView(payload, latest.id)

    for (const locale of ['uz-Latn', 'uz-Cyrl'] as const) {
      const home = await getHomeData(locale)
      expect(home.lead?.id).toBe(latest.id)
      expect(
        (await getPopularData(locale, { fresh: true })).posts.map((post) => post.id),
      ).toContain(latest.id)
      const first = await getCategoryPage(locale, category.slug, 1)
      const second = await getCategoryPage(locale, category.slug, 2)
      expect(first?.posts).toHaveLength(12)
      expect(first?.totalPages).toBe(2)
      expect(first?.latest[0]?.id).toBe(latest.id)
      expect(second?.posts).toHaveLength(1)
      expect([...first!.posts, ...second!.posts].map((post) => post.id).sort()).toEqual(
        posts.map((post) => post.id).sort(),
      )
      expect(home.sections.find((section) => section.category.slug === category.slug)).toBeDefined()
      expect(
        (await loadCategoryTopics(locale)).find((topic) => topic.slug === category.slug)?.count,
      ).toBe(13)
    }

    await payload.update({
      collection: 'posts',
      id: latest.id,
      data: { _status: 'published', workflowStatus: 'archived' },
      ...as(users.admin),
    })
    for (const locale of ['uz-Latn', 'uz-Cyrl'] as const) {
      expect((await getHomeData(locale)).lead?.id).not.toBe(latest.id)
      expect(
        (await getPopularData(locale, { fresh: true })).posts.map((post) => post.id),
      ).not.toContain(latest.id)
      expect(
        (await getCategoryPage(locale, category.slug, 1))?.latest.map((post) => post.id),
      ).not.toContain(latest.id)
      expect(
        (await loadCategoryTopics(locale)).find((topic) => topic.slug === otherCategory.slug),
      ).toBeUndefined()
    }
  })

  it('publish/arxivlash → revalidateTag; qoralama saqlash — yo‘q', async () => {
    revalidated.length = 0
    const post = await publishedTestPost('Revalidate test')
    expect(revalidated).toEqual(expect.arrayContaining(['posts', 'home', postTag(post.slug)]))
    expect((await loadCategoryPage('uz-Latn', category.slug, 1))?.posts[0]?.title).toBe(
      'Revalidate test',
    )

    // Hech qachon chop etilmagan qoralama (autosave) — kesh tegilmaydi.
    revalidated.length = 0
    const draft = await payload.create({
      collection: 'posts',
      data: {
        title: 'Autosave',
        slug: testSlug('auto'),
        category: category.id,
        workflowStatus: 'draft',
      },
      ...as(users.editor),
    })
    await payload.update({
      collection: 'posts',
      id: draft.id,
      data: { title: 'Autosave 2' },
      draft: true,
      ...as(users.editor),
    })
    expect(revalidated).toEqual([])

    // Arxivlash (published → archived, faqat admin) — sahifadan olib tashlanadi.
    revalidated.length = 0
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { _status: 'published', workflowStatus: 'archived' },
      ...as(users.admin),
    })
    expect(revalidated).toContain(postTag(post.slug))
    expect(await loadArticle('uz-Latn', post.slug)).toBeNull()
  })

  it('redirect: eski URL → maqolaning joriy URL’i', async () => {
    const post = await publishedTestPost('Redirect test')
    const from = `/${category.slug}/${testSlug('eski')}`
    await payload.create({
      collection: 'redirects',
      data: {
        from,
        to: { type: 'reference', reference: { relationTo: 'posts', value: post.id } },
        type: '301',
      },
    })
    expect(await loadRedirect(from)).toEqual({
      to: `/${category.slug}/${post.slug}`,
      permanent: true,
    })
    expect(await loadRedirect('/yoq/yoq')).toBeNull()
    await payload.delete({ collection: 'redirects', where: { from: { equals: from } } })
  })
})

vi.setConfig({ testTimeout: 120_000 })
