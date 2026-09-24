import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Author, Category, Post, Tag } from '@/payload-types'
import { seed } from '@/seed'
import { loadAuthorPage, loadSiteChrome, loadStaticPage, loadTagPage } from '@/site/data'
import { setRevalidator } from '@/site/revalidate'
import { loadSearchResults } from '@/site/search'
import { normalizeSearchText } from '@/site/search-normalize'

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
 * M1-07: qidiruv (Postgres FTS + pg_trgm, lotin ↔ kirill, `oʻ`/`o'`), teg/muallif/statik sahifa
 * ma'lumotlari, ildiz slug to'qnashuvi va kesh teglari.
 */
let payload: Payload
let users: TestUsers
let category: Category
let tag: Tag
let author: Author
const revalidated: string[] = []

/** Boshqa kontent bilan aralashmaydigan so'z (faqat harflar — normallashtirishdan o'zgarmay o'tadi). */
const token = `zumrad${Math.random()
  .toString(36)
  .replace(/[^a-z]/g, '')
  .slice(0, 6)}q`

function paragraph(text: string) {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          direction: 'ltr',
          textFormat: 0,
          children: [
            { type: 'text', text, format: 0, style: '', mode: 'normal', detail: 0, version: 1 },
          ],
        },
      ],
    },
  }
}

async function publishedPost(data: Partial<Post> & { title: string }): Promise<Post> {
  const editor = as(users.editor)
  const post = await payload.create({
    collection: 'posts',
    data: { slug: testSlug('search'), category: category.id, workflowStatus: 'draft', ...data },
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

/** Payload ValidationError: 400, `slug` maydoni xabari `text` ni o'z ichiga oladi. */
const slugError = (text: string) => ({
  status: 400,
  data: {
    errors: [expect.objectContaining({ path: 'slug', message: expect.stringContaining(text) })],
  },
})

async function searchIds(locale: 'uz-Latn' | 'uz-Cyrl', query: string) {
  const results = await loadSearchResults(locale, query, 1)
  return results.posts.map((post) => post.id)
}

let latin: Post
let cyrillicOnly: Post
let bodyOnly: Post
let draft: Post
let archived: Post

describe('qidiruv va M1-07 sahifalar ma’lumotlari', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await ensureBucket(createTestS3Client())
    await seed(payload)
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    tag = await payload.create({
      collection: 'tags',
      data: { name: `Teg ${token}`, slug: testSlug('tag') },
    })
    author = await payload.create({
      collection: 'authors',
      data: {
        name: `Muallif ${token}`,
        slug: testSlug('author'),
        position: 'Muharrir',
        socials: [{ platform: 'telegram', url: 'https://t.me/blogodya' }],
      },
    })

    latin = await publishedPost({
      title: `Oʻzbekistonda ${token} texnologiyasi gʻalaba qozondi`,
      excerpt: 'Sunʼiy intellekt haqida lid',
      tags: [tag.id],
      authors: [author.id],
    })
    // Faqat kirill sarlavhada uchraydigan so'zlar (lotin qatorida yo'q).
    cyrillicOnly = await publishedPost({ title: `Test ${token} sarlavha` })
    await payload.update({
      collection: 'posts',
      id: cyrillicOnly.id,
      locale: 'uz-Cyrl',
      data: { title: `Шахмат чемпионати ${token}` },
    })
    bodyOnly = await publishedPost({
      title: 'Matnda qidiriladigan maqola',
      content: paragraph(`Maqola matni ichida ${token}matn kalit soʻzi bor.`) as never,
    })
    draft = await payload.create({
      collection: 'posts',
      data: {
        title: `Qoralama ${token} texnologiyasi`,
        slug: testSlug('draft'),
        category: category.id,
        workflowStatus: 'draft',
      },
      ...as(users.editor),
    })
    archived = await publishedPost({ title: `Arxiv ${token} texnologiyasi` })
    await payload.update({
      collection: 'posts',
      id: archived.id,
      data: { workflowStatus: 'archived' },
      ...as(users.admin),
    })
    setRevalidator((value) => revalidated.push(value))
  })

  afterAll(async () => {
    setRevalidator(null)
    if (payload) {
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
      await payload.db?.destroy?.()
    }
  })

  describe('qidiruv', () => {
    it('SQL `oblog_search_normalize` va TS `normalizeSearchText` bir xil', async () => {
      const samples = [
        'Oʻzbekiston',
        "O'zbekiston O‘zbekiston O’zbekiston O`zbekiston",
        'ЎЗБЕКИСТОН ўзбекистон Ғалаба Ҳокимият',
        'Сунъий интеллект, чемпионат! Европа ёшлар юлдуз цирк щука',
        'iPhone 18 Pro — «Major» 2026',
        'Yevropa gʻalaba sunʼiy',
      ]
      for (const sample of samples) {
        const { rows } = await payload.db.drizzle.execute(
          sql`SELECT oblog_search_normalize(${sample}) AS normalized`,
        )
        expect((rows[0] as { normalized: string }).normalized, sample).toBe(
          normalizeSearchText(sample),
        )
      }
    })

    it.each([
      ['uz-Latn', `oʻzbekistonda ${token}`],
      ['uz-Latn', `o'zbekistonda ${token}`],
      ['uz-Latn', `o‘zbekistonda ${token}`],
      ['uz-Latn', `ozbekistonda ${token}`],
      ['uz-Latn', `${token} galaba`],
      // Kirill so'rov → lotin maqola
      ['uz-Cyrl', `ўзбекистонда ${token}`],
      ['uz-Cyrl', `${token} ғалаба`],
      // Prefiks (so'z boshi)
      ['uz-Latn', `texnolog ${token}`],
    ] as const)('%s: %j → lotin maqola topiladi', async (locale, query) => {
      expect(await searchIds(locale, query)).toContain(latin.id)
    })

    it('lotin so‘rov kirill sarlavhali maqolani topadi, natija joriy yozuvda', async () => {
      expect(await searchIds('uz-Latn', `shaxmat chempionati ${token}`)).toContain(cyrillicOnly.id)
      const cyrl = await loadSearchResults('uz-Cyrl', `шахмат ${token}`, 1)
      const found = cyrl.posts.find((post) => post.id === cyrillicOnly.id)
      expect(found?.title).toBe(`Шахмат чемпионати ${token}`)
      expect(found?.href).toMatch(/^\/kr\//)
    })

    it('matn (Lexical) ichidagi so‘z bo‘yicha', async () => {
      expect(await searchIds('uz-Latn', `${token}matn`)).toContain(bodyOnly.id)
    })

    it('xato yozilgan so‘z (pg_trgm) ham topiladi', async () => {
      expect(await searchIds('uz-Latn', `${token} texnalogiyasi`)).toContain(latin.id)
    })

    it('qoralama va arxivlangan postlar natijada yo‘q', async () => {
      const ids = await searchIds('uz-Latn', `${token} texnologiyasi`)
      expect(ids).toContain(latin.id)
      expect(ids).not.toContain(draft.id)
      expect(ids).not.toContain(archived.id)
    })

    it('bo‘sh / juda qisqa / topilmaydigan so‘rov', async () => {
      expect((await loadSearchResults('uz-Latn', 'a', 1)).totalDocs).toBe(0)
      expect((await loadSearchResults('uz-Latn', "'", 1)).posts).toEqual([])
      expect(
        (await loadSearchResults('uz-Latn', `${token}yoqsozxyzabc qwrtplk`, 1)).totalDocs,
      ).toBe(0)
    })

    it('sahifalash: totalDocs va sahifalar', async () => {
      const results = await loadSearchResults('uz-Latn', token, 1)
      expect(results.totalDocs).toBeGreaterThanOrEqual(3)
      expect(results.totalPages).toBe(Math.max(1, Math.ceil(results.totalDocs / 10)))
      expect((await loadSearchResults('uz-Latn', token, 2)).posts).toEqual([])
    })
  })

  describe('teg, muallif, statik sahifa', () => {
    it('teg sahifasi: postlar, soni (noindex uchun), kirill URL', async () => {
      const data = await loadTagPage('uz-Cyrl', tag.slug, 1)
      expect(data?.tag.name).toBe(`Teg ${token}`)
      expect(data?.totalDocs).toBe(1)
      expect(data?.posts.map((post) => post.id)).toEqual([latin.id])
      expect(data?.posts[0]?.href).toMatch(/^\/kr\//)
      expect(await loadTagPage('uz-Latn', tag.slug, 2)).toBeNull()
      expect(await loadTagPage('uz-Latn', `${tag.slug}-yoq`, 1)).toBeNull()
    })

    it('muallif sahifasi: profil va maqolalar', async () => {
      const data = await loadAuthorPage('uz-Latn', author.slug, 1)
      expect(data?.author).toMatchObject({
        name: `Muallif ${token}`,
        position: 'Muharrir',
        socials: [{ platform: 'telegram', url: 'https://t.me/blogodya' }],
      })
      expect(data?.posts.map((post) => post.id)).toEqual([latin.id])
    })

    it('statik sahifa: faqat chop etilgani; seed huquqiy sahifalar ochiladi', async () => {
      expect((await loadStaticPage('uz-Cyrl', 'biz-haqimizda'))?.slug).toBe('biz-haqimizda')
      const draftPage = await payload.create({
        collection: 'pages',
        data: { title: 'Qoralama sahifa', slug: testSlug('page'), _status: 'draft' },
      })
      expect(await loadStaticPage('uz-Latn', draftPage.slug)).toBeNull()
    })

    it('karkas: footer ustunlari va mualliflik qatori `footer` global’idan', async () => {
      const chrome = await loadSiteChrome('uz-Cyrl')
      expect(chrome.footerColumns.length).toBeGreaterThanOrEqual(2)
      expect(chrome.footerColumns[0]?.title).toBe('Категориялар')
      expect(chrome.footerColumns[1]?.links.some((link) => link.href === '/kr/aloqa')).toBe(true)
      expect(chrome.copyright).toBe('© Odya LLC')
    })
  })

  describe('ildiz slug to‘qnashuvi (kategoriya ↔ sahifa, band marshrutlar)', () => {
    it('sahifa slug’i mavjud kategoriya bilan bir xil bo‘lsa — rad etiladi', async () => {
      await expect(
        payload.create({
          collection: 'pages',
          data: { title: 'Toʻqnashuv', slug: category.slug, _status: 'published' },
        }),
      ).rejects.toMatchObject(slugError('kategoriya'))
    })

    it('kategoriya slug’i mavjud sahifa bilan bir xil bo‘lsa — rad etiladi', async () => {
      await expect(
        payload.create({ collection: 'categories', data: { name: 'Aloqa', slug: 'aloqa' } }),
      ).rejects.toMatchObject(slugError('statik sahifa'))
    })

    it.each(['kr', 'tag', 'author', 'search', 'bot', 'page'])(
      'band slug: %s — sahifa ham, kategoriya ham yaratilmaydi',
      async (slug) => {
        await expect(
          payload.create({ collection: 'pages', data: { title: slug, slug } }),
        ).rejects.toMatchObject(slugError('band'))
        await expect(
          payload.create({ collection: 'categories', data: { name: slug, slug } }),
        ).rejects.toMatchObject(slugError('band'))
      },
    )

    it('o‘z slug’ini saqlash (yangilash) — to‘qnashuv emas', async () => {
      const updated = await payload.update({
        collection: 'categories',
        id: category.id,
        data: { name: 'Test kategoriya (yangi nom)' },
      })
      expect(updated.slug).toBe(category.slug)
    })
  })

  describe('kesh teglari', () => {
    it('teg / muallif / sahifa o‘zgarsa — o‘z tegi yangilanadi', async () => {
      revalidated.length = 0
      await payload.update({ collection: 'tags', id: tag.id, data: { description: 'Tavsif' } })
      await payload.update({ collection: 'authors', id: author.id, data: { bio: 'Bio' } })
      const page = await payload.create({
        collection: 'pages',
        data: { title: 'Kesh sahifasi', slug: testSlug('cache'), _status: 'published' },
      })
      expect(revalidated).toEqual(
        expect.arrayContaining([
          `tag:${tag.slug}`,
          `author:${author.slug}`,
          `page:${page.slug}`,
          'pages',
          'nav',
        ]),
      )
    })
  })
})
