import { describe, expect, it } from 'vitest'

import { DEDUPE_MAX_DISTANCE } from '@/jobs/constants'
import { dedupeText, findClusterMatch, type DedupeCandidate } from '@/jobs/tasks/itemDedupe'
import {
  classifyText,
  computeScore,
  keywordTokens,
  matchRules,
  type KeywordRule,
} from '@/scraping/classify'
import { planAnalysisWrite } from '@/scraping/itemState'
import { cyrillicToLatin, hammingDistance, shingles, simhash, tokenize } from '@/scraping/simhash'

/** DB'siz: SimHash, klaster tanlash, klassifikatsiya va score (TASKS M2-03). */

const STORY = `OpenAI on Tuesday announced a new family of reasoning models that the company says
cut the cost of running complex agent workflows roughly in half while making fewer factual
mistakes. The models, available through the API starting today, are aimed at developers who
build long running assistants that browse the web, write and test code, and operate other
software on behalf of users. According to the company, the larger model scored higher than any
previous release on internal benchmarks for software engineering and scientific reasoning, while
the smaller model is designed for high volume tasks such as customer support and document
processing. OpenAI said both models were trained with a new safety pipeline that teaches them to
refuse clearly harmful requests and to explain uncertainty instead of guessing. Pricing starts at
two dollars per million input tokens for the smaller model. Enterprise customers will get access
to higher rate limits next month, and the models will roll out to ChatGPT subscribers over the
coming weeks, the company said in a blog post.`

describe('SimHash', () => {
  it('normallashtirish: apostroflar, kirill → lotin, URL va Markdown havolalari', () => {
    expect(tokenize("O‘zbekiston, Oʻzbekiston va O'zbekiston!")).toEqual([
      'ozbekiston',
      'ozbekiston',
      'va',
      'ozbekiston',
    ])
    // O'zbek kirill va lotin yozuvlari bir xil tokenlarga tushadi.
    expect(tokenize('Ўзбекистон ҳукумати сунъий интеллект')).toEqual(
      tokenize('Oʻzbekiston hukumati sunʼiy intellekt'),
    )
    expect(cyrillicToLatin('қишлоқ хўжалиги')).toBe('qishloq xojaligi')
    expect(tokenize('Batafsil: [maqola](https://example.com/a?b=1) https://x.uz/y')).toEqual([
      'batafsil',
      'maqola',
    ])
    expect(shingles(['a', 'b', 'c', 'd'], 3)).toEqual(['a b c', 'b c d'])
    expect(shingles(['a', 'b'], 3)).toEqual(['a', 'b'])
    expect(shingles(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('64-bit hex, deterministik; bo‘sh matn — null', () => {
    const hash = simhash(STORY)!
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
    expect(simhash(STORY)).toBe(hash)
    expect(simhash('  ...  ')).toBeNull()
    expect(hammingDistance(hash, hash)).toBe(0)
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64)
    expect(hammingDistance('0000000000000001', '0000000000000003')).toBe(1)
  })

  it('bir yangilik ikki manbada (qayta nashr, kichik tahrir, boshqa formatlash) — Hamming ≤ 3', () => {
    const syndicated = `**OpenAI** on Tuesday announced a new family of reasoning models that the company says cut
the cost of running complex agent workflows roughly in half while making fewer factual mistakes.

The models, available through the [API](https://openai.com/api) starting today, are aimed at developers who build long running assistants that browse the web, write and test code, and operate other software on behalf of users. According to the company, the larger model scored higher than any previous release on internal benchmarks for software engineering and scientific reasoning, while the smaller model is designed for high volume tasks such as customer support and document processing. OpenAI said both models were trained with a new safety pipeline that teaches them to refuse clearly harmful requests and to explain uncertainty instead of guessing. Pricing starts at two dollars per million input tokens for the smaller model. Enterprise customers will get access to higher rate limits next month, and the models will roll out to ChatGPT subscribers over the coming weeks, the company said on Tuesday in a blog post.`
    const distance = hammingDistance(simhash(STORY)!, simhash(syndicated)!)
    expect(distance).toBeLessThanOrEqual(DEDUPE_MAX_DISTANCE)
  })

  it('boshqa yangilik — Hamming > 3', () => {
    const other = `Valve has confirmed the dates for the next Counter-Strike 2 Major, which will be held in
Europe next spring with sixteen teams in the final stage. The tournament organizer said tickets for
the playoff arena will go on sale in December, and that the prize pool will again be one and a
quarter million dollars. Regional qualifiers start in January.`
    expect(hammingDistance(simhash(STORY)!, simhash(other)!)).toBeGreaterThan(DEDUPE_MAX_DISTANCE)
  })

  it('dedupeText: sarlavha + to‘liq matn, bo‘lmasa excerpt', () => {
    expect(dedupeText({ title: 'T', extractedText: 'Matn', excerpt: 'E' })).toBe('T\nMatn')
    expect(dedupeText({ title: 'T', extractedText: null, excerpt: 'E' })).toBe('T\nE')
  })
})

describe('findClusterMatch', () => {
  const hash = simhash(STORY)!
  const flip = (hex: string, bits: number) =>
    (BigInt(`0x${hex}`) ^ ((1n << BigInt(bits)) - 1n)).toString(16).padStart(16, '0')
  const candidate = (id: number, contentHash: string, extra: Partial<DedupeCandidate> = {}) => ({
    id,
    contentHash,
    clusterId: `c${id}`,
    sourceId: 1,
    canonicalUrl: `https://example.com/${id}`,
    ...extra,
  })

  it('eng yaqin (≤ 3) nomzodni tanlaydi, 4 bit — klaster emas', () => {
    const match = findClusterMatch(hash, null, [
      candidate(1, flip(hash, 3)),
      candidate(2, flip(hash, 1)),
      candidate(3, flip(hash, 4)),
    ])
    expect(match?.candidate.id).toBe(2)
    expect(match?.distance).toBe(1)
    expect(findClusterMatch(hash, null, [candidate(3, flip(hash, 4))])).toBeNull()
  })

  it('bir xil canonical URL — masofadan qat’i nazar bitta klaster', () => {
    const match = findClusterMatch(hash, 'https://example.com/9', [candidate(9, flip(hash, 20))])
    expect(match).toMatchObject({ distance: 0, candidate: { id: 9 } })
  })
})

describe('keyword qoidalari', () => {
  const rules: KeywordRule<string>[] = [
    { keyword: 'нейросет*', category: 'ai', boost: 5 },
    { keyword: 'ии', category: 'ai', boost: 5 },
    { keyword: 'искусственн* интеллект*', category: 'ai', boost: 5 },
    { keyword: 'zero-day', category: 'sec', boost: 5 },
    { keyword: 'dota 2', category: 'esports', boost: 5 },
    { keyword: 'c++', category: 'dev', boost: 4 },
    { keyword: 'gpt*', category: 'ai', boost: 5 },
  ]
  const keywords = (text: string) => matchRules(text, rules).map((r) => r.keyword)

  it('prefiks, ibora, butun so‘z, chiziqcha va maxsus belgilar', () => {
    expect(keywords('Нейросетями управляли роборукой')).toEqual(['нейросет*'])
    expect(keywords('Российская ИИ-компания')).toEqual(['ии'])
    // "ии" — butun so'z: "линии" mos kelmaydi.
    expect(keywords('Новые линии метро')).toEqual([])
    expect(keywords('Искусственного интеллекта хватит')).toEqual(['искусственн* интеллект*'])
    expect(keywords('A zero day exploit')).toEqual(['zero-day'])
    expect(keywords('Zero-Day found')).toEqual(['zero-day'])
    expect(keywords('Dota 2 Major')).toEqual(['dota 2'])
    expect(keywords('Dota 3')).toEqual([])
    expect(keywords('New C++ standard.')).toEqual(['c++'])
    expect(keywords('GPT-6 Sol')).toEqual(['gpt*'])
    expect(keywordTokens('Ёлка, «ё»!')).toEqual(['елка', 'е'])
  })
})

describe('classifyText', () => {
  const rules: KeywordRule<string>[] = [
    { keyword: 'ai', category: 'ai', boost: 5 },
    { keyword: 'llm*', category: 'ai', boost: 5 },
    { keyword: 'openai', category: 'ai', boost: 5 },
    { keyword: 'smartphone*', category: 'gadgets', boost: 4 },
    { keyword: 'iphone*', category: 'gadgets', boost: 4 },
    { keyword: 'google', category: 'tech', boost: 2 },
    { keyword: 'sponsored', category: 'gadgets', boost: -5 },
  ]

  it('bo‘lim feedi (10) — kalit so‘zlar yig‘indisi (≤ 10) uni yengolmaydi, teng bo‘lsa feed', () => {
    const result = classifyText({
      feedCategory: 'security',
      rules,
      title: 'OpenAI LLM AI leak',
    })
    expect(result.points.get('ai')).toBe(10) // 15 → cap 10
    expect(result.category).toBe('security')
    expect(result.keywordBoost).toBe(0)
  })

  it('umumiy feed (1) — kategoriyani kalit so‘zlar hal qiladi', () => {
    const result = classifyText({
      feedCategory: 'tech',
      feedWeight: 1,
      rules,
      title: 'New iPhone and smartphones from Google',
    })
    expect(Object.fromEntries(result.points)).toEqual({ tech: 3, gadgets: 8 })
    expect(result.category).toBe('gadgets')
    expect(result.keywordBoost).toBe(8)
  })

  it('kalit so‘z yo‘q — feed mapping; teglar ham hisobga olinadi', () => {
    expect(classifyText({ feedCategory: 'games', feedWeight: 1, rules, title: 'x' }).category).toBe(
      'games',
    )
    expect(
      classifyText({ feedCategory: null, rules, title: 'Launch', tags: ['AI'] }).category,
    ).toBe('ai')
    expect(classifyText({ feedCategory: null, rules, title: 'Nothing here' }).category).toBeNull()
    // Faqat manfiy boost — taklif yo'q.
    expect(classifyText({ rules, title: 'Sponsored' }).category).toBeNull()
  })
})

describe('computeScore', () => {
  const now = Date.parse('2026-09-24T12:00:00Z')

  it('priority + yangilik + klaster + kalit so‘z, 0–100 oralig‘ida', () => {
    expect(
      computeScore({
        priority: 45,
        publishedAt: new Date(now).toISOString(),
        now,
        clusterSize: 1,
        keywordBoost: 0,
      }),
    ).toEqual({ priority: 45, freshness: 25, cluster: 0, keywords: 0, total: 70 })

    const halfDay = computeScore({
      priority: 30,
      publishedAt: new Date(now - 24 * 3_600_000).toISOString(),
      now,
      clusterSize: 3,
      keywordBoost: 8,
    })
    expect(halfDay).toEqual({ priority: 30, freshness: 12.5, cluster: 10, keywords: 8, total: 61 })

    // Eski yangilik, katta klaster, chegaradan tashqari qiymatlar.
    const old = computeScore({
      priority: 99,
      publishedAt: new Date(now - 72 * 3_600_000).toISOString(),
      now,
      clusterSize: 10,
      keywordBoost: 40,
    })
    expect(old).toEqual({ priority: 50, freshness: 0, cluster: 15, keywords: 10, total: 75 })
    expect(
      computeScore({ priority: 0, publishedAt: null, now, clusterSize: 1, keywordBoost: -10 })
        .total,
    ).toBe(0)
  })
})

describe('planAnalysisWrite (muharrir holati hurmat qilinadi)', () => {
  const data = {
    contentHash: 'abc',
    clusterId: 'c1',
    score: 50,
    suggestedCategory: 3,
    status: 'duplicate' as const,
  }

  it('scraped — hammasi, duplicate holati bilan', () => {
    expect(planAnalysisWrite('scraped', data)).toEqual({ kind: 'full', data })
  })

  it('pending/error — duplicate holati qo‘yilmaydi', () => {
    const { status: _status, ...rest } = data
    expect(planAnalysisWrite('error', data)).toEqual({ kind: 'full', data: rest })
  })

  it('drafted — faqat klaster/score, kategoriya va holat o‘zgarmaydi', () => {
    expect(planAnalysisWrite('drafted', data)).toEqual({
      kind: 'content',
      data: { contentHash: 'abc', clusterId: 'c1', score: 50 },
    })
  })

  it('rejected / duplicate — hech narsa', () => {
    expect(planAnalysisWrite('rejected', data)).toEqual({ kind: 'skip' })
    expect(planAnalysisWrite('duplicate', data)).toEqual({ kind: 'skip' })
  })
})
