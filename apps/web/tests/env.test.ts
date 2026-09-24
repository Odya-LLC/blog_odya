import { describe, expect, it } from 'vitest'

import { parseEnv, PHASE_PRODUCTION_BUILD, resolveEnvMode } from '@/env.schema'

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

describe('env: build vaqtida DB/sirlar majburiy emas (OBLOG-31)', () => {
  it('rejimni faza va NEXT_PHASE bo‘yicha aniqlaydi', () => {
    expect(resolveEnvMode({})).toBe('strict')
    expect(resolveEnvMode({}, 'phase-development-server')).toBe('strict')
    expect(resolveEnvMode({}, 'phase-production-server')).toBe('strict')
    expect(resolveEnvMode({}, PHASE_PRODUCTION_BUILD)).toBe('build')
    expect(resolveEnvMode({ NEXT_PHASE: PHASE_PRODUCTION_BUILD })).toBe('build')
    expect(resolveEnvMode({ SKIP_ENV_VALIDATION: '1' }, PHASE_PRODUCTION_BUILD)).toBe('skip')
  })

  it('build: env umuman bo‘lmasa ham xato bermaydi, default’larni qo‘llaydi', () => {
    const env = parseEnv({}, 'build')
    expect(env.DATABASE_URL).toBeUndefined()
    expect(env.PAYLOAD_SECRET).toBeUndefined()
    expect(env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000')
    expect(() => parseEnv({ NEXT_PHASE: PHASE_PRODUCTION_BUILD })).not.toThrow()
  })

  it('build: berilgan qiymat formati noto‘g‘ri bo‘lsa xato beradi', () => {
    expect(() => parseEnv({ DATABASE_URL: 'mysql://x' }, 'build')).toThrow(/DATABASE_URL/)
    expect(() => parseEnv({ PAYLOAD_SECRET: 'short' }, 'build')).toThrow(/PAYLOAD_SECRET/)
  })

  it('runtime (strict): DATABASE_URL va PAYLOAD_SECRET majburiy', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*PAYLOAD_SECRET/)
  })
})
