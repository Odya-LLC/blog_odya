import { describe, expect, it } from 'vitest'
import categoriesJson from '../seed/categories.json'
import sourcesJson from '../seed/sources.json'
import { categoriesSeedSchema, findUnknownCategoryRefs, sourceSchema, sourcesSeedSchema } from '../src'

/** TZ §10.4 jadvali — manba haqiqati. */
const TZ_CATEGORIES = [
  { order: 1, slug: 'suniy-intellekt', latn: "Sun'iy intellekt", cyrl: 'Сунъий интеллект', menu: true },
  { order: 2, slug: 'texnologiyalar', latn: 'Texnologiyalar', cyrl: 'Технологиялар', menu: true },
  { order: 3, slug: 'gadjetlar', latn: 'Gadjetlar', cyrl: 'Гаджетлар', menu: true },
  { order: 4, slug: 'dasturlash', latn: 'Dasturlash', cyrl: 'Дастурлаш', menu: true },
  { order: 5, slug: 'kiberxavfsizlik', latn: 'Kiberxavfsizlik', cyrl: 'Киберхавфсизлик', menu: true },
  { order: 6, slug: 'kibersport', latn: 'Kibersport', cyrl: 'Киберспорт', menu: true },
  { order: 7, slug: 'oyinlar', latn: "O'yinlar", cyrl: 'Ўйинлар', menu: true },
  { order: 8, slug: 'startaplar', latn: 'Startaplar va biznes', cyrl: 'Стартаплар ва бизнес', menu: true },
  { order: 9, slug: 'ilm-fan', latn: 'Ilm-fan', cyrl: 'Илм-фан', menu: false },
]

/** TZ §2.2 — tasdiqlangan manbalar (Dexerto va HLTV alohida yozuv, chunki domen/robots/rate limit har xil). */
const APPROVED_SOURCES = ['the-verge', 'techcrunch', 'habr', 'ixbt', 'dexerto', 'hltv']

const MIN_RULES_PER_CATEGORY = 5

describe('categories.json', () => {
  const categories = categoriesSeedSchema.parse(categoriesJson)

  it('Zod sxemasidan o‘tadi', () => {
    expect(categories).toHaveLength(9)
  })

  it('TZ §10.4 jadvaliga aynan mos (slug, nomlar, tartib, menyu)', () => {
    const actual = [...categories]
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ order: c.order, slug: c.slug, latn: c.name['uz-Latn'], cyrl: c.name['uz-Cyrl'], menu: c.isInMenu }))
    expect(actual).toEqual(TZ_CATEGORIES)
  })

  it('tekis ro‘yxat — parent yo‘q', () => {
    expect(categories.every((c) => c.parent === null)).toBe(true)
  })
})

describe('sources.json', () => {
  const sources = sourcesSeedSchema.parse(sourcesJson)
  const categorySlugs = categoriesSeedSchema.parse(categoriesJson).map((c) => c.slug)

  it('Zod sxemasidan o‘tadi', () => {
    expect(sources.length).toBeGreaterThanOrEqual(APPROVED_SOURCES.length)
  })

  it('TZ §2.2 dagi barcha tasdiqlangan manbalar faol', () => {
    const active = sources.filter((s) => s.isActive).map((s) => s.slug)
    expect(active.sort()).toEqual([...APPROVED_SOURCES].sort())
  })

  it('barcha mapsTo / keywordRules.category mavjud kategoriyaga ishora qiladi', () => {
    expect(findUnknownCategoryRefs(sources, categorySlugs)).toEqual([])
  })

  it('har bir manbada kamida bitta faol feed bor', () => {
    for (const s of sources) expect(s.feeds.some((f) => f.isActive), s.slug).toBe(true)
  })

  it('9 kategoriyaning har biri kamida bitta faol feed orqali to‘ldiriladi', () => {
    const covered = new Set(
      sources.filter((s) => s.isActive).flatMap((s) => s.feeds.filter((f) => f.isActive).map((f) => f.mapsTo)),
    )
    expect([...covered].sort()).toEqual([...categorySlugs].sort())
  })

  it(`har bir manbada har bir kategoriya uchun kamida ${MIN_RULES_PER_CATEGORY} ta kalit so‘z qoidasi`, () => {
    for (const s of sources) {
      for (const slug of categorySlugs) {
        const n = s.keywordRules.filter((r) => r.category === slug).length
        expect(n, `${s.slug} → ${slug}`).toBeGreaterThanOrEqual(MIN_RULES_PER_CATEGORY)
      }
    }
  })

  it('rateLimitSec TZ §2.3 bo‘yicha ≥ 5 s, Habr uchun robots Crawl-delay (10 s) hurmat qilinadi', () => {
    for (const s of sources) expect(s.rateLimitSec).toBeGreaterThanOrEqual(5)
    expect(sources.find((s) => s.slug === 'habr')?.rateLimitSec).toBeGreaterThanOrEqual(10)
  })

  it('Habr: faqat "Новости" feedlari (UGC maqolalar emas)', () => {
    const habr = sources.find((s) => s.slug === 'habr')!
    for (const f of habr.feeds) expect(f.url).toMatch(/\/news\/$/)
  })
})

describe('sourceSchema — noto‘g‘ri ma’lumotni rad etadi', () => {
  const valid = sourcesSeedSchema.parse(sourcesJson).find((s) => s.slug === 'habr')!

  it('rss_plus_page selectors’siz', () => {
    expect(sourceSchema.safeParse({ ...valid, selectors: null }).success).toBe(false)
  })

  it('noma’lum fetchMode', () => {
    expect(sourceSchema.safeParse({ ...valid, fetchMode: 'full_scrape' }).success).toBe(false)
  })

  it('priority 0–50 oralig‘idan tashqari', () => {
    expect(sourceSchema.safeParse({ ...valid, priority: 51 }).success).toBe(false)
  })

  it('boshqa domendagi feed', () => {
    const feeds = [{ ...valid.feeds[0]!, url: 'https://example.com/rss' }]
    expect(sourceSchema.safeParse({ ...valid, feeds }).success).toBe(false)
  })

  it('katta harfli keyword', () => {
    const keywordRules = [{ keyword: 'OpenAI', category: 'suniy-intellekt', boost: 5 }]
    expect(sourceSchema.safeParse({ ...valid, keywordRules }).success).toBe(false)
  })

  it('http (https emas) URL', () => {
    expect(sourceSchema.safeParse({ ...valid, homepageUrl: 'http://habr.com' }).success).toBe(false)
  })
})
