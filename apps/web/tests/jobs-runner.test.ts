import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { RUNTIME_POOL_MAX } from '@/config/database'
import {
  BATCH_START_LIMIT_MS,
  JOBS_CONCURRENCY,
  RESPONSE_BUDGET_MS,
  TASK_GRACE_MS,
} from '@/jobs/constants'
import { boundedTimeout, getRunDeadline, runWithDeadline } from '@/jobs/context'
import { handleJobsRunRequest, isAuthorized, runJobsWithDeadline } from '@/jobs/runner'
import { outOfRunTime } from '@/jobs/workflows/scrapeItem'

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
  it('navbatlar ketma-ket: default, keyin scrape; batch — ≤ JOBS_CONCURRENCY (DB pool)', async () => {
    const run = vi.fn(async () => ({ jobStatus: {}, remainingJobsFromQueried: 0 }))
    await runJobsWithDeadline(asJobs(run), {
      queues: ['default', 'scrape'],
      limit: 10,
      deadlineMs: 40_000,
    })
    expect(JOBS_CONCURRENCY).toBeLessThan(RUNTIME_POOL_MAX)
    expect(run.mock.calls).toEqual([
      [{ queue: 'default', limit: JOBS_CONCURRENCY }],
      [{ queue: 'scrape', limit: JOBS_CONCURRENCY }],
    ])

    // `jobsBatchLimit` = 1 — to'liq ketma-ket.
    run.mockClear()
    await runJobsWithDeadline(asJobs(run), { queues: ['scrape'], limit: 1, deadlineMs: 40_000 })
    expect(run.mock.calls).toEqual([[{ queue: 'scrape', limit: 1 }]])
  })

  it('10 ta scrape job — 2 tadan batch’larda, deadline har batch oralig‘ida tekshiriladi', async () => {
    const clock = fakeClock()
    let queued = 10
    const running: number[] = []
    const run = vi.fn(async ({ limit }: { limit: number }) => {
      const take = Math.min(limit, queued)
      queued -= take
      running.push(take)
      clock.advance(8_000)
      const jobStatus = Object.fromEntries(
        Array.from({ length: take }, (_, i) => [`${queued}-${i}`, { status: 'success' as const }]),
      )
      return { jobStatus, remainingJobsFromQueried: 0 }
    })
    const result = await runJobsWithDeadline(asJobs(run as never), {
      queues: ['scrape'],
      limit: 10,
      deadlineMs: 35_000,
      now: clock.now,
    })
    // 0, 8, 16, 24, 32 s da boshlangan 5 batch — 40 s da tugaydi; 10 ta birdan emas.
    expect(Math.max(...running)).toBeLessThanOrEqual(JOBS_CONCURRENCY)
    expect(result.succeeded).toBe(10)
    expect(clock.now() - 1_000_000).toBeLessThanOrEqual(35_000 + 8_000)
  })

  it('navbat bo‘shaganda to‘xtaydi', async () => {
    const clock = fakeClock()
    const batches = [{ a: { status: 'success' } }, { b: { status: 'error' } }, {}]
    const run = vi.fn(async () => ({
      jobStatus: batches.shift() as never,
      remainingJobsFromQueried: 0,
    }))
    const result = await runJobsWithDeadline(asJobs(run), {
      queues: ['default'],
      limit: 5,
      deadlineMs: 40_000,
      now: clock.now,
    })
    expect(result).toEqual({ batches: 2, succeeded: 1, failed: 1, deadlineReached: false })
    expect(run).toHaveBeenCalledTimes(3)
    expect(run).toHaveBeenCalledWith({ queue: 'default', limit: 2 })
  })

  it('deadline so‘rov boshidan (startedAt): pre-step’lar 30 s yegan bo‘lsa — faqat 1 batch', async () => {
    const clock = fakeClock()
    const startedAt = clock.now()
    clock.advance(30_000) // sovuq start + settings/stale/enqueue
    const seen: (number | undefined)[] = []
    const run = vi.fn(async () => {
      seen.push(getRunDeadline())
      clock.advance(8_000)
      return { jobStatus: { x: { status: 'success' as const } }, remainingJobsFromQueried: 0 }
    })
    const result = await runJobsWithDeadline(asJobs(run), {
      queues: ['default'],
      limit: 2,
      startedAt,
      deadlineMs: 35_000,
      graceMs: 10_000,
      now: clock.now,
    })
    expect(result).toMatchObject({ batches: 1, deadlineReached: true })
    // Task'lar chegarasi ham so'rov boshidan: 35 + 10 = 45 s (pre-step'lardan keyin emas).
    expect(seen).toEqual([startedAt + 45_000])
  })

  it('pre-step’lar deadline’ni yeb qo‘ygan — birorta ham batch boshlanmaydi', async () => {
    const clock = fakeClock()
    const startedAt = clock.now()
    clock.advance(36_000)
    const run = vi.fn(async () => ({ jobStatus: {}, remainingJobsFromQueried: 0 }))
    const result = await runJobsWithDeadline(asJobs(run), {
      queues: ['default', 'scrape'],
      limit: 2,
      startedAt,
      deadlineMs: 35_000,
      now: clock.now,
    })
    expect(run).not.toHaveBeenCalled()
    expect(result).toEqual({ batches: 0, succeeded: 0, failed: 0, deadlineReached: true })
  })

  it('deadline’dan keyin yangi batch boshlamaydi (har batch 15 s, deadline 40 s → 3 batch)', async () => {
    const clock = fakeClock()
    const run = vi.fn(async () => {
      clock.advance(15_000)
      return { jobStatus: { x: { status: 'success' as const } }, remainingJobsFromQueried: 1 }
    })
    const result = await runJobsWithDeadline(asJobs(run), {
      queues: ['default'],
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
      queues: ['default'],
      limit: 1,
      deadlineMs: 40_000,
      graceMs: 10_000,
      now: clock.now,
    })
    expect(seen).toEqual([1_000_000 + 50_000])
    expect(getRunDeadline()).toBeUndefined()
  })
})

describe('vaqt byudjeti (Vercel maxDuration = 60 s)', () => {
  it('oxirgi batch + grace + yakuniy ish ≤ javob byudjeti, sovuq start uchun ≥ 10 s zaxira', () => {
    expect(BATCH_START_LIMIT_MS).toBe(35_000)
    expect(BATCH_START_LIMIT_MS + TASK_GRACE_MS).toBeLessThan(RESPONSE_BUDGET_MS)
    expect(60_000 - RESPONSE_BUDGET_MS).toBeGreaterThanOrEqual(10_000)
  })

  it('boundedTimeout: run deadline’igacha qolgan vaqtdan oshmaydi; kontekstsiz — max', async () => {
    expect(boundedTimeout(10_000)).toBe(10_000)
    const now = 5_000_000
    await runWithDeadline({ taskDeadlineAt: now + 4_000 }, async () => {
      expect(boundedTimeout(10_000, 1_000, now)).toBe(4_000)
      expect(boundedTimeout(10_000, 1_000, now + 3_900)).toBe(1_000)
      expect(boundedTimeout(2_000, 1_000, now)).toBe(2_000)
    })
  })

  it('scrapeItem: keyingi bosqich uchun < 5 s qolsa — to‘xtaydi; kontekstsiz — hech qachon', async () => {
    expect(outOfRunTime()).toBe(false)
    const now = 5_000_000
    await runWithDeadline({ taskDeadlineAt: now + 6_000 }, async () => {
      expect(outOfRunTime(now)).toBe(false)
      expect(outOfRunTime(now + 1_500)).toBe(true)
    })
  })
})
