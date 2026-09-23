/**
 * Integration: media `alt`/`caption` kirill sinxronlash (TZ §3.6) — haqiqiy Postgres + S3 (MinIO).
 * Lokal: `docker compose -f infra/docker-compose.dev.yml up -d` va `pnpm migrate`.
 */
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import config from '@payload-config'
import { createLocalReq, getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Media, User } from '@/payload-types'
import {
  CYRL_CONTEXT_DISABLE,
  CYRL_CONTEXT_REGENERATE,
  REGENERATE_CYRL_ENDPOINT,
} from '@/translit/cyrlSync'
import { invalidateTransliteratorCache } from '@/translit/transliterator'

let payload: Payload
let admin: User
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
  payload = await getPayload({ config })
  invalidateTransliteratorCache()
  admin = await payload.create({
    collection: 'users',
    data: {
      email: `cyrl-sync-${Date.now()}@test.local`,
      password: 'test-password-123',
      name: 'Cyrl Sync Test',
      role: 'admin',
    },
  })
})

afterAll(async () => {
  if (!payload) return
  for (const id of mediaIds) await payload.delete({ collection: 'media', id }).catch(() => {})
  for (const id of glossaryIds) await payload.delete({ collection: 'glossary', id }).catch(() => {})
  if (admin) await payload.delete({ collection: 'users', id: admin.id }).catch(() => {})
  invalidateTransliteratorCache()
  await payload.destroy()
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
    const req = await createLocalReq({ user: { ...admin, collection: 'users' } }, payload)
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
  })
})
