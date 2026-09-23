import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CLAIM_LOCK_MS } from '@/collections/Posts/workflow'
import type { Category, Post } from '@/payload-types'

import {
  as,
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  testSlug,
  type TestUsers,
} from './helpers/content'
import { deleteTestUsers, initTestPayload } from './helpers/payload'

/**
 * Postlar workflow'i (TZ §4.1) — Local API (`overrideAccess: false`) + Docker Postgres.
 * Ruxsat etilmagan o'tishlar 400 (ValidationError, `workflowStatus` maydoni), rol cheklovi — 403.
 */
let payload: Payload
let users: TestUsers
let category: Category

const paragraph = (text: string) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph',
        format: '' as const,
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        textFormat: 0,
        children: [
          { type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 },
        ],
      },
    ],
  },
})

async function newPost(overrides: Partial<Post> = {}, user = users.editor): Promise<Post> {
  return payload.create({
    collection: 'posts',
    data: {
      title: 'Test post',
      slug: testSlug('post'),
      category: category.id,
      workflowStatus: 'draft',
      ...overrides,
    },
    ...as(user),
  })
}

async function update(id: number, data: Partial<Post>, user = users.editor, draft = false) {
  return payload.update({ collection: 'posts', id, data, draft, ...as(user) })
}

/** draft → in_progress → review (editor nomidan). */
async function postInReview(): Promise<Post> {
  const post = await newPost()
  await update(post.id, { workflowStatus: 'in_progress' })
  return update(post.id, { workflowStatus: 'review' })
}

async function publishedPost(): Promise<Post> {
  const post = await postInReview()
  return update(post.id, { _status: 'published' })
}

const rejects400 = (promise: Promise<unknown>, text?: string) =>
  expect(promise).rejects.toMatchObject({
    status: 400,
    ...(text
      ? { data: { errors: [expect.objectContaining({ message: expect.stringContaining(text) })] } }
      : {}),
  })

const rejects403 = (promise: Promise<unknown>) =>
  expect(promise).rejects.toMatchObject({ status: 403 })

describe('posts: workflow (TZ §4.1)', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await deleteTestContent(payload)
    await deleteTestUsers(payload)
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
  })

  afterAll(async () => {
    if (payload) {
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
    }
    await payload?.db?.destroy?.()
  })

  it('yangi post draft holatida yaratiladi; boshqa holat bilan yaratish rad etiladi', async () => {
    const post = await newPost()
    expect(post.workflowStatus).toBe('draft')
    expect(post._status).toBe('draft')

    await rejects400(newPost({ workflowStatus: 'published' }), 'draft → published')
    await rejects400(newPost({ workflowStatus: 'review' }))
    await rejects400(newPost({ _status: 'published' }), 'draft → published')
  })

  it('draft → published rad etiladi (publish tugmasi ham, holat maydoni ham)', async () => {
    const post = await newPost()
    await rejects400(update(post.id, { _status: 'published' }), 'draft → published')
    await rejects400(update(post.id, { workflowStatus: 'published' }), 'draft → published')
    await rejects400(update(post.id, { workflowStatus: 'review' }), 'draft → review')
    await rejects400(update(post.id, { workflowStatus: 'scheduled' }), 'draft → scheduled')
    await rejects400(update(post.id, { workflowStatus: 'archived' }), 'draft → archived')

    const fresh = await payload.findByID({ collection: 'posts', id: post.id, draft: true })
    expect(fresh.workflowStatus).toBe('draft')
  })

  it('claim: draft → in_progress — assignee va 2 soatlik qulf qo‘yiladi', async () => {
    const post = await newPost()
    const before = Date.now()
    const claimed = await update(post.id, { workflowStatus: 'in_progress' })
    expect(claimed.workflowStatus).toBe('in_progress')
    const assignee = typeof claimed.assignee === 'object' ? claimed.assignee?.id : claimed.assignee
    expect(assignee).toBe(users.editor.id)
    const lockedUntil = new Date(claimed.lockedUntil ?? 0).getTime()
    expect(lockedUntil).toBeGreaterThanOrEqual(before + CLAIM_LOCK_MS - 1000)
    expect(lockedUntil).toBeLessThanOrEqual(Date.now() + CLAIM_LOCK_MS + 1000)
  })

  it('qulf: boshqa editor band qilingan postni o‘zgartira olmaydi, admin — mumkin', async () => {
    const post = await newPost()
    await update(post.id, { workflowStatus: 'in_progress' })

    await rejects403(update(post.id, { title: 'Boshqa editor' }, users.editor2))
    await rejects403(update(post.id, { workflowStatus: 'review' }, users.editor2))

    const byAdmin = await update(post.id, { title: 'Admin tuzatdi' }, users.admin)
    expect(byAdmin.title).toBe('Admin tuzatdi')

    const own = await update(post.id, { title: 'O‘zim' })
    expect(own.title).toBe('O‘zim')
  })

  it('qulf muddati o‘tgan bo‘lsa boshqa editor ishlay oladi', async () => {
    const post = await newPost()
    await update(post.id, { workflowStatus: 'in_progress' })
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { lockedUntil: new Date(Date.now() - 60_000).toISOString() },
    })
    const updated = await update(post.id, { title: 'Muddat o‘tdi' }, users.editor2)
    expect(updated.title).toBe('Muddat o‘tdi')
  })

  it('in_progress → published rad etiladi; in_progress → review — qulf bo‘shatiladi', async () => {
    const post = await newPost()
    await update(post.id, { workflowStatus: 'in_progress' })
    await rejects400(update(post.id, { _status: 'published' }), 'in_progress → published')
    await rejects400(update(post.id, { workflowStatus: 'draft' }), 'in_progress → draft')

    const inReview = await update(post.id, { workflowStatus: 'review' })
    expect(inReview.workflowStatus).toBe('review')
    expect(inReview.lockedUntil ?? null).toBeNull()
  })

  it('review → in_progress (qaytarildi) ruxsat etiladi', async () => {
    const post = await postInReview()
    const back = await update(post.id, { workflowStatus: 'in_progress' })
    expect(back.workflowStatus).toBe('in_progress')
  })

  it('review → published: editor publish qiladi, holat va publishedAt avtomatik', async () => {
    const post = await postInReview()
    expect(post.publishedAt ?? null).toBeNull()
    await rejects400(update(post.id, { workflowStatus: 'published' }), 'Publish')

    const published = await update(post.id, { _status: 'published' })
    expect(published._status).toBe('published')
    expect(published.workflowStatus).toBe('published')
    expect(published.publishedAt).toBeTruthy()

    const anon = await payload.findByID({ collection: 'posts', id: post.id, ...as(null) })
    expect(anon.id).toBe(post.id)
  })

  it('chop etilgan postni tahrirlash (qoralama/autosave va publish) ruxsat etiladi', async () => {
    const post = await publishedPost()
    const draftSave = await update(post.id, { title: 'Qoralama tahrir' }, users.editor, true)
    expect(draftSave.workflowStatus).toBe('published')
    const republished = await update(post.id, { title: 'Yangi sarlavha', _status: 'published' })
    expect(republished.title).toBe('Yangi sarlavha')
    expect(republished.workflowStatus).toBe('published')
  })

  it('published → archived: editor — 403, admin — ruxsat; arxiv saytda ko‘rinmaydi', async () => {
    const post = await publishedPost()
    await rejects403(update(post.id, { workflowStatus: 'archived' }))
    await rejects400(
      update(post.id, { workflowStatus: 'archived' }, users.admin, true),
      'Arxivlash',
    )

    const archived = await update(post.id, { workflowStatus: 'archived' }, users.admin)
    expect(archived.workflowStatus).toBe('archived')

    const anon = await payload.find({
      collection: 'posts',
      where: { id: { equals: post.id } },
      ...as(null),
    })
    expect(anon.docs).toHaveLength(0)

    // archived — yakuniy holat.
    await rejects400(update(post.id, { workflowStatus: 'published' }, users.admin), 'archived')
  })

  it('rejected: sabab majburiy va yakuniy holat', async () => {
    const post = await newPost()
    await rejects400(update(post.id, { workflowStatus: 'rejected' }), 'sababi')
    const rejected = await update(post.id, { workflowStatus: 'rejected', rejectReason: 'Dublikat' })
    expect(rejected.workflowStatus).toBe('rejected')
    await rejects400(update(post.id, { workflowStatus: 'draft' }), 'rejected → draft')
    await rejects400(update(post.id, { _status: 'published' }))

    const review = await postInReview()
    const rejectedFromReview = await update(review.id, {
      workflowStatus: 'rejected',
      rejectReason: 'Ahamiyatsiz',
    })
    expect(rejectedFromReview.workflowStatus).toBe('rejected')
  })

  it('anonim foydalanuvchi qoralamani ko‘rmaydi va post yarata olmaydi', async () => {
    const post = await newPost()
    const anon = await payload.find({
      collection: 'posts',
      where: { id: { equals: post.id } },
      ...as(null),
    })
    expect(anon.docs).toHaveLength(0)
    await rejects403(
      payload.create({
        collection: 'posts',
        data: {
          title: 'X',
          slug: testSlug('anon'),
          category: category.id,
          workflowStatus: 'draft',
        },
        ...as(null),
      }),
    )
  })

  it('qoralama saqlash (draft: true) bilan ham o‘tishlar tekshiriladi', async () => {
    const post = await newPost()
    const claimed = await update(post.id, { workflowStatus: 'in_progress' }, users.editor, true)
    expect(claimed.workflowStatus).toBe('in_progress')
    await rejects400(update(post.id, { workflowStatus: 'published' }, users.editor, true))
    await rejects400(update(post.id, { workflowStatus: 'scheduled' }, users.editor, true))
  })

  it('readingTime avtomatik; aiDisclosure ai_agent tanlanganda yoqiladi', async () => {
    const words = Array(450).fill('soʻz').join(' ')
    const post = await newPost({ content: paragraph(words) as never, rewrittenBy: 'ai_agent' })
    expect(post.readingTime).toBe(3)
    expect(post.aiDisclosure).toBe(true)

    const human = await newPost({ content: paragraph('qisqa matn') as never })
    expect(human.readingTime).toBe(1)
    expect(human.aiDisclosure).toBe(false)
    const switched = await update(human.id, { rewrittenBy: 'ai_agent' })
    expect(switched.aiDisclosure).toBe(true)
  })

  describe('scheduled publish', () => {
    const pendingJobs = (postId: number) =>
      payload.find({
        collection: 'payload-jobs',
        where: {
          taskSlug: { equals: 'schedulePublish' },
          'input.doc.value': { equals: postId },
          completedAt: { exists: false },
        },
        depth: 0,
      })

    it('review → scheduled: vaqt majburiy va kelajakda bo‘lishi kerak', async () => {
      const post = await postInReview()
      await rejects400(update(post.id, { workflowStatus: 'scheduled' }), 'vaqti majburiy')
      await rejects400(
        update(post.id, {
          workflowStatus: 'scheduled',
          scheduledAt: new Date(Date.now() - 60_000).toISOString(),
        }),
        'kelajakda',
      )
    })

    it('scheduled: job navbatga qo‘yiladi, vaqt o‘zgarsa qayta rejalashtiriladi', async () => {
      const post = await postInReview()
      const at = new Date(Date.now() + 60 * 60 * 1000)
      const scheduled = await update(post.id, {
        workflowStatus: 'scheduled',
        scheduledAt: at.toISOString(),
      })
      expect(scheduled.workflowStatus).toBe('scheduled')

      let jobs = await pendingJobs(post.id)
      expect(jobs.docs).toHaveLength(1)
      expect(new Date(jobs.docs[0]?.waitUntil ?? 0).getTime()).toBe(at.getTime())

      const later = new Date(Date.now() + 2 * 60 * 60 * 1000)
      await update(post.id, { scheduledAt: later.toISOString() })
      jobs = await pendingJobs(post.id)
      expect(jobs.docs).toHaveLength(1)
      expect(new Date(jobs.docs[0]?.waitUntil ?? 0).getTime()).toBe(later.getTime())

      // scheduled → faqat published.
      await rejects400(update(post.id, { workflowStatus: 'review' }), 'scheduled → review')
    })

    it('vaqti kelganda scheduler postni chop etadi (scheduled → published)', async () => {
      const post = await postInReview()
      await update(post.id, {
        workflowStatus: 'scheduled',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      const [job] = (await pendingJobs(post.id)).docs
      if (!job) throw new Error('schedulePublish job yo‘q')
      // Vaqtni "kelgan" qilib qo'yamiz va navbatni ishga tushiramiz.
      await payload.update({
        collection: 'payload-jobs',
        id: job.id,
        data: { waitUntil: new Date(Date.now() - 1000).toISOString() },
      })
      await payload.jobs.runByID({ id: job.id })

      const fresh = await payload.findByID({ collection: 'posts', id: post.id })
      expect(fresh._status).toBe('published')
      expect(fresh.workflowStatus).toBe('published')
      expect(fresh.publishedAt).toBeTruthy()
      expect((await pendingJobs(post.id)).docs).toHaveLength(0)
    })

    it('muddatidan oldin qo‘lda publish qilinsa kutilayotgan job bekor qilinadi', async () => {
      const post = await postInReview()
      await update(post.id, {
        workflowStatus: 'scheduled',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      expect((await pendingJobs(post.id)).docs).toHaveLength(1)
      const published = await update(post.id, { _status: 'published' })
      expect(published.workflowStatus).toBe('published')
      expect((await pendingJobs(post.id)).docs).toHaveLength(0)
    })
  })
})
