/**
 * Integration: media alt/caption, posts va tags kirill sinxronlash (TZ §3.6) — haqiqiy Postgres + S3 (MinIO).
 * Lokal: `docker compose -f infra/docker-compose.dev.yml up -d` va `pnpm migrate`.
 */
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { createLocalReq, type Endpoint, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Category, Media, Post, User } from '@/payload-types'
import {
  CYRL_CONTEXT_DISABLE,
  CYRL_CONTEXT_REGENERATE,
  REGENERATE_CYRL_ENDPOINT,
} from '@/translit/cyrlSync'
import { getGlossary, invalidateTransliteratorCache } from '@/translit/transliterator'

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
let admin: User
let category: Category
const mediaIds: number[] = []
const glossaryIds: number[] = []

async function ensureBucket(): Promise<void> {
  const bucket = process.env.S3_BUCKET ?? 'media'
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  })
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
  } finally {
    client.destroy()
  }
}

async function createMedia(data: { alt: string; caption?: string }): Promise<Media> {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer()
  const doc = await payload.create({
    collection: 'media',
    locale: 'uz-Latn',
    data,
    file: {
      data: png,
      mimetype: 'image/png',
      name: `cyrl-sync-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
      size: png.length,
    },
  })
  mediaIds.push(doc.id)
  return doc
}

const readCyrl = (id: number) =>
  payload.findByID({ collection: 'media', id, locale: 'uz-Cyrl', fallbackLocale: false })
const readLatn = (id: number) =>
  payload.findByID({ collection: 'media', id, locale: 'uz-Latn', fallbackLocale: false })

beforeAll(async () => {
  await ensureBucket()
  payload = await initTestPayload()
  invalidateTransliteratorCache()
  await deleteTestContent(payload)
  await deleteTestUsers(payload)
  users = await createTestUsers(payload)
  admin = users.admin
  category = await createTestCategory(payload)
})

afterAll(async () => {
  if (!payload) return
  for (const id of mediaIds) await payload.delete({ collection: 'media', id }).catch(() => {})
  for (const id of glossaryIds) await payload.delete({ collection: 'glossary', id }).catch(() => {})
  await deleteTestContent(payload)
  await deleteTestUsers(payload)
  invalidateTransliteratorCache()
  await payload?.db?.destroy?.()
})

describe('media: lotin → kirill sinxronlash', () => {
  it('uz-Latn saqlanganda uz-Cyrl avtomatik to‘ladi', async () => {
    const doc = await createMedia({
      alt: 'Oʻzbekiston bayrogʻi',
      caption: 'Toshkent, 1-sentabr. Manba: https://odya.uz',
    })
    const cyrl = await readCyrl(doc.id)
    expect(cyrl.alt).toBe('Ўзбекистон байроғи')
    expect(cyrl.caption).toBe('Тошкент, 1-сентябрь. Манба: https://odya.uz')
    expect(cyrl.cyrlStale).toBe(false)
    // lotin o'zgarmaydi
    expect((await readLatn(doc.id)).alt).toBe('Oʻzbekiston bayrogʻi')
  })

  it('lotin o‘zgarsa kirill qayta generatsiya qilinadi', async () => {
    const doc = await createMedia({ alt: 'Yangi rasm' })
    await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Latn',
      data: { alt: 'Yangilangan rasm', caption: 'Qisqa izoh' },
    })
    const cyrl = await readCyrl(doc.id)
    expect(cyrl.alt).toBe('Янгиланган расм')
    expect(cyrl.caption).toBe('Қисқа изоҳ')
  })

  it('kirill qo‘lda o‘zgartirilsa maydon qulflanadi; lotin o‘zgarsa qayta yozilmaydi va cyrlStale = true', async () => {
    const doc = await createMedia({ alt: 'Sunʼiy intellekt', caption: 'Birinchi izoh' })

    // Muharrir kirill versiyasini qo'lda tuzatadi.
    const edited = await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Cyrl',
      data: { alt: 'Сунъий интеллект (таҳрир)' },
    })
    expect(edited.cyrlLocked).toEqual({ alt: true })
    expect((await readLatn(doc.id)).alt).toBe('Sunʼiy intellekt')

    // Lotin o'zgaradi: qulflangan alt saqlanadi, qulflanmagan caption yangilanadi.
    const updated = await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Latn',
      data: { alt: 'Sunʼiy intellekt va robotlar', caption: 'Ikkinchi izoh' },
    })
    expect(updated.cyrlStale).toBe(true)
    const cyrl = await readCyrl(doc.id)
    expect(cyrl.alt).toBe('Сунъий интеллект (таҳрир)')
    expect(cyrl.caption).toBe('Иккинчи изоҳ')
    expect(cyrl.cyrlLocked).toEqual({ alt: true })
  })

  it('lotin o‘zgarmasa (qayta saqlash) cyrlStale o‘rnatilmaydi', async () => {
    const doc = await createMedia({ alt: 'Tog‘ manzarasi' })
    await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Cyrl',
      data: { alt: 'Тоғ' },
    })
    const resaved = await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Latn',
      data: { alt: 'Tog‘ manzarasi' },
    })
    expect(resaved.cyrlStale).toBe(false)
  })

  it('kirill tozalansa qulf olinadi va lotindan qayta generatsiya qilinadi', async () => {
    const doc = await createMedia({ alt: 'Birinchi rasm', caption: 'Izoh matni' })
    await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Cyrl',
      data: { caption: 'Қўлда' },
    })
    const cleared = await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Cyrl',
      data: { caption: '' },
    })
    expect(cleared.cyrlLocked).toEqual({})
    expect((await readCyrl(doc.id)).caption).toBe('Изоҳ матни')
  })

  it('“Kirillni qayta generatsiya qilish” endpoint’i qulfni oladi va kirillni qayta yozadi', async () => {
    const doc = await createMedia({ alt: 'Kibersport turniri' })
    await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Cyrl',
      data: { alt: 'Қўлда' },
    })
    await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Latn',
      data: { alt: 'Kibersport turniri finali' },
    })
    expect((await readCyrl(doc.id)).cyrlStale).toBe(true)

    const endpoint = payload.collections.media.config.endpoints
      ? payload.collections.media.config.endpoints.find((e) =>
          e.path.endsWith(REGENERATE_CYRL_ENDPOINT),
        )
      : undefined
    expect(endpoint).toBeDefined()
    const req = await createLocalReq({ user: asUser(admin) }, payload)
    req.routeParams = { id: String(doc.id) }
    const response = await endpoint!.handler(req)
    expect(response.status).toBe(200)

    const cyrl = await readCyrl(doc.id)
    expect(cyrl.alt).toBe('Киберспорт турнири финали')
    expect(cyrl.cyrlLocked).toEqual({})
    expect(cyrl.cyrlStale).toBe(false)
    expect((await readLatn(doc.id)).alt).toBe('Kibersport turniri finali')
  })

  it('endpoint ruxsatsiz foydalanuvchiga yopiq', async () => {
    const endpoint = payload.collections.media.config.endpoints
      ? payload.collections.media.config.endpoints.find((e) =>
          e.path.endsWith(REGENERATE_CYRL_ENDPOINT),
        )
      : undefined
    const req = await createLocalReq({}, payload)
    req.routeParams = { id: String(mediaIds[0]) }
    const response = await endpoint!.handler(req)
    expect(response.status).toBe(403)
  })

  it('context.cyrlRegenerate — local API orqali ham ishlaydi', async () => {
    const doc = await createMedia({ alt: 'Gadjetlar sharhi' })
    await payload.update({ collection: 'media', id: doc.id, locale: 'uz-Cyrl', data: { alt: 'X' } })
    await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Latn',
      data: { cyrlLocked: {}, cyrlStale: false },
      context: { [CYRL_CONTEXT_REGENERATE]: ['alt'] },
    })
    expect((await readCyrl(doc.id)).alt).toBe('Гаджетлар шарҳи')
  })

  it('context.disableCyrlSync — sinxronlash o‘chiriladi', async () => {
    const doc = await createMedia({ alt: 'Birinchi' })
    await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Latn',
      data: { alt: 'Ikkinchi' },
      context: { [CYRL_CONTEXT_DISABLE]: true },
    })
    expect((await readCyrl(doc.id)).alt).toBe('Биринчи')
  })

  it('DB glossariysidagi doNotTransliterate atamasi lotinda qoladi (kesh yangilanadi)', async () => {
    const term = await payload.create({
      collection: 'glossary',
      data: {
        term: 'Odyagram',
        language: 'en',
        kind: 'brand',
        translation: 'Odyagram',
        doNotTranslate: true,
        doNotTransliterate: true,
      },
    })
    glossaryIds.push(term.id)
    const doc = await createMedia({ alt: 'Odyagram ilovasi' })
    expect((await readCyrl(doc.id)).alt).toBe('Odyagram иловаси')

    // MCP `get_glossary` / `odya://glossary` ham shu kolleksiyani ko'radi (seed + DB).
    const glossary = await getGlossary(payload)
    expect(glossary.source).toBe('seed+db')
    expect(glossary.items.find((item) => item.term === 'Odyagram')).toMatchObject({
      kind: 'brand',
      doNotTransliterate: true,
    })
  })
})

// ---------------------------------------------------------------------------
// Postlar va teglar (OBLOG-37): admin/REST bilan bir xil Local API yo'li (`overrideAccess: false`)
// ---------------------------------------------------------------------------

const lexical = (...paragraphs: string[]) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      textFormat: 0,
      children: [
        { type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 },
      ],
    })),
  },
})

const readPost = (id: number, locale: 'uz-Latn' | 'uz-Cyrl', draft = true) =>
  payload.findByID({
    collection: 'posts',
    id,
    locale,
    fallbackLocale: false,
    draft,
    depth: 0,
  })

function regenerateEndpoint(collection: 'posts' | 'media'): Endpoint {
  const endpoints = payload.collections[collection].config.endpoints
  const endpoint = endpoints
    ? endpoints.find((e) => e.path.endsWith(REGENERATE_CYRL_ENDPOINT))
    : undefined
  if (!endpoint) throw new Error(`${collection}: regenerate-cyrl endpoint yo‘q`)
  return endpoint
}

describe('posts: lotin → kirill sinxronlash (admin saqlashi)', () => {
  let post: Post

  beforeAll(async () => {
    post = await payload.create({
      collection: 'posts',
      locale: 'uz-Latn',
      data: {
        title: 'Oʻzbekistonda sunʼiy intellekt',
        slug: testSlug('cyrl'),
        category: category.id,
        workflowStatus: 'draft',
        excerpt: 'Yangi loyiha haqida qisqacha',
        coverAlt: 'Toshkent shahri',
        content: lexical('Birinchi paragraf.', 'OpenAI va Google haqida.'),
        faq: [{ question: 'Qachon?', answer: 'Ertaga.' }],
        meta: {
          title: 'Sunʼiy intellekt — Blog Odya',
          description: 'Oʻzbekistondagi yangi loyiha',
          focusKeyword: 'sunʼiy intellekt',
        },
      },
      ...as(users.editor),
    })
  })

  it('yaratishda barcha lokalizatsiya qilingan matn maydonlari kirillda to‘ladi', async () => {
    const cyrl = await readPost(post.id, 'uz-Cyrl')
    expect(cyrl.title).toBe('Ўзбекистонда сунъий интеллект')
    expect(cyrl.excerpt).toBe('Янги лойиҳа ҳақида қисқача')
    expect(cyrl.coverAlt).toBe('Тошкент шаҳри')
    expect(cyrl.meta).toMatchObject({
      title: 'Сунъий интеллект — Блог Одя',
      description: 'Ўзбекистондаги янги лойиҳа',
      focusKeyword: 'сунъий интеллект',
    })
    expect(cyrl.faq?.map((row) => [row.question, row.answer])).toEqual([['Қачон?', 'Эртага.']])
    const text = JSON.stringify(cyrl.content)
    expect(text).toContain('Биринчи параграф.')
    // Glossariy brendlari (doNotTransliterate) lotinda qoladi.
    expect(text).toContain('OpenAI ва Google ҳақида.')
    expect(cyrl.cyrlStale).toBe(false)

    // Lotin o'zgarmagan; FAQ qatorlari har locale'da o'z id'si bilan.
    const latn = await readPost(post.id, 'uz-Latn')
    expect(latn.title).toBe('Oʻzbekistonda sunʼiy intellekt')
    expect(latn.faq?.[0]?.id).toBeTruthy()
    expect(latn.faq?.[0]?.id).not.toBe(cyrl.faq?.[0]?.id)
  })

  it('qoralama (autosave/draft) saqlashda ham kirill yangilanadi', async () => {
    await payload.update({
      collection: 'posts',
      id: post.id,
      locale: 'uz-Latn',
      draft: true,
      data: { title: 'Oʻzbekistonda robototexnika' },
      ...as(users.editor),
    })
    expect((await readPost(post.id, 'uz-Cyrl')).title).toBe('Ўзбекистонда робототехника')
  })

  it('kirill qo‘lda tuzatilsa — qulf (meta), lotin o‘zgarsa cyrlStale; regenerate endpoint', async () => {
    const edited = await payload.update({
      collection: 'posts',
      id: post.id,
      locale: 'uz-Cyrl',
      data: { meta: { title: 'Сунъий интеллект (таҳрир)' } },
      ...as(users.editor),
    })
    expect(edited.cyrlLocked).toEqual({ meta: true })

    const latinSaved = await payload.update({
      collection: 'posts',
      id: post.id,
      locale: 'uz-Latn',
      data: {
        meta: { description: 'Yangilangan tavsif' },
        excerpt: 'Yangilangan lid',
      },
      ...as(users.editor),
    })
    expect(latinSaved.cyrlStale).toBe(true)
    let cyrl = await readPost(post.id, 'uz-Cyrl')
    expect(cyrl.meta?.title).toBe('Сунъий интеллект (таҳрир)')
    // `meta` qulfi butun guruh uchun (TZ §10.3): description ham yangilanmadi.
    expect(cyrl.meta?.description).toBe('Ўзбекистондаги янги лойиҳа')
    // Qulflanmagan maydon yangilandi.
    expect(cyrl.excerpt).toBe('Янгиланган лид')

    const req = await createLocalReq({ user: asUser(users.editor) }, payload)
    req.routeParams = { id: String(post.id) }
    const response = await regenerateEndpoint('posts').handler(req)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      regenerated: expect.arrayContaining(['title', 'meta', 'faq', 'content']),
    })

    cyrl = await readPost(post.id, 'uz-Cyrl')
    expect(cyrl.meta?.title).toBe('Сунъий интеллект — Блог Одя')
    expect(cyrl.meta?.description).toBe('Янгиланган тавсиф')
    expect(cyrl.cyrlLocked).toEqual({})
    expect(cyrl.cyrlStale).toBe(false)
  })

  it('publish: chop etilgan versiyada ham kirill mavjud', async () => {
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { workflowStatus: 'in_progress' },
      ...as(users.editor),
    })
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { workflowStatus: 'review' },
      ...as(users.editor),
    })
    await payload.update({
      collection: 'posts',
      id: post.id,
      locale: 'uz-Latn',
      data: { _status: 'published', title: 'Oʻzbekistonda kiberxavfsizlik' },
      ...as(users.editor),
    })
    const published = await readPost(post.id, 'uz-Cyrl', false)
    expect(published._status).toBe('published')
    expect(published.title).toBe('Ўзбекистонда киберхавфсизлик')
  })
})

describe('tags: nom kirillda avtomatik', () => {
  it('lotin nomdan kirill; glossariy brendi lotinda qoladi', async () => {
    const tag = await payload.create({
      collection: 'tags',
      locale: 'uz-Latn',
      data: { name: 'iPhone yangiliklari', slug: testSlug('tag') },
      ...as(users.editor),
    })
    const cyrl = await payload.findByID({
      collection: 'tags',
      id: tag.id,
      locale: 'uz-Cyrl',
      fallbackLocale: false,
    })
    expect(cyrl.name).toBe('iPhone янгиликлари')
  })
})
