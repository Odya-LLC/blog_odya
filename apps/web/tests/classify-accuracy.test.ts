import { readFileSync } from 'node:fs'
import path from 'node:path'

import sourcesJson from '@blog-odya/shared/seed/sources.json' with { type: 'json' }
import { sourcesSeedSchema } from '@blog-odya/shared'
import { describe, expect, it } from 'vitest'

import { classifyText } from '@/scraping/classify'

/**
 * `item.classify` aniqligi haqiqiy namunalarda (TASKS M2-03: ≥ 80%).
 *
 * `__fixtures__/classify/samples.json` — 2026-09-24 da seed feedlaridan jonli olingan 60 ta
 * yangilik (tasodifiy, manbalar bo'yicha stratifikatsiyalangan; faol manbalar), kategoriyasi qo'lda
 * belgilangan — klassifikator natijasini ko'rmasdan. `dev` — seed qoidalari/og'irliklarini
 * sozlashda ishlatilgan, `test` — sozlashdan keyin olingan nazorat to'plami (asosiy natija).
 * Qoidalar va mapping — `packages/shared/seed/sources.json` (production seed bilan bir xil).
 */

interface Sample {
  set: 'dev' | 'test'
  n: number
  source: string
  feedUrl: string
  title: string
  excerpt: string
  tags: string[]
  expected: string
}

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, '__fixtures__', 'classify', 'samples.json'), 'utf8'),
) as { samples: Sample[] }

const sources = sourcesSeedSchema.parse(sourcesJson)

function classify(sample: Sample) {
  const source = sources.find((s) => s.slug === sample.source)!
  const feed = source.feeds.find((f) => f.url === sample.feedUrl)!
  return classifyText({
    feedCategory: feed.mapsTo,
    feedWeight: feed.mappingWeight,
    rules: source.keywordRules,
    title: sample.title,
    excerpt: sample.excerpt,
    tags: sample.tags,
  }).category
}

function evaluate(set: Sample['set']) {
  const samples = fixture.samples.filter((s) => s.set === set)
  const rows = samples.map((sample) => ({ sample, got: classify(sample) }))
  const correct = rows.filter((row) => row.got === row.sample.expected).length
  return { rows, correct, total: samples.length, accuracy: correct / samples.length }
}

describe('item.classify — 30 ta real namunada aniqlik', () => {
  it('fixture: har to‘plamda 30 ta, feed va manba seed’da mavjud', () => {
    for (const set of ['dev', 'test'] as const) {
      expect(fixture.samples.filter((s) => s.set === set)).toHaveLength(30)
    }
    for (const sample of fixture.samples) {
      const source = sources.find((s) => s.slug === sample.source)
      expect(
        source?.feeds.some((f) => f.url === sample.feedUrl),
        sample.title,
      ).toBe(true)
    }
  })

  it('nazorat (test) to‘plami: ≥ 80% to‘g‘ri', () => {
    const { rows, correct, total, accuracy } = evaluate('test')
    const misses = rows
      .filter((row) => row.got !== row.sample.expected)
      .map(
        (row) =>
          `#${row.sample.n} ${row.sample.title} — kutilgan ${row.sample.expected}, olindi ${row.got}`,
      )
    console.info(`classify test: ${correct}/${total}\n${misses.join('\n')}`)
    expect(accuracy).toBeGreaterThanOrEqual(0.8)
  })

  it('sozlash (dev) to‘plami: ≥ 80% to‘g‘ri', () => {
    expect(evaluate('dev').accuracy).toBeGreaterThanOrEqual(0.8)
  })
})
