import { describe, expect, it, vi } from 'vitest'

import { appVersion, checkHealth, handleHealthRequest, type HealthRequestDeps } from '@/lib/health'

import packageJson from '../package.json'

/** `GET /api/health` (OBLOG-23, TZ §9.4): 200 / 503, versiya, keshsiz, Sentry sinovi. */
function deps(overrides: Partial<HealthRequestDeps> = {}): HealthRequestDeps {
  return {
    ping: async () => {},
    authorize: (header) => header === 'Bearer s3cret',
    sentryEnabled: true,
    triggerSentryTest: async () => 'event-123',
    env: {},
    ...overrides,
  }
}

const url = 'http://localhost/api/health'

describe('health', () => {
  it('DB ishlaydi — 200, versiya va vaqt, keshlanmaydi', async () => {
    const response = await handleHealthRequest(new Request(url), deps())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const body = await response.json()
    expect(body).toMatchObject({ status: 'ok', db: 'ok', version: packageJson.version })
    expect(typeof body.dbLatencyMs).toBe('number')
    expect(new Date(body.time).toString()).not.toBe('Invalid Date')
  })

  it('DB xatosi — 503 (sirlar javobga chiqmaydi)', async () => {
    const error = Object.assign(
      new Error('connect ECONNREFUSED postgres://user:pass@db.example:5432'),
      { code: 'ECONNREFUSED' },
    )
    const response = await handleHealthRequest(
      new Request(url),
      deps({ ping: () => Promise.reject(error) }),
    )
    expect(response.status).toBe(503)
    const text = await response.text()
    expect(JSON.parse(text)).toMatchObject({
      status: 'error',
      db: 'error',
      dbLatencyMs: null,
      error: 'ECONNREFUSED',
    })
    expect(text).not.toContain('pass')
  })

  it('ping sinxron otsa ham — 503', async () => {
    const { httpStatus } = await checkHealth({
      ping: () => {
        throw new Error('boom')
      },
    })
    expect(httpStatus).toBe(503)
  })

  it('DB osilib qolsa — timeout bilan 503', async () => {
    vi.useFakeTimers()
    try {
      const pending = checkHealth({ ping: () => new Promise(() => {}), timeoutMs: 1_000 })
      await vi.advanceTimersByTimeAsync(1_001)
      const { httpStatus, body } = await pending
      expect(httpStatus).toBe(503)
      expect(body.error).toBe('timeout')
    } finally {
      vi.useRealTimers()
    }
  })

  it('versiya: package.json + commit (7 belgi)', () => {
    expect(appVersion({})).toBe(packageJson.version)
    expect(appVersion({ VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' })).toBe(
      `${packageJson.version}+abcdef1`,
    )
  })

  describe('?sentry-test=1', () => {
    const testUrl = `${url}?sentry-test=1`

    it('Bearer JOBS_SECRET bilan — sun’iy xato yuboriladi', async () => {
      const trigger = vi.fn(async () => 'event-123')
      const response = await handleHealthRequest(
        new Request(testUrl, { headers: { authorization: 'Bearer s3cret' } }),
        deps({ triggerSentryTest: trigger }),
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, sentry: 'sent', eventId: 'event-123' })
      expect(trigger).toHaveBeenCalledOnce()
    })

    it('tokensiz — 401, xato yuborilmaydi', async () => {
      const trigger = vi.fn(async () => 'x')
      const response = await handleHealthRequest(
        new Request(testUrl),
        deps({ triggerSentryTest: trigger }),
      )
      expect(response.status).toBe(401)
      expect(trigger).not.toHaveBeenCalled()
    })

    it('JOBS_SECRET yoki SENTRY_DSN sozlanmagan — 503', async () => {
      const auth = { headers: { authorization: 'Bearer s3cret' } }
      expect(
        (await handleHealthRequest(new Request(testUrl, auth), deps({ authorize: null }))).status,
      ).toBe(503)
      expect(
        (await handleHealthRequest(new Request(testUrl, auth), deps({ sentryEnabled: false })))
          .status,
      ).toBe(503)
    })
  })
})
