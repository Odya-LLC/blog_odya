import { describe, expect, it } from 'vitest'

import { getDatabaseMode, getDatabasePoolConfig, RUNTIME_POOL_MAX } from '@/config/database'
import { getPayloadSecret } from '@/config/secret'
import { getS3StorageOptions } from '@/config/storage'
import { parseEnv } from '@/env'

const POOLER = 'postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres'
const DIRECT = 'postgresql://postgres:pw@db.ref.supabase.co:5432/postgres'

const base = {
  DATABASE_URL: POOLER,
  DATABASE_URL_DIRECT: DIRECT,
  PAYLOAD_SECRET: 'x'.repeat(32),
  S3_BUCKET: 'media',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
}

describe('DB ulanishi: runtime — pooler, migratsiya — direct', () => {
  it('rejimni PAYLOAD_MIGRATING bo‘yicha aniqlaydi', () => {
    expect(getDatabaseMode({ PAYLOAD_MIGRATING: 'true' })).toBe('migrate')
    expect(getDatabaseMode({})).toBe('runtime')
    expect(getDatabaseMode({ PAYLOAD_MIGRATING: 'false' })).toBe('runtime')
  })

  it('Vercel Preview’da migratsiya taqiqlangan, Production’da ruxsat', () => {
    const migrating = { PAYLOAD_MIGRATING: 'true', VERCEL: '1' }
    expect(() => getDatabaseMode({ ...migrating, VERCEL_ENV: 'preview' })).toThrow(/Production/)
    expect(() => getDatabaseMode({ ...migrating })).toThrow(/Production/)
    expect(getDatabaseMode({ ...migrating, VERCEL_ENV: 'production' })).toBe('migrate')
    expect(getDatabaseMode({ PAYLOAD_MIGRATING: 'true', VERCEL_ENV: 'development' })).toBe(
      'migrate',
    )
    // Preview runtime (migratsiyasiz) — ta'sir qilmaydi.
    expect(getDatabaseMode({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe('runtime')
  })

  it('runtime — DATABASE_URL (transaction pooler), pool.max 2–3', () => {
    const env = parseEnv({ ...base, S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com' })
    const pool = getDatabasePoolConfig(env, 'runtime')
    expect(pool.connectionString).toBe(POOLER)
    expect(pool.max).toBe(RUNTIME_POOL_MAX)
    expect(pool.max).toBeGreaterThanOrEqual(2)
    expect(pool.max).toBeLessThanOrEqual(3)
  })

  it('migratsiya — DATABASE_URL_DIRECT', () => {
    const env = parseEnv({ ...base, S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com' })
    expect(getDatabasePoolConfig(env, 'migrate').connectionString).toBe(DIRECT)
  })

  it('DATABASE_URL_DIRECT bo‘lmasa migratsiya DATABASE_URL ga qaytadi', () => {
    const env = parseEnv({
      ...base,
      DATABASE_URL_DIRECT: '',
      S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
    })
    expect(getDatabasePoolConfig(env, 'migrate').connectionString).toBe(POOLER)
  })
})

describe('prod migratsiya: GitHub Actions migrate-prod (OBLOG-34)', () => {
  // GitHub runner: VERCEL/VERCEL_ENV yo'q.
  const githubRunner = { PAYLOAD_MIGRATING: 'true', CI: 'true', GITHUB_ACTIONS: 'true' }

  it('GitHub runner’da migratsiya ruxsat etiladi', () => {
    expect(getDatabaseMode(githubRunner)).toBe('migrate')
  })

  it('PAYLOAD_SECRET/S3 siz: env o‘tadi, S3 plagini o‘chiq, migratsiya DIRECT ga ulanadi', () => {
    const env = parseEnv({ ...githubRunner, DATABASE_URL: DIRECT, DATABASE_URL_DIRECT: DIRECT })
    expect(getS3StorageOptions(env).enabled).toBe(false)
    expect(getDatabasePoolConfig(env, 'migrate').connectionString).toBe(DIRECT)
  })

  it('migratsiyada PAYLOAD_SECRET bo‘lmasa — tasodifiy vaqtinchalik qiymat', () => {
    const a = getPayloadSecret({ PAYLOAD_SECRET: undefined }, 'migrate')
    const b = getPayloadSecret({ PAYLOAD_SECRET: undefined }, 'migrate')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  it('berilgan PAYLOAD_SECRET ishlatiladi; runtime’da placeholder yo‘q', () => {
    expect(getPayloadSecret({ PAYLOAD_SECRET: 'x'.repeat(32) }, 'migrate')).toBe('x'.repeat(32))
    expect(getPayloadSecret({ PAYLOAD_SECRET: 'y'.repeat(32) }, 'runtime')).toBe('y'.repeat(32))
    expect(getPayloadSecret({ PAYLOAD_SECRET: undefined }, 'runtime')).toBe('')
  })
})

describe('S3 saqlash: MinIO va R2 — faqat env farqi', () => {
  const minio = parseEnv({
    ...base,
    S3_ENDPOINT: 'http://localhost:9010',
    S3_REGION: 'us-east-1',
    S3_FORCE_PATH_STYLE: 'true',
    MEDIA_PUBLIC_URL: 'http://localhost:9010/media/',
  })
  const r2 = parseEnv({
    ...base,
    S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
    S3_REGION: 'auto',
    S3_FORCE_PATH_STYLE: 'true',
    MEDIA_PUBLIC_URL: 'https://media.odya.uz',
  })

  it.each([
    ['MinIO', minio, 'http://localhost:9010', 'http://localhost:9010/media/a.webp'],
    ['R2', r2, 'https://acc.r2.cloudflarestorage.com', 'https://media.odya.uz/a.webp'],
  ])('%s: clientUploads yoqilgan, URL MEDIA_PUBLIC_URL dan', (_name, env, endpoint, url) => {
    const options = getS3StorageOptions(env)
    expect(options.enabled).toBe(true)
    expect(options.clientUploads).toBeTruthy()
    expect(options.bucket).toBe('media')
    expect(options.config.endpoint).toBe(endpoint)
    expect(options.config.requestChecksumCalculation).toBe('WHEN_REQUIRED')

    const media = options.collections.media
    expect(media).not.toBe(true)
    if (media === true || !media) throw new Error('media sozlamasi yo‘q')
    expect(media.disablePayloadAccessControl).toBe(true)
    const generated = media.generateFileURL?.({
      collection: {} as never,
      filename: 'a.webp',
      prefix: undefined,
    })
    expect(generated).toBe(url)
  })

  it('MEDIA_PUBLIC_URL bo‘lmasa fayllar Payload orqali beriladi', () => {
    const options = getS3StorageOptions({ ...minio, MEDIA_PUBLIC_URL: undefined })
    expect(options.collections.media).toBe(true)
  })
})
