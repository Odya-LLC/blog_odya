import { describe, expect, it } from 'vitest'

import { limitsFromEnv, parseEnv, PHASE_PRODUCTION_BUILD, resolveEnvMode } from '@/env.schema'

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

describe('env: migratsiya rejimida faqat DB majburiy (OBLOG-34)', () => {
  const PROD_MIGRATE = {
    PAYLOAD_MIGRATING: 'true',
    DATABASE_URL:
      'postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
    DATABASE_URL_DIRECT:
      'postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
  }

  it('PAYLOAD_MIGRATING=true → migrate rejimi (build va skip ustun)', () => {
    expect(resolveEnvMode({ PAYLOAD_MIGRATING: 'true' })).toBe('migrate')
    expect(resolveEnvMode({ PAYLOAD_MIGRATING: 'false' })).toBe('strict')
    expect(resolveEnvMode({ PAYLOAD_MIGRATING: 'true' }, PHASE_PRODUCTION_BUILD)).toBe('build')
    expect(resolveEnvMode({ PAYLOAD_MIGRATING: 'true', SKIP_ENV_VALIDATION: '1' })).toBe('skip')
  })

  it('PAYLOAD_SECRET va S3_* bo‘lmasa ham xato bermaydi (GitHub migrate-prod workflow)', () => {
    const env = parseEnv(PROD_MIGRATE)
    expect(env.DATABASE_URL_DIRECT).toBe(PROD_MIGRATE.DATABASE_URL_DIRECT)
    expect(env.PAYLOAD_SECRET).toBeUndefined()
    expect(env.S3_BUCKET).toBeUndefined()
    expect(env.S3_ENDPOINT).toBeUndefined()
    expect(env.S3_REGION).toBe('auto')
  })

  it('DATABASE_URL majburiy, berilgan qiymatlar formati tekshiriladi', () => {
    expect(() => parseEnv({ PAYLOAD_MIGRATING: 'true' })).toThrow(/\(migrate\)[\s\S]*DATABASE_URL/)
    expect(() => parseEnv({ ...PROD_MIGRATE, DATABASE_URL_DIRECT: 'mysql://x' })).toThrow(
      /DATABASE_URL_DIRECT/,
    )
    expect(() => parseEnv({ ...PROD_MIGRATE, PAYLOAD_SECRET: 'short' })).toThrow(/PAYLOAD_SECRET/)
    expect(() => parseEnv({ ...PROD_MIGRATE, S3_ENDPOINT: 'not-a-url' })).toThrow(/S3_ENDPOINT/)
  })

  it('runtime (migratsiyasiz) — PAYLOAD_SECRET va S3 hali ham majburiy', () => {
    const { PAYLOAD_MIGRATING: _, ...runtime } = PROD_MIGRATE
    expect(() => parseEnv(runtime)).toThrow(/PAYLOAD_SECRET[\s\S]*S3_ENDPOINT/)
  })
})

describe('env: API kalit va MCP yuklash limitlari (OBLOG-45)', () => {
  it('berilmagan, bo‘sh yoki 0 — standart qiymatlar (60/daqiqa, 30/soat)', () => {
    for (const value of [undefined, '', '0']) {
      const env = parseEnv({
        ...base,
        API_KEY_RATE_LIMIT_PER_MIN: value,
        MCP_MEDIA_UPLOADS_PER_HOUR: value,
      })
      expect(env.API_KEY_RATE_LIMIT_PER_MIN).toBe(60)
      expect(env.MCP_MEDIA_UPLOADS_PER_HOUR).toBe(30)
    }
    expect(limitsFromEnv({})).toEqual({ apiKeyPerMin: 60, mediaUploadsPerHour: 30 })
  })

  it('musbat butun sonni qabul qiladi', () => {
    const env = parseEnv({
      ...base,
      API_KEY_RATE_LIMIT_PER_MIN: '120',
      MCP_MEDIA_UPLOADS_PER_HOUR: '100',
    })
    expect(env.API_KEY_RATE_LIMIT_PER_MIN).toBe(120)
    expect(env.MCP_MEDIA_UPLOADS_PER_HOUR).toBe(100)
    expect(
      limitsFromEnv({ API_KEY_RATE_LIMIT_PER_MIN: '120', MCP_MEDIA_UPLOADS_PER_HOUR: ' 100 ' }),
    ).toEqual({ apiKeyPerMin: 120, mediaUploadsPerHour: 100 })
  })

  it('manfiy, kasr yoki matn — xato (limitsFromEnv esa standartga qaytadi)', () => {
    expect(() => parseEnv({ ...base, API_KEY_RATE_LIMIT_PER_MIN: '-5' })).toThrow(
      /API_KEY_RATE_LIMIT_PER_MIN/,
    )
    expect(() => parseEnv({ ...base, MCP_MEDIA_UPLOADS_PER_HOUR: '1.5' })).toThrow(
      /MCP_MEDIA_UPLOADS_PER_HOUR/,
    )
    expect(() => parseEnv({ ...base, MCP_MEDIA_UPLOADS_PER_HOUR: 'many' })).toThrow(
      /MCP_MEDIA_UPLOADS_PER_HOUR/,
    )
    expect(limitsFromEnv({ API_KEY_RATE_LIMIT_PER_MIN: '-5' }).apiKeyPerMin).toBe(60)
  })
})
