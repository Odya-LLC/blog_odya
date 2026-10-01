/**
 * Integration (OBLOG-67): post darajasidagi transliteratsiya himoyasi (`keepLatin`, brend teglar)
 * va chop etilgan postlar kirillini qayta sinxronlash (`resyncPostsCyrillic`) — haqiqiy Postgres.
 * Lokal: `docker compose -f infra/docker-compose.dev.yml up -d` va `pnpm migrate`.
 */
import type { Payload, PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Category, Post, Tag } from '@/payload-types'
import { CYRL_CONTEXT_DISABLE } from '@/translit/cyrlSync'
import { formatResyncSummary, resyncCyrlEndpoint, resyncPostsCyrillic } from '@/translit/resync'
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

beforeAll(async () => {
  payload = await initTestPayload()
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
  invalidateTransliteratorCache()
  await payload?.db?.destroy?.()
})

async function readPost(id: number, locale: 'uz-Latn' | 'uz-Cyrl', draft = true): Promise<Post> {
  return payload.findByID({
    collection: 'posts',
    id,
    depth: 0,
    draft,
    locale,
    fallbackLocale: false,
  })
}

async function readTag(id: number, locale: 'uz-Latn' | 'uz-Cyrl'): Promise<Tag> {
  return payload.findByID({ collection: 'tags', id, depth: 0, locale, fallbackLocale: false })
}

async function createTag(name: string, doNotTransliterate: boolean): Promise<Tag> {
  return payload.create({
    collection: 'tags',
    locale: 'uz-Latn',
    data: { name, slug: testSlug('tag'), doNotTransliterate },
    ...as(users.editor),
  })
}

async function publishPost(data: Partial<Post>): Promise<Post> {
  const post = await payload.create({
    collection: 'posts',
    locale: 'uz-Latn',
    data: {
      slug: testSlug('resync'),
      category: category.id,
      workflowStatus: 'draft',
      ...data,
    } as Post,
    ...as(users.editor),
  })
  for (const workflowStatus of ['in_progress', 'review'] as const) {
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { workflowStatus },
      ...as(users.editor),
    })
  }
  return payload.update({
    collection: 'posts',
    id: post.id,
    locale: 'uz-Latn',
    data: { _status: 'published' },
    ...as(users.editor),
  })
}

/** Eski qoidalar bilan yozilgan kirill (OBLOG-67 gacha) — sinxronlashsiz to'g'ridan-to'g'ri. */
async function writeOldCyrillic(id: number, data: Partial<Post>): Promise<void> {
  await payload.update({
    collection: 'posts',
    id,
    locale: 'uz-Cyrl',
    data,
    context: { [CYRL_CONTEXT_DISABLE]: true, skipTelegram: true },
  })
}

describe('tags: doNotTransliterate (brend teg)', () => {
  it('belgilangan teg nomi kirillda lotinda; belgi olinsa kirill qayta yoziladi', async () => {
    const tag = await createTag('Nimbus Pro', true)
    expect((await readTag(tag.id, 'uz-Cyrl')).name).toBe('Nimbus Pro')

    await payload.update({
      collection: 'tags',
      id: tag.id,
      locale: 'uz-Latn',
      data: { doNotTransliterate: false },
      ...as(users.editor),
    })
    expect((await readTag(tag.id, 'uz-Cyrl')).name).toBe('Нимбус Про')

    await payload.update({
      collection: 'tags',
      id: tag.id,
      locale: 'uz-Latn',
      data: { doNotTransliterate: true },
      ...as(users.editor),
    })
    expect((await readTag(tag.id, 'uz-Cyrl')).name).toBe('Nimbus Pro')
  })
})

describe('posts: brend teglar va keepLatin', () => {
  it('teg va keepLatin atamalari kirillda lotinda; keepLatin o‘zgarsa qulflanmagan kirill yangilanadi', async () => {
    const brand = await createTag('Nimbus Pro', true)
    const plain = await createTag('Kibersport', false)
    const post = await payload.create({
      collection: 'posts',
      locale: 'uz-Latn',
      data: {
        title: 'Nimbus Pro va Orbitron sinovi',
        slug: testSlug('terms'),
        category: category.id,
        workflowStatus: 'draft',
        excerpt: 'Orbitron haqida qisqacha',
        tags: [brand.id, plain.id],
        content: lexical('Nimbus Prodan keyin Orbitron va Kibersport haqida.'),
      },
      ...as(users.editor),
    })
    let cyrl = await readPost(post.id, 'uz-Cyrl')
    expect(cyrl.title).toBe('Nimbus Pro ва Орбитрон синови')
    expect(JSON.stringify(cyrl.content)).toContain('Nimbus Proдан кейин Орбитрон ва Киберспорт')

    // Muharrir lidni kirillda qo'lda tuzatadi — qulf.
    await payload.update({
      collection: 'posts',
      id: post.id,
      locale: 'uz-Cyrl',
      data: { excerpt: 'Орбитрон ҳақида (таҳрир)' },
      ...as(users.editor),
    })

    // Faqat keepLatin o'zgaradi (lotin matn o'zgarmaydi) — qulflanmagan maydonlar qayta yoziladi.
    await payload.update({
      collection: 'posts',
      id: post.id,
      locale: 'uz-Latn',
      data: { keepLatin: ['Orbitron'] },
      ...as(users.editor),
    })
    cyrl = await readPost(post.id, 'uz-Cyrl')
    expect(cyrl.title).toBe('Nimbus Pro ва Orbitron синови')
    expect(JSON.stringify(cyrl.content)).toContain('Nimbus Proдан кейин Orbitron ва Киберспорт')
    expect(cyrl.excerpt).toBe('Орбитрон ҳақида (таҳрир)')
    expect(cyrl.cyrlLocked).toEqual({ excerpt: true })
  })

  it('keepLatin validatsiyasi: kirill harflari rad etiladi', async () => {
    await expect(
      payload.create({
        collection: 'posts',
        locale: 'uz-Latn',
        data: {
          title: 'Sinov',
          slug: testSlug('bad'),
          category: category.id,
          workflowStatus: 'draft',
          keepLatin: ['Фигуре'],
        },
        ...as(users.editor),
      }),
    ).rejects.toThrow(/Kirillda lotinda qoladigan atamalar/)
  })
})

describe('resyncPostsCyrillic: chop etilgan postlar kirilli', () => {
  it('dry-run hisobot; apply qulflanmagan maydonlarni yangilaydi, qulflanganini saqlaydi', async () => {
    const post = await publishPost({
      title: 'Figure robotlari va GTA',
      excerpt: 'Game Informer xabar berdi',
      content: lexical('Crew Dragon kemasi va ESL turniri. Sem Altman (Sam Altman) gapirdi.'),
      meta: { title: 'Figure robotlari', description: 'Bloomberg maʼlumoti' },
    })
    await writeOldCyrillic(post.id, {
      title: 'Фигуре роботлари ва ГТА',
      excerpt: 'Гаме Информер хабар берди',
      content: lexical(
        'Crew Драгон кемаси ва ЭСЛ турнири. Сем Алтман (Сам Алтман) гапирди.',
      ) as Post['content'],
      meta: { title: 'Фигуре роботлари', description: 'Блоомберг маълумоти' },
    })
    // Muharrir lidni qo'lda tuzatgan (qulf) — qayta sinxronlash unga tegmasligi kerak.
    await payload.update({
      collection: 'posts',
      id: post.id,
      locale: 'uz-Latn',
      data: { cyrlLocked: { excerpt: true } },
      context: { [CYRL_CONTEXT_DISABLE]: true, skipTelegram: true },
    })

    const dry = await resyncPostsCyrillic(payload, { ids: [post.id] })
    expect(dry).toMatchObject({ apply: false, scanned: 1, changed: 1, updated: 0 })
    const report = dry.posts[0]!
    expect(report).toMatchObject({ id: post.id, status: 'would_update', locked: ['excerpt'] })
    expect(report.changes.map((change) => change.field).sort()).toEqual([
      'content',
      'meta.description',
      'meta.title',
      'title',
    ])
    expect(report.changes.find((change) => change.field === 'title')?.words).toEqual([
      'Фигуре → Figure',
      'ГТА → GTA',
    ])
    expect(formatResyncSummary(dry)).toContain('(dry-run)')
    // Dry-run hech narsa yozmaydi.
    expect((await readPost(post.id, 'uz-Cyrl', false)).title).toBe('Фигуре роботлари ва ГТА')

    const applied = await resyncPostsCyrillic(payload, { ids: [post.id], apply: true })
    expect(applied).toMatchObject({ apply: true, changed: 1, updated: 1, failed: 0 })
    const cyrl = await readPost(post.id, 'uz-Cyrl', false)
    expect(cyrl._status).toBe('published')
    expect(cyrl.workflowStatus).toBe('published')
    expect(cyrl.title).toBe('Figure роботлари ва GTA')
    expect(cyrl.meta).toMatchObject({
      title: 'Figure роботлари',
      description: 'Bloomberg маълумоти',
    })
    expect(JSON.stringify(cyrl.content)).toContain(
      'Crew Dragon кемаси ва ESL турнири. Сем Алтман (Sam Altman) гапирди.',
    )
    expect(cyrl.excerpt).toBe('Гаме Информер хабар берди')
    expect(cyrl.cyrlLocked).toEqual({ excerpt: true })
    // Lotin o'zgarmaydi.
    expect((await readPost(post.id, 'uz-Latn', false)).title).toBe('Figure robotlari va GTA')

    // Telegram job'lari qo'yilmaydi (`skipTelegram`).
    const jobs = await payload.count({
      collection: 'payload-jobs',
      where: { 'input.postId': { equals: post.id } },
    })
    expect(jobs.totalDocs).toBe(0)

    // Qayta ishga tushirish — o'zgarish yo'q (idempotent).
    const again = await resyncPostsCyrillic(payload, { ids: [post.id] })
    expect(again).toMatchObject({ changed: 0, unchanged: 1 })
  })

  it('chop etilmagan qoralamasi bor post o‘tkazib yuboriladi; filter=ai', async () => {
    const post = await publishPost({ title: 'Figure yangiliklari' })
    await writeOldCyrillic(post.id, { title: 'Фигуре янгиликлари' })
    await payload.update({
      collection: 'posts',
      id: post.id,
      locale: 'uz-Latn',
      draft: true,
      data: { title: 'Figure yangiliklari (qoralama)' },
      ...as(users.editor),
    })

    const result = await resyncPostsCyrillic(payload, { ids: [post.id], apply: true })
    expect(result.posts[0]).toMatchObject({ status: 'skipped', reason: 'unpublished_draft' })
    expect((await readPost(post.id, 'uz-Cyrl', false)).title).toBe('Фигуре янгиликлари')

    // rewrittenBy = human — `filter: ai` uni ko'rmaydi.
    const ai = await resyncPostsCyrillic(payload, { ids: [post.id], filter: 'ai' })
    expect(ai.scanned).toBe(0)
  })

  it('POST /api/posts/resync-cyrl — faqat admin, standart dry-run', async () => {
    const call = (user: TestUsers['admin'], body: unknown) =>
      resyncCyrlEndpoint.handler({
        user: asUser(user),
        payload,
        json: async () => body,
      } as unknown as PayloadRequest)
    expect((await call(users.editor, {})).status).toBe(403)
    const response = await call(users.admin, { ids: [2_000_000_000] })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ apply: false, scanned: 0 })
  })
})
