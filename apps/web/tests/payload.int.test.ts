import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { RUNTIME_POOL_MAX } from '@/config/database'
import { env } from '@/env'

import { initTestPayload } from './helpers/payload'

/**
 * Integratsion test: Postgres kerak (lokal — infra/docker-compose.dev.yml, CI — service container).
 */
let payload: Payload

describe('Payload + Postgres', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
  })

  afterAll(async () => {
    await payload?.db?.destroy?.()
  })

  it('users kolleksiyasini o‘qiydi', async () => {
    const users = await payload.find({ collection: 'users', limit: 1 })
    expect(users.docs).toBeInstanceOf(Array)
  })

  it('migratsiyalar qo‘llangan', async () => {
    const result = await payload.find({ collection: 'payload-migrations', limit: 100 })
    const names = result.docs.map((doc) => doc.name ?? '')
    expect(names.some((name) => name.endsWith('_initial'))).toBe(true)
    expect(names.some((name) => name.endsWith('_m1_01_payload_setup'))).toBe(true)
    expect(names.some((name) => name.endsWith('_m1_02_content'))).toBe(true)
  })

  it('runtime ulanishi DATABASE_URL (pooler) orqali, kichik pool bilan', () => {
    const { poolOptions } = payload.db as unknown as {
      poolOptions: { connectionString?: string; max?: number }
    }
    expect(poolOptions.connectionString).toBe(env.DATABASE_URL)
    expect(poolOptions.max).toBe(RUNTIME_POOL_MAX)
  })

  it('localization: uz-Latn (default) va uz-Cyrl, fallback yoqilgan', () => {
    const { localization } = payload.config
    expect(localization && localization.localeCodes).toEqual(['uz-Latn', 'uz-Cyrl'])
    expect(localization && localization.defaultLocale).toBe('uz-Latn')
    expect(localization && localization.fallback).toBe(true)
  })

  it('admin panel tili — o‘zbekcha', () => {
    const { i18n } = payload.config
    expect(i18n.fallbackLanguage).toBe('uz')
    expect(Object.keys(i18n.supportedLanguages)).toEqual(['uz'])
    const uz = (
      i18n.supportedLanguages as Record<
        string,
        { translations: Record<string, Record<string, unknown>> }
      >
    ).uz
    expect(uz.translations.authentication.login).toBe('Kirish')
    expect(uz.translations.general.save).toBe('Saqlash')
  })
})
