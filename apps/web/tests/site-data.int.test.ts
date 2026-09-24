import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { decodeMediaSrc, encodeMediaSrc } from '@/lib/media-image'
import type { Category, Media, Post } from '@/payload-types'
import { seed } from '@/seed'
import { SEED_POSTS } from '@/seed/data'
import { postTag } from '@/site/cache-tags'
import {
  loadArticle,
  loadCategoryPage,
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
 * (`unstable_cache` o'ramlari Next.js ichida ishlaydi — bu yerda `load*` funksiyalari.)
 */
let payload: Payload
let users: TestUsers
let category: Category
const revalidated: string[] = []

const [featured, esports] = SEED_POSTS as [(typeof SEED_POSTS)[0], (typeof SEED_POSTS)[1]]

async function publishedTestPost(title: string): Promise<Post> {
  const editor = as(users.editor)
  const post = await payload.create({
    collection: 'posts',
    data: { title, slug: testSlug('site'), category: category.id, workflowStatus: 'draft' },
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

  it('bosh sahifa: asosiy yangilik (isFeatured) kirillda, /kr URL bilan', async () => {
    const home = await loadHomeData('uz-Cyrl')
    expect(home.main?.title).toBe(featured.title['uz-Cyrl'])
    expect(home.main?.href).toBe(`/kr/${featured.category}/${featured.slug}`)
    expect(home.latest.length).toBeGreaterThanOrEqual(SEED_POSTS.length)
    expect(home.blocks.length).toBeGreaterThan(0)
    expect(home.secondary.some((post) => post.id === home.main?.id)).toBe(false)
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

  it('maqola: kirill sarlavha, matn (lotin fallback), muqova variantlari, manba', async () => {
    const article = await loadArticle('uz-Cyrl', featured.slug)
    expect(article?.post.title).toBe(featured.title['uz-Cyrl'])
    expect(article?.category.slug).toBe(featured.category)
    expect(JSON.stringify(article?.post.content)).toContain('namuna maqola')
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
