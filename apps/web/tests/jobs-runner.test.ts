import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { getRunDeadline } from '@/jobs/context'
import { handleJobsRunRequest, isAuthorized, runJobsWithDeadline } from '@/jobs/runner'

/** DB'siz: auth va deadline mantig'i (soxta `payload.jobs.run` va soat bilan). */

const SECRET = 's'.repeat(40)

describe('isAuthorized', () => {
  it('faqat to‘g‘ri Bearer token', () => {
    expect(isAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true)
    expect(isAuthorized(`bearer ${SECRET}`, SECRET)).toBe(true)
    expect(isAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false)
    expect(isAuthorized(`Basic ${SECRET}`, SECRET)).toBe(false)
    expect(isAuthorized('Bearer ', SECRET)).toBe(false)
    expect(isAuthorized(null, SECRET)).toBe(false)
  })
})

describe('handleJobsRunRequest: auth', () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request('http://localhost/api/jobs/run', { method: 'POST', headers })

  it('noto‘g‘ri yoki yo‘q token — 401, Payload ishga tushirilmaydi', async () => {
    const getPayload = vi.fn<() => Promise<Payload>>()
    const cases: Record<string, string>[] = [
      {},
      { Authorization: 'Bearer wrong' },
      { Authorization: SECRET },
    ]
    for (const headers of cases) {
      const response = await handleJobsRunRequest(request(headers), { getPayload, secret: SECRET })
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe('Bearer')
      expect(await response.json()).toMatchObject({ ok: false })
    }
    expect(getPayload).not.toHaveBeenCalled()
  })

  it('JOBS_SECRET sozlanmagan — 503 (endpoint yopiq)', async () => {
    const getPayload = vi.fn<() => Promise<Payload>>()
    const response = await handleJobsRunRequest(request({ Authorization: 'Bearer x' }), {
      getPayload,
      secret: undefined,
    })
    expect(response.status).toBe(503)
    expect(getPayload).not.toHaveBeenCalled()
  })
})

/** Soxta `payload.jobs` (faqat `run`). */
const asJobs = (run: (...args: never[]) => Promise<unknown>) =>
  ({ run }) as unknown as Pick<Payload['jobs'], 'run'>

/** Soxta soat: `advance` bilan vaqt o'tadi. */
function fakeClock(start = 1_000_000) {
  let now = start
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('runJobsWithDeadline', () => {
  it('navbat bo‘shaganda to‘xtaydi', async () => {
    const clock = fakeClock()
    const batches = [{ a: { status: 'success' } }, { b: { status: 'error' } }, {}]
    const run = vi.fn(async () => ({
      jobStatus: batches.shift() as never,
      remainingJobsFromQueried: 0,
    }))
    const result = await runJobsWithDeadline(asJobs(run), {
      limit: 5,
      deadlineMs: 40_000,
      now: clock.now,
    })
    expect(result).toEqual({ batches: 2, succeeded: 1, failed: 1, deadlineReached: false })
    expect(run).toHaveBeenCalledTimes(3)
    expect(run).toHaveBeenCalledWith({ queue: 'default', limit: 5 })
  })

  it('deadline’dan keyin yangi batch boshlamaydi (har batch 15 s, deadline 40 s → 3 batch)', async () => {
    const clock = fakeClock()
    const run = vi.fn(async () => {
      clock.advance(15_000)
      return { jobStatus: { x: { status: 'success' as const } }, remainingJobsFromQueried: 1 }
    })
    const result = await runJobsWithDeadline(asJobs(run), {
      limit: 10,
      deadlineMs: 40_000,
      now: clock.now,
    })
    expect(result.batches).toBe(3)
    expect(result.deadlineReached).toBe(true)
    // Oxirgi batch 30 s da boshlangan va 45 s da tugagan — 60 s dan ancha kam.
    expect(clock.now() - 1_000_000).toBeLessThan(60_000)
  })

  it('task’lar kontekstda deadline + grace ni ko‘radi', async () => {
    const clock = fakeClock()
    const seen: (number | undefined)[] = []
    const run = vi.fn(async () => {
      seen.push(getRunDeadline())
      return { jobStatus: {}, remainingJobsFromQueried: 0 }
    })
    await runJobsWithDeadline(asJobs(run), {
      limit: 1,
      deadlineMs: 40_000,
      graceMs: 10_000,
      now: clock.now,
    })
    expect(seen).toEqual([1_000_000 + 50_000])
    expect(getRunDeadline()).toBeUndefined()
  })
})
