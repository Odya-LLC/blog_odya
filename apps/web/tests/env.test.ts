import { describe, expect, it } from 'vitest'

import { parseEnv } from '@/env'

const base = {
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5442/blog_odya',
  PAYLOAD_SECRET: 'x'.repeat(32),
  S3_ENDPOINT: 'http://localhost:9010',
  S3_BUCKET: 'media',
  S3_ACCESS_KEY_ID: 'minioadmin',
  S3_SECRET_ACCESS_KEY: 'minioadmin',
}

describe('env sxemasi', () => {
  it('majburiy qiymatlar bilan default’larni qo‘llaydi', () => {
    const env = parseEnv(base)
    expect(env.S3_REGION).toBe('auto')
    expect(env.S3_FORCE_PATH_STYLE).toBe(false)
    expect(env.JOBS_MODE).toBe('endpoint')
    expect(env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000')
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined()
    expect(env.SENTRY_DSN).toBeUndefined()
  })

  it('bo‘sh ixtiyoriy qiymatlarni berilmagan deb hisoblaydi', () => {
    const env = parseEnv({
      ...base,
      TELEGRAM_BOT_TOKEN: '',
      SENTRY_DSN: '',
      S3_FORCE_PATH_STYLE: 'true',
    })
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined()
    expect(env.SENTRY_DSN).toBeUndefined()
    expect(env.S3_FORCE_PATH_STYLE).toBe(true)
  })

  it('majburiy qiymat yo‘q yoki noto‘g‘ri bo‘lsa xato beradi', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/)
    expect(() => parseEnv({ ...base, PAYLOAD_SECRET: 'short' })).toThrow(/PAYLOAD_SECRET/)
    expect(() => parseEnv({ ...base, JOBS_MODE: 'cron' })).toThrow(/JOBS_MODE/)
  })

  it('SKIP_ENV_VALIDATION=1 da tekshiruvni o‘tkazib yuboradi', () => {
    expect(() => parseEnv({ SKIP_ENV_VALIDATION: '1' })).not.toThrow()
  })
})
