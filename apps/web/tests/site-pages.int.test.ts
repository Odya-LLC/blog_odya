import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Category, Post } from '@/payload-types'
import { seed } from '@/seed'
import { SEED_AUTHOR, SEED_POSTS } from '@/seed/data'
import {
  loadAuthorPage,
  loadSearchResults,
  loadSiteChrome,
  loadStaticPage,
  loadTagPage,
} from '@/site/data'
import { setRevalidator } from '@/site/revalidate'
import { normalizeSearchText, parseSearchQuery, type SearchQuery } from '@/site/search/normalize'
import { searchPostIds } from '@/site/search/query'

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
 * M1-07: teg, muallif, statik sahifa ma'lumotlari, slug to'qnashuvlari va Postgres FTS qidiruvi
 * (lotin + kirill, `oʻ`/`o'` variantlari, pg_trgm). Migratsiya `*_m1_07_search` shu yerda
 * `initTestPayload` orqali qo'llanadi.
 */
let payload: Payload
let users: TestUsers
let category: Category

const esports = SEED_POSTS.find((post) => post.category === 'kibersport')!
const featured = SEED_POSTS.find((post) => post.isFeatured)!

/** Lotin harflari (kirillda bir harfli mosi bor) — testlar uchun noyob so'z. */
const LAT = 'abvgdziklmnoprstuf'
const CYR = 'абвгдзиклмнопрстуф'

function uniqueWord(): { latin: string; cyrillic: string } {
  let latin = ''
  let cyrillic = ''
  for (let i = 0; i < 9; i++) {
    const index = Math.floor(Math.random() * LAT.length)
    latin += LAT[index]
    cyrillic += CYR[index]
  }
  return { latin: `q${latin}`, cyrillic: `қ${cyrillic}` }
}

async function publishedTestPost(data: Partial<Post> & { title: string }): Promise<Post> {
  const editor = as(users.editor)
  const post = await payload.create({
    collection: 'posts',
    data: { slug: testSlug('search'), category: category.id, workflowStatus: 'draft', ...data },
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

function lexical(text: string) {
  return {
    root: {
      type: 'root',
      direction: null,
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          direction: null,
          format: '',
          indent: 0,
          version: 1,
          textFormat: 0,
          children: [
            { type: 'text', text, detail: 0, format: 0, mode: 'normal', style: '', version: 1 },
          ],
        },
      ],
    },
  } as never
}

/** Payload `ValidationError` → `slug` maydoni xabari (yaratish muvaffaqiyatli bo'lsa — `null`). */
async function slugError(create: () => Promise<unknown>): Promise<string | null> {
  try {
    await create()
    return null
  } catch (error) {
    const errors = (error as { data?: { errors?: Array<{ path?: string; message?: string }> } })
      .data?.errors
    return errors?.find((item) => item.path === 'slug')?.message ?? String(error)
  }
}

async function search(raw: string): Promise<number[]> {
  const query = parseSearchQuery(raw) as SearchQuery
  expect(query, raw).not.toBeNull()
  return (await searchPostIds(payload, query, { limit: 50, offset: 0 })).ids
}

describe('M1-07: qo‘shimcha sahifalar va qidiruv', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await ensureBucket(createTestS3Client())
    await seed(payload)
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    setRevalidator(() => {})
  })

  afterAll(async () => {
    setRevalidator(null)
    if (payload) {
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
      await payload.db?.destroy?.()
    }
  })

  describe('teg, muallif, statik sahifa', () => {
    it('teg: postlar, jami soni (noindex qoidasi uchun), kirill URL; yo‘q teg/sahifa — null', async () => {
      const latn = await loadTagPage('uz-Latn', 'cs2', 1)
      expect(latn?.tag).toMatchObject({ slug: 'cs2', name: 'CS2', href: '/tag/cs2' })
      expect(latn?.posts.map((post) => post.href)).toContain(`/${esports.category}/${esports.slug}`)
      expect(latn?.totalDocs).toBeGreaterThanOrEqual(1)
      const cyrl = await loadTagPage('uz-Cyrl', 'cs2', 1)
      expect(cyrl?.tag.href).toBe('/kr/tag/cs2')
      expect(cyrl?.posts[0]?.title).toBe(esports.title['uz-Cyrl'])
      expect(cyrl?.posts[0]?.href).toBe(`/kr/${esports.category}/${esports.slug}`)
      expect(await loadTagPage('uz-Latn', 'bunday-teg-yoq', 1)).toBeNull()
      expect(await loadTagPage('uz-Latn', 'cs2', 2)).toBeNull()
    })

    it('muallif: profil (kirillda), maqolalari', async () => {
      const author = await loadAuthorPage('uz-Cyrl', SEED_AUTHOR.slug, 1)
      expect(author?.author).toMatchObject({
        slug: SEED_AUTHOR.slug,
        name: SEED_AUTHOR.name['uz-Cyrl'],
        position: SEED_AUTHOR.position['uz-Cyrl'],
        href: `/kr/author/${SEED_AUTHOR.slug}`,
      })
      expect(author?.totalDocs).toBeGreaterThanOrEqual(SEED_POSTS.length)
      expect(author?.posts.every((post) => post.href.startsWith('/kr/'))).toBe(true)
      expect(await loadAuthorPage('uz-Latn', 'bunday-muallif-yoq', 1)).toBeNull()
    })

    it('statik sahifa: chop etilgani ikkala yozuvda (kirill — lotin fallback); qoralama — yo‘q', async () => {
      const latn = await loadStaticPage('uz-Latn', 'aloqa')
      expect(latn?.slug).toBe('aloqa')
      expect(latn?.layout?.[0]?.blockType).toBe('content')
      const cyrl = await loadStaticPage('uz-Cyrl', 'aloqa')
      expect(cyrl?.title).toBeTruthy()
      expect(cyrl?.layout?.length).toBeGreaterThan(0)

      const draft = await payload.create({
        collection: 'pages',
        data: { title: 'Qoralama sahifa', slug: testSlug('page'), _status: 'draft' },
        draft: true,
      })
      expect(await loadStaticPage('uz-Latn', draft.slug)).toBeNull()
    })

    it('karkas: header va footer global menyulari', async () => {
      const chrome = await loadSiteChrome('uz-Cyrl')
      expect(chrome.footerColumns).toHaveLength(2)
      expect(chrome.footerColumns[0]?.title).toBe('Категориялар')
      expect(chrome.footerColumns[1]?.links.map((link) => link.href)).toContain('/kr/aloqa')
      expect(chrome.copyright).toBe('© Odya LLC')
    })
  })

  describe('slug to‘qnashuvlari (TZ §8.1)', () => {
    it('sahifa slug’i kategoriya slug’i bilan bir xil bo‘lolmaydi', async () => {
      const message = await slugError(() =>
        payload.create({
          collection: 'pages',
          data: { title: 'Kibersport', slug: 'kibersport', _status: 'published' },
        }),
      )
      expect(message).toMatch(/kategoriya/)
    })

    it('kategoriya slug’i sahifa slug’i bilan bir xil bo‘lolmaydi', async () => {
      const message = await slugError(() =>
        payload.create({ collection: 'categories', data: { name: 'Aloqa', slug: 'aloqa' } }),
      )
      expect(message).toMatch(/sahifa/)
    })

    it('mavjud hujjatni o‘z slug’i bilan saqlash — xato emas', async () => {
      const { docs } = await payload.find({
        collection: 'pages',
        where: { slug: { equals: 'aloqa' } },
        limit: 1,
      })
      const page = docs[0]!
      await expect(
        payload.update({ collection: 'pages', id: page.id, data: { slug: 'aloqa' } }),
      ).resolves.toMatchObject({ slug: 'aloqa' })
    })

    it.each(['kr', 'tag', 'author', 'search', 'bot', 'og', 'feeds'])(
      'band so‘z: %s (kategoriya va sahifa)',
      async (slug) => {
        expect(
          await slugError(() =>
            payload.create({ collection: 'categories', data: { name: slug, slug } }),
          ),
        ).toMatch(/band/)
        expect(
          await slugError(() =>
            payload.create({ collection: 'pages', data: { title: slug, slug, _status: 'draft' } }),
          ),
        ).toMatch(/band/)
      },
    )

    it('teg slug’i uchun marshrut nomlari cheklanmaydi (/tag/search — to‘qnashuv yo‘q)', async () => {
      const tag = await payload.create({
        collection: 'tags',
        data: { name: 'Search', slug: testSlug('search') },
      })
      expect(tag.slug).toContain('search')
    })
  })

  describe('qidiruv (Postgres FTS)', () => {
    it('SQL odya_search_normalize() = JS normalizeSearchText()', async () => {
      const samples = [
        "Oʻzbekiston O'zbek o‘zbek o’zbek o`zbek",
        'Ўзбекистон Сунъий интеллект ҒАЛАБА ҳафта қидирув',
        'Шахмат чемпионати, Ёшлар, юлдуз, янгилик, центр, Эълон, компьютер',
        'Yetakchi етакчи — CS2: Major!! iPhone 17 Pro',
        "gʻ g' g‘ g’ ʼ ´ ʹ ′",
        'ЎЗБЕКИСТОН ҚИДИРУВ ЁШЛАР ЦЕНТР ЭЪЛОН',
      ]
      const drizzle = (
        payload.db as unknown as {
          drizzle: {
            execute: (q: unknown) => Promise<{ rows: Array<{ value: string; c: string }> }>
          }
        }
      ).drizzle
      for (const sample of samples) {
        // `C` collation: `lower()` faqat ASCII — kirill bosh harflari baribir kichraytirilishi kerak.
        const { rows } = await drizzle.execute(
          sql`SELECT odya_search_normalize(${sample}) AS value,
            odya_search_normalize(${sample}::text COLLATE "C") AS c`,
        )
        expect(rows[0]?.value, sample).toBe(normalizeSearchText(sample))
        expect(rows[0]?.c, `${sample} (C)`).toBe(normalizeSearchText(sample))
      }
    })

    it("oʻ/o’/o‘/o`/o' va gʻ/g' variantlari, kirill so‘rov — bitta post topiladi", async () => {
      const word = uniqueWord()
      const post = await publishedTestPost({
        title: `Oʻzbekiston gʻalabasi ${word.latin}`,
        excerpt: 'Sunʼiy intellekt boʻyicha test',
        content: lexical('Shaxmatchilar turniri haqida batafsil matn.'),
      })
      for (const query of [
        `Oʻzbekiston ${word.latin}`,
        `O'zbekiston ${word.latin}`,
        `O‘zbekiston ${word.latin}`,
        `O’zbekiston ${word.latin}`,
        `O\`zbekiston ${word.latin}`,
        `ozbekiston ${word.latin}`,
        `g'alabasi ${word.latin}`,
        `Ўзбекистон ғалабаси ${word.cyrillic}`,
        `${word.cyrillic}`,
        // Prefiks: so'z boshi yetarli.
        `ozbek ${word.latin.slice(0, 6)}`,
      ]) {
        expect(await search(query), query).toContain(post.id)
      }
      // Lid va matn bo'yicha (kirill so'rov → lotin matn).
      expect(await search(`сунъий ${word.cyrillic}`)).toContain(post.id)
      expect(await search(`шахматчилар ${word.cyrillic}`)).toContain(post.id)
      // Boshqa so'z qo'shilsa (AND) — topilmaydi.
      expect(await search(`${word.latin} mavjudemasso`)).not.toContain(post.id)
    })

    it('kirill matn (uz-Cyrl qatori) lotin so‘rov bilan ham topiladi', async () => {
      const word = uniqueWord()
      const post = await publishedTestPost({ title: `Lotin sarlavha ${word.latin}` })
      await payload.update({
        collection: 'posts',
        id: post.id,
        locale: 'uz-Cyrl',
        data: { title: `Янгилик ҳақида ${word.cyrillic}` },
        ...as(users.editor),
      })
      expect(await search(`yangilik haqida ${word.latin}`)).toContain(post.id)
      expect(await search(`янгилик ${word.cyrillic}`)).toContain(post.id)
    })

    it('demo post: kirill so‘rov "сунъий интеллект" (lotin + kirill kartochka)', async () => {
      const query = parseSearchQuery('сунъий интеллект янгиликлари')!
      const results = await loadSearchResults('uz-Cyrl', query, 1)
      const hit = results.posts.find((post) => post.title === featured.title['uz-Cyrl'])
      expect(hit?.href).toBe(`/kr/${featured.category}/${featured.slug}`)
      expect(results.total).toBeGreaterThanOrEqual(1)
      const latn = await loadSearchResults('uz-Latn', parseSearchQuery('sunʼiy intellekt')!, 1)
      expect(latn.posts.map((post) => post.title)).toContain(featured.title['uz-Latn'])
    })

    it('xato yozilgan so‘z (pg_trgm) sarlavhada topiladi', async () => {
      const word = uniqueWord()
      const post = await publishedTestPost({ title: `Kiberxavfsizlik ${word.latin}` })
      // Bitta harf tushib qolgan noyob so'z — FTS (prefiks) topmaydi, trigram topadi.
      const typo = `${word.latin.slice(0, 5)}${word.latin.slice(6)}`
      expect(await search(typo)).toContain(post.id)
    })

    it('qoralama va arxivlangan postlar topilmaydi', async () => {
      const word = uniqueWord()
      const draft = await payload.create({
        collection: 'posts',
        data: {
          title: `Qoralama ${word.latin}`,
          slug: testSlug('search-draft'),
          category: category.id,
          workflowStatus: 'draft',
        },
      })
      const archived = await publishedTestPost({ title: `Arxiv ${word.latin}` })
      expect(await search(word.latin)).toEqual([archived.id])
      await payload.update({
        collection: 'posts',
        id: archived.id,
        data: { _status: 'published', workflowStatus: 'archived' },
        ...as(users.admin),
      })
      const ids = await search(word.latin)
      expect(ids).not.toContain(draft.id)
      expect(ids).not.toContain(archived.id)
    })

    it('sahifalash va SQL injection xavfsizligi', async () => {
      const word = uniqueWord()
      const posts: Post[] = []
      for (let i = 0; i < 3; i++) {
        posts.push(await publishedTestPost({ title: `Sahifalash ${i} ${word.latin}` }))
      }
      const query = parseSearchQuery(word.latin)!
      const first = await searchPostIds(payload, query, { limit: 2, offset: 0 })
      const second = await searchPostIds(payload, query, { limit: 2, offset: 2 })
      expect(first.total).toBe(3)
      expect(first.ids).toHaveLength(2)
      expect(second.ids).toHaveLength(1)
      expect(new Set([...first.ids, ...second.ids])).toEqual(new Set(posts.map((p) => p.id)))

      const evil = parseSearchQuery("'); DROP TABLE posts; -- & | ! :*")!
      await expect(loadSearchResults('uz-Latn', evil, 1)).resolves.toMatchObject({ page: 1 })
      const { totalDocs } = await payload.count({ collection: 'posts' })
      expect(totalDocs).toBeGreaterThan(0)
    })
  })
})
