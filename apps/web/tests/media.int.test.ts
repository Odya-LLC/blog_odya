import { createLocalReq, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MEDIA_IMAGE_SIZES } from '@/collections/Media'
import { env } from '@/env'
import type { Media, User } from '@/payload-types'

import { asUser, deleteTestUsers, initTestPayload, testEmail } from './helpers/payload'
import { createTestS3Client, deleteObject, ensureBucket, getObject } from './helpers/s3'

/**
 * Media: Payload Local API orqali rasm yuklash → S3 (lokal — MinIO), variantlar WebP;
 * clientUploads uchun imzolangan URL va bucket CORS.
 */
let payload: Payload
let editor: User
let doc: Media
const created: number[] = []
const s3 = createTestS3Client()
const publicBase = (env.MEDIA_PUBLIC_URL ?? '').replace(/\/+$/, '')

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}

/** Faylni to'g'ridan-to'g'ri bucket'dan o'qiydi (prefix yo'q — kalit = fayl nomi). */
async function readStored(filename: string | null | undefined) {
  if (!filename) throw new Error('fayl nomi yo‘q')
  const { body, contentType } = await getObject(s3, filename)
  return { contentType, meta: await sharp(body).metadata() }
}

beforeAll(async () => {
  await ensureBucket(s3)
  payload = await initTestPayload()
  await deleteTestUsers(payload)
  editor = await payload.create({
    collection: 'users',
    data: {
      email: testEmail('media-editor'),
      password: 'Test-parol-123456',
      name: 'Media editor',
      role: 'editor',
    },
  })

  const data = await makeJpeg(2400, 1600)
  doc = await payload.create({
    collection: 'media',
    data: { alt: 'Sinov rasmi', credit: 'Blog Odya', license: 'own' },
    file: { data, mimetype: 'image/jpeg', name: 'sinov-rasmi.jpg', size: data.length },
    overrideAccess: false,
    user: asUser(editor),
  })
  created.push(doc.id)
})

afterAll(async () => {
  if (payload) {
    // Hujjat o'chirilganda storage adapter fayl va variantlarni bucket'dan ham o'chiradi.
    for (const id of created) {
      await payload.delete({ collection: 'media', id }).catch(() => undefined)
    }
    await deleteTestUsers(payload)
  }
  await payload?.db?.destroy?.()
  s3.destroy()
})

describe('media: yuklash va WebP variantlar (MinIO)', () => {
  it('barcha variantlar WebP va kerakli o‘lchamda', () => {
    const expected: Record<string, { width: number; height: number }> = {
      thumb: { width: 320, height: 213 },
      card: { width: 640, height: 427 },
      hero: { width: 1280, height: 853 },
      og: { width: 1200, height: 630 },
      full: { width: 1920, height: 1280 },
    }
    expect(Object.keys(expected).sort()).toEqual(MEDIA_IMAGE_SIZES.map((s) => s.name).sort())

    for (const [name, size] of Object.entries(expected)) {
      const variant = doc.sizes?.[name as keyof NonNullable<Media['sizes']>]
      expect(variant, name).toBeTruthy()
      expect(variant?.mimeType, name).toBe('image/webp')
      expect(variant?.filename, name).toMatch(/\.webp$/)
      expect(variant?.width, name).toBe(size.width)
      expect(variant?.height, name).toBe(size.height)
    }
  })

  it('asl fayl va variantlar bucket’da saqlangan (WebP)', async () => {
    const original = await readStored(doc.filename)
    expect(original.meta.format).toBe('jpeg')
    expect(original.meta.width).toBe(2400)

    for (const size of MEDIA_IMAGE_SIZES) {
      const stored = await readStored(doc.sizes?.[size.name]?.filename)
      expect(stored.contentType, size.name).toBe('image/webp')
      expect(stored.meta.format, size.name).toBe('webp')
      expect(stored.meta.width, size.name).toBe(size.width)
    }
  })

  it.runIf(publicBase)('URL’lar MEDIA_PUBLIC_URL orqali ochiladi', async () => {
    expect(doc.url?.startsWith(publicBase)).toBe(true)
    const og = await fetch(doc.sizes!.og!.url!)
    expect(og.ok).toBe(true)
    expect(og.headers.get('content-type')).toBe('image/webp')
    const meta = await sharp(Buffer.from(await og.arrayBuffer())).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 1200, 630])
  })

  it('alt/caption lokalizatsiya qilingan, kirill lotindan avtomatik (OBLOG-10)', async () => {
    await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Latn',
      data: { caption: 'Lotin izoh' },
    })
    await payload.update({
      collection: 'media',
      id: doc.id,
      locale: 'uz-Cyrl',
      data: { alt: 'Синов расми' },
    })

    const latn = await payload.findByID({ collection: 'media', id: doc.id, locale: 'uz-Latn' })
    const cyrl = await payload.findByID({ collection: 'media', id: doc.id, locale: 'uz-Cyrl' })
    expect(latn.alt).toBe('Sinov rasmi')
    expect(cyrl.alt).toBe('Синов расми')
    // Kirill caption qo'lda kiritilmagan — lotindan avtomatik transliteratsiya (TZ §3.6).
    expect(cyrl.caption).toBe('Лотин изоҳ')  })

  it('alt majburiy', async () => {
    const data = await makeJpeg(400, 300)
    await expect(
      payload.create({
        collection: 'media',
        data: {} as Media,
        file: { data, mimetype: 'image/jpeg', name: 'altsiz.jpg', size: data.length },
      }),
    ).rejects.toThrow()
  })

  it('licenseUrl faqat http(s) havola', async () => {
    await expect(
      payload.update({
        collection: 'media',
        id: doc.id,
        data: { licenseUrl: 'javascript:alert(1)' },
      }),
    ).rejects.toThrow()
  })
})

describe('media: clientUploads (imzolangan PUT URL)', () => {
  const endpointPath = '/storage-s3-generate-signed-url'

  async function requestSignedUrl(user: unknown, body: Record<string, unknown>) {
    const endpoint = payload.config.endpoints.find((e) => e.path === endpointPath)
    if (!endpoint) throw new Error(`${endpointPath} endpoint topilmadi`)
    const req = await createLocalReq({ user: user as never }, payload)
    Object.assign(req, { json: async () => body })
    return (await endpoint.handler(req)) as Response
  }

  it('anonim foydalanuvchiga imzolangan URL berilmaydi', async () => {
    await expect(
      requestSignedUrl(null, {
        collectionSlug: 'media',
        filename: 'x.jpg',
        filesize: 10,
        mimeType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('editor 5 MB+ faylni to‘g‘ridan-to‘g‘ri bucket’ga yuklaydi (CORS ruxsat)', async () => {
    // ~6 MB (Vercel so'rov tanasi limiti 4.5 MB dan katta).
    const data = Buffer.concat([await makeJpeg(64, 64), Buffer.alloc(6 * 1024 * 1024, 1)])
    const filename = `client-upload-${Date.now()}.jpg`
    const response = await requestSignedUrl(asUser(editor), {
      collectionSlug: 'media',
      filename,
      filesize: data.length,
      mimeType: 'image/jpeg',
    })
    expect(response.status).toBe(200)
    const signed = (await response.json()) as {
      url: string
      headers: Record<string, string>
      clientUploadContext: { signedReceipt?: string }
    }
    expect(signed.clientUploadContext.signedReceipt).toBeTruthy()
    const target = new URL(signed.url)
    expect(target.origin).toBe(new URL(env.S3_ENDPOINT).origin)
    // path-style: /<bucket>/<key>
    const key = decodeURIComponent(target.pathname).replace(`/${env.S3_BUCKET}/`, '')
    expect(key).toContain('client-upload-')

    // Brauzer preflight'i: sayt origin'idan PUT ruxsat etilganmi.
    const preflight = await fetch(signed.url, {
      method: 'OPTIONS',
      headers: {
        Origin: env.NEXT_PUBLIC_SITE_URL,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type,if-none-match',
      },
    })
    expect(preflight.ok).toBe(true)
    expect(['*', env.NEXT_PUBLIC_SITE_URL]).toContain(
      preflight.headers.get('access-control-allow-origin'),
    )

    // Brauzer kabi: Content-Length'ni fetch o'zi qo'yadi.
    const { 'Content-Length': _length, ...headers } = signed.headers
    const put = await fetch(signed.url, {
      method: 'PUT',
      headers: { ...headers, Origin: env.NEXT_PUBLIC_SITE_URL },
      body: data,
    })
    expect(put.status, await put.text()).toBe(200)

    const stored = await getObject(s3, key)
    expect(stored.body.length).toBe(data.length)

    if (publicBase) {
      const head = await fetch(`${publicBase}/${key}`, { method: 'HEAD' })
      expect(head.ok).toBe(true)
      expect(Number(head.headers.get('content-length'))).toBe(data.length)
    }

    // Hujjat yaratilmadi — faylni bucket'dan o'zimiz o'chiramiz.
    await deleteObject(s3, key)
  })
})
