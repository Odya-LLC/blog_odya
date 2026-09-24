import { describe, expect, it } from 'vitest'

import { type AlertSnapshot, evaluateAlerts, planAlerts } from '@/jobs/alerts'
import { ALERT_THRESHOLDS, ALERT_THROTTLE_MS } from '@/jobs/constants'
import { type BucketLister, measureBuckets } from '@/jobs/storageSize'
import { escapeTelegramHtml, sendTelegramMessage, TelegramError } from '@/lib/telegram'

/** DB'siz: ogohlantirish chegaralari, takrorlanmaslik, Telegram va R2 o'lchovi (TASKS M2-03). */

const MB = 1024 * 1024
const GB = 1024 * MB

const base: AlertSnapshot = { sources: [], items: [], dbBytes: null, r2Bytes: null }
const keys = (snapshot: Partial<AlertSnapshot>) =>
  evaluateAlerts({ ...base, ...snapshot }).map((c) => c.key)

describe('evaluateAlerts — chegaralar', () => {
  it('manba: 3 marta ketma-ket xato — ha, 2 — yo‘q', () => {
    const source = (id: number, consecutiveFailures: number) => ({
      id,
      name: `S${id}`,
      consecutiveFailures,
      lastError: 'HTTP 503',
    })
    expect(keys({ sources: [source(1, 2), source(2, 3), source(3, 7)] })).toEqual([
      'source-failing:2',
      'source-failing:3',
    ])
    const [condition] = evaluateAlerts({ ...base, sources: [source(2, 3)] })
    expect(condition!.message).toContain('«S2»')
    expect(condition!.message).toContain('HTTP 503')
  })

  it('24 soatlik muvaffaqiyat < 80% (kamida 5 ta yakunlangan element)', () => {
    const stats = (id: number, finished: number, failed: number) => ({
      id,
      name: `S${id}`,
      finished,
      failed,
    })
    expect(
      keys({
        items: [
          stats(1, 10, 2), // 80% — chegarada, ogohlantirish yo'q
          stats(2, 10, 3), // 70%
          stats(3, 4, 4), // namuna kichik
          stats(4, 5, 2), // 60%
        ],
      }),
    ).toEqual(['source-success-rate:2', 'source-success-rate:4'])
  })

  it('DB ≥ 70% (350 MB) va R2 ≥ 8 GB', () => {
    expect(ALERT_THRESHOLDS.dbLimitBytes * ALERT_THRESHOLDS.dbWarnRatio).toBe(350 * MB)
    expect(keys({ dbBytes: 349 * MB, r2Bytes: 8 * GB - 1 })).toEqual([])
    expect(keys({ dbBytes: 350 * MB, r2Bytes: 8 * GB })).toEqual(['db-size', 'r2-size'])
    const [db] = evaluateAlerts({ ...base, dbBytes: 400 * MB })
    expect(db!.message).toContain('400 MB')
    expect(db!.message).toContain('80%')
  })
})

describe('planAlerts — takrorlanmaslik', () => {
  const now = Date.parse('2026-09-24T12:00:00Z')
  const condition = { key: 'db-size', message: 'DB' }

  it('yangi shart — yuboriladi; 24 soat ichida — yo‘q; 24 soatdan keyin — eslatma', () => {
    expect(planAlerts([condition], {}, now).send).toEqual([condition])
    const state = (ago: number) => ({
      'db-size': { sentAt: new Date(now - ago).toISOString(), via: 'log' as const, message: 'DB' },
    })
    expect(planAlerts([condition], state(10 * 60_000), now).send).toEqual([])
    expect(planAlerts([condition], state(ALERT_THROTTLE_MS - 1), now).send).toEqual([])
    expect(planAlerts([condition], state(ALERT_THROTTLE_MS), now).send).toEqual([condition])
  })

  it('hal bo‘lgan shart holatdan o‘chiriladi (keyingi safar darhol yuboriladi)', () => {
    const state = {
      'r2-size': { sentAt: new Date(now).toISOString(), via: 'telegram' as const, message: 'R2' },
    }
    expect(planAlerts([], state, now)).toEqual({ send: [], resolved: ['r2-size'] })
  })
})

describe('sendTelegramMessage', () => {
  it('Bot API sendMessage (HTML), xato matnida token yo‘q', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    const ok: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      return Response.json({ ok: true })
    }
    await sendTelegramMessage({ token: 'T0KEN', chatId: '-100', text: 'Salom', fetchImpl: ok })
    expect(calls[0]!.url).toBe('https://api.telegram.org/botT0KEN/sendMessage')
    expect(calls[0]!.body).toMatchObject({ chat_id: '-100', text: 'Salom', parse_mode: 'HTML' })

    const bad: typeof fetch = async () =>
      Response.json({ ok: false, description: 'chat not found' }, { status: 400 })
    await expect(
      sendTelegramMessage({ token: 'T0KEN', chatId: 'x', text: 'y', fetchImpl: bad }),
    ).rejects.toThrow('Telegram: HTTP 400 — chat not found')

    const network: typeof fetch = async () => {
      throw new Error('connect ECONNREFUSED https://api.telegram.org/botT0KEN/sendMessage')
    }
    const error = await sendTelegramMessage({
      token: 'T0KEN',
      chatId: 'x',
      text: 'y',
      fetchImpl: network,
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TelegramError)
    expect((error as Error).message).not.toContain('T0KEN')
    expect(escapeTelegramHtml('<b>&</b>')).toBe('&lt;b&gt;&amp;&lt;/b&gt;')
  })
})

describe('measureBuckets (R2 hajmi)', () => {
  /** Har bucket: sahifalar ro'yxati (obyekt hajmlari). */
  function fakeLister(pages: Record<string, number[][]>, onCall?: () => void): BucketLister {
    return {
      async listPage(bucket, token) {
        onCall?.()
        const index = token ? Number(token) : 0
        const page = pages[bucket]![index]!
        return {
          bytes: page.reduce((a, b) => a + b, 0),
          objects: page.length,
          nextToken: index + 1 < pages[bucket]!.length ? String(index + 1) : undefined,
        }
      },
    }
  }

  it('sahifalab yig‘adi (media + arxiv)', async () => {
    const result = await measureBuckets(
      fakeLister({ media: [[10, 20], [30]], raw: [[5]] }),
      ['media', 'raw', 'media'],
      { deadlineAt: Number.POSITIVE_INFINITY },
    )
    expect(result).toMatchObject({ bytes: 65, objects: 4, complete: true })
    expect(result.buckets.map((b) => [b.name, b.bytes, b.complete])).toEqual([
      ['media', 60, true],
      ['raw', 5, true],
    ])
  })

  it('vaqt byudjeti tugasa — to‘xtaydi, complete: false (pastki chegara)', async () => {
    let clock = 0
    const result = await measureBuckets(
      fakeLister({ media: [[1], [1], [1], [1]], raw: [[1]] }, () => (clock += 5)),
      ['media', 'raw'],
      { deadlineAt: 10, now: () => clock },
    )
    expect(result.complete).toBe(false)
    expect(result.bytes).toBe(2)
    expect(result.buckets[1]).toMatchObject({ name: 'raw', objects: 0, complete: false })
  })
})
