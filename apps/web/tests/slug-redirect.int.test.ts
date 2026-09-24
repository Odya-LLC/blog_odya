/**
 * Integration (OBLOG-29, TZ §8.1): kontent kolleksiyalarida slug o'zgarganda `redirects` yozuvi
 * avtomatik yaratiladi va eski URL — lotin ham, `/kr` ham — yangisiga yo'naltiriladi. Sayt
 * sahifalari ishlatadigan `resolveRedirect` (`site/redirects.ts`) DB'dagi yozuv bilan (keshsiz
 * `loadRedirect`) tekshiriladi.
 */
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Category, Post } from '@/payload-types'
import { loadRedirect } from '@/site/data'
import { setRevalidator } from '@/site/revalidate'
import { resolveRedirectForPathname } from '@/site/redirects'

import {
  as,
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  testSlug,
  type TestUsers,
} from './helpers/content'
import { deleteTestUsers, initTestPayload } from './helpers/payload'

let payload: Payload
let users: TestUsers
let category: Category

/** Eski URL (lotin va /kr) → yangi URL. */
async function expectMoved(oldPath: string, newPath: string) {
  expect(await resolveRedirectForPathname(oldPath, loadRedirect)).toEqual({
    to: newPath,
    permanent: true,
  })
  expect(await resolveRedirectForPathname(`/kr${oldPath}`, loadRedirect)).toEqual({
    to: `/kr${newPath}`,
    permanent: true,
  })
}

async function redirectsFrom(from: string) {
  const { docs } = await payload.find({
    collection: 'redirects',
    where: { from: { equals: from } },
    depth: 0,
  })
  return docs
}

async function publishedPost(slug: string): Promise<Post> {
  const editor = as(users.editor)
  const post = await payload.create({
    collection: 'posts',
    data: { title: 'Redirect posti', slug, category: category.id, workflowStatus: 'draft' },
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

beforeAll(async () => {
  payload = await initTestPayload()
  setRevalidator(() => {})
  await deleteTestContent(payload)
  await deleteTestUsers(payload)
  users = await createTestUsers(payload)
  category = await createTestCategory(payload)
})

afterAll(async () => {
  if (!payload) return
  await deleteTestContent(payload)
  await deleteTestUsers(payload)
  await payload?.db?.destroy?.()
})

describe('slug o‘zgarganda 301: lotin va /kr', () => {
  it('posts: publish’da eski URL → yangi; qoralamadagi o‘zgarish redirect yaratmaydi', async () => {
    const oldSlug = testSlug('post-eski')
    const draftSlug = testSlug('post-oraliq')
    const newSlug = testSlug('post-yangi')
    const post = await publishedPost(oldSlug)
    const editor = as(users.editor)

    // Admin: autosave qoralamasi — chop etilgan URL hali eski, redirect yo'q.
    await payload.update({
      collection: 'posts',
      id: post.id,
      draft: true,
      autosave: true,
      data: { slug: draftSlug },
      ...editor,
    })
    await payload.update({
      collection: 'posts',
      id: post.id,
      draft: true,
      data: { slug: newSlug },
      ...editor,
    })
    expect(await redirectsFrom(`/${category.slug}/${oldSlug}`)).toHaveLength(0)

    // Publish: eski yo'l — oxirgi chop etilgan versiyadan (oraliq qoralama slug'i emas).
    await payload.update({
      collection: 'posts',
      id: post.id,
      draft: true,
      data: { _status: 'published' },
      ...editor,
    })
    const [redirect] = await redirectsFrom(`/${category.slug}/${oldSlug}`)
    expect(redirect).toMatchObject({ type: '301', to: { type: 'custom' } })
    expect(await redirectsFrom(`/${category.slug}/${draftSlug}`)).toHaveLength(0)
    await expectMoved(`/${category.slug}/${oldSlug}`, `/${category.slug}/${newSlug}`)
  })

  it('posts: to‘g‘ridan-to‘g‘ri (draft’siz) yangilash va zanjir A → B → C', async () => {
    const a = testSlug('post-a')
    const b = testSlug('post-b')
    const c = testSlug('post-c')
    const post = await publishedPost(a)
    const editor = as(users.editor)
    await payload.update({ collection: 'posts', id: post.id, data: { slug: b }, ...editor })
    await payload.update({ collection: 'posts', id: post.id, data: { slug: c }, ...editor })
    await expectMoved(`/${category.slug}/${a}`, `/${category.slug}/${c}`)
    await expectMoved(`/${category.slug}/${b}`, `/${category.slug}/${c}`)
  })

  it('categories: /{eski} → /{yangi}', async () => {
    const created = await createTestCategory(payload)
    const newSlug = testSlug('cat-yangi')
    await payload.update({
      collection: 'categories',
      id: created.id,
      data: { slug: newSlug },
      ...as(users.editor),
    })
    await expectMoved(`/${created.slug}`, `/${newSlug}`)
  })

  it('tags: /tag/{eski} → /tag/{yangi}', async () => {
    const oldSlug = testSlug('tag-eski')
    const newSlug = testSlug('tag-yangi')
    const tag = await payload.create({
      collection: 'tags',
      data: { name: 'Redirect tegi', slug: oldSlug },
      ...as(users.editor),
    })
    await payload.update({
      collection: 'tags',
      id: tag.id,
      data: { slug: newSlug },
      ...as(users.editor),
    })
    await expectMoved(`/tag/${oldSlug}`, `/tag/${newSlug}`)
  })

  it('authors: /author/{eski} → /author/{yangi}', async () => {
    const oldSlug = testSlug('author-eski')
    const newSlug = testSlug('author-yangi')
    const author = await payload.create({
      collection: 'authors',
      data: { name: 'Redirect muallifi', slug: oldSlug },
      ...as(users.editor),
    })
    await payload.update({
      collection: 'authors',
      id: author.id,
      data: { slug: newSlug },
      ...as(users.editor),
    })
    await expectMoved(`/author/${oldSlug}`, `/author/${newSlug}`)
  })

  it('pages: publish’da /{eski} → /{yangi}; chop etilmagan sahifa — redirect yo‘q', async () => {
    const oldSlug = testSlug('page-eski')
    const newSlug = testSlug('page-yangi')
    const page = await payload.create({
      collection: 'pages',
      data: { title: 'Redirect sahifasi', slug: oldSlug, _status: 'published' },
      ...as(users.editor),
    })
    await payload.update({
      collection: 'pages',
      id: page.id,
      draft: true,
      data: { slug: newSlug },
      ...as(users.editor),
    })
    expect(await redirectsFrom(`/${oldSlug}`)).toHaveLength(0)
    await payload.update({
      collection: 'pages',
      id: page.id,
      draft: true,
      data: { _status: 'published' },
      ...as(users.editor),
    })
    await expectMoved(`/${oldSlug}`, `/${newSlug}`)

    const draftOnly = await payload.create({
      collection: 'pages',
      draft: true,
      data: { title: 'Qoralama sahifa', slug: testSlug('page-qoralama'), _status: 'draft' },
      ...as(users.editor),
    })
    const renamed = testSlug('page-qoralama2')
    await payload.update({
      collection: 'pages',
      id: draftOnly.id,
      data: { slug: renamed, _status: 'published' },
      ...as(users.editor),
    })
    expect(await redirectsFrom(`/${draftOnly.slug}`)).toHaveLength(0)
  })

  it('yangi URL’dagi mavjud kontent redirect bilan yopilmaydi (sikl yo‘q)', async () => {
    const a = testSlug('tag-sikl-a')
    const b = testSlug('tag-sikl-b')
    const tag = await payload.create({
      collection: 'tags',
      data: { name: 'Sikl tegi', slug: a },
      ...as(users.editor),
    })
    await payload.update({ collection: 'tags', id: tag.id, data: { slug: b }, ...as(users.editor) })
    await payload.update({ collection: 'tags', id: tag.id, data: { slug: a }, ...as(users.editor) })
    expect(await redirectsFrom(`/tag/${a}`)).toHaveLength(0)
    await expectMoved(`/tag/${b}`, `/tag/${a}`)
  })
})
