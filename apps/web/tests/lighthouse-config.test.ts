import { createRequire } from 'node:module'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { SEED_POSTS } from '@/seed/data'

const require = createRequire(import.meta.url)
const CONFIG = '../lighthouserc.cjs'

type LhciConfig = {
  ci: {
    collect: { url: string[]; settings: { skipAudits: string[]; extraHeaders?: string } }
    assert: { assertions: Record<string, [string, Record<string, number>]> }
  }
}

function load(env: Record<string, string | undefined> = {}): LhciConfig {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string)
  delete require.cache[require.resolve(CONFIG)]
  return require(CONFIG) as LhciConfig
}

/** Lighthouse CI sozlamasi (M1-07): URL'lar demo seed bilan mos, chegaralar TZ §8.4 bo'yicha. */
describe('lighthouserc.cjs', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('standart URL’lar: bosh sahifa, demo maqola va kategoriya (seed bilan mos)', () => {
    const { url } = load({ LHCI_BASE_URL: 'http://localhost:3100/' }).ci.collect
    expect(url[0]).toBe('http://localhost:3100/')
    const featured = SEED_POSTS.find((post) => post.isFeatured)!
    expect(url).toContain(`http://localhost:3100/${featured.category}/${featured.slug}`)
    const category = url[2]!.replace('http://localhost:3100/', '')
    expect(SEED_POSTS.some((post) => post.category === category)).toBe(true)
  })

  it('chegaralar: performance ≥ 0.9, SEO = 1, a11y ≥ 0.9, JS ≤ 150 KB', () => {
    const { assertions } = load().ci.assert
    expect(assertions['categories:performance']?.[1]).toEqual({ minScore: 0.9 })
    expect(assertions['categories:seo']?.[1]).toEqual({ minScore: 1 })
    expect(assertions['categories:accessibility']?.[1]).toEqual({ minScore: 0.9 })
    expect(assertions['resource-summary:script:size']?.[1]).toEqual({
      maxNumericValue: 150 * 1024,
    })
  })

  it('preview: faqat is-crawlable o‘tkaziladi; bypass sarlavhasi', () => {
    expect(load().ci.collect.settings.skipAudits).toEqual([])
    const preview = load({
      LHCI_PREVIEW: '1',
      VERCEL_AUTOMATION_BYPASS_SECRET: 'sir',
      LHCI_PATHS: '/,/a/b',
    }).ci.collect
    expect(preview.settings.skipAudits).toEqual(['is-crawlable'])
    expect(JSON.parse(preview.settings.extraHeaders!)).toMatchObject({
      'x-vercel-protection-bypass': 'sir',
    })
    expect(preview.url).toHaveLength(2)
  })
})
