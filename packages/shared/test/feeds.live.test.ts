/**
 * Jonli feed tekshiruvi — CI'da O'CHIQ, qo'lda ishga tushiriladi:
 *   pnpm --filter @blog-odya/shared check:feeds
 *   (yoki root darajasida: pnpm check:feeds)
 *
 * Har bir feed uchun: HTTP 200, XML content-type, rss-parser bilan parse, ≥ 1 yozuv,
 * robots.txt ruxsati (OdyaBlogBot/1.0). `rss_plus_page` manbalar uchun — birinchi maqola
 * sahifasi server HTML beradi va `selectors.content` yetarli matn qaytaradi.
 * Domen bo'yicha so'rovlar orasida `rateLimitSec` pauza qilinadi (TZ §2.3).
 */
import { parseHTML } from 'linkedom'
import robotsParser from 'robots-parser'
import Parser from 'rss-parser'
import { describe, expect, it } from 'vitest'
import sourcesJson from '../seed/sources.json'
import { sourcesSeedSchema, type SourceSeed } from '../src'

const RUN = process.env.RUN_FEED_CHECKS === '1'
const UA = 'OdyaBlogBot/1.0 (+https://blog.odya.uz/bot)'
const UA_TOKEN = 'OdyaBlogBot'
const MIN_PAGE_TEXT = 300

/**
 * Cloudflare managed challenge'i ma'lum bo'lgan manbalar (docs/sources.md §3.5b, ochiq masala #2).
 * Ular uchun challenge (403 + `cf-mitigated: challenge`) PASS emas, balki ogohlantirish bilan SKIP
 * sifatida ko'rsatiladi. Challenge chetlab o'tilmaydi. Boshqa har qanday xato — FAIL.
 */
const KNOWN_CLOUDFLARE_CHALLENGE = new Set(['hltv'])

const sources = sourcesSeedSchema.parse(sourcesJson)
const lastRequestAt = new Map<string, number>()

async function politeFetch(url: string, source: SourceSeed): Promise<Response> {
  const host = new URL(url).host
  const wait = (lastRequestAt.get(host) ?? 0) + source.rateLimitSec * 1000 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt.set(host, Date.now())
  return fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept:
        'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  })
}

/** Habr RSS havolalaridagi utm_* parametrlari robots.txt'da yopiq — yuklashdan oldin olib tashlanadi. */
function stripTracking(url: string): string {
  const u = new URL(url)
  for (const k of [...u.searchParams.keys()]) if (k.startsWith('utm_')) u.searchParams.delete(k)
  return u.toString()
}

type Robots = ReturnType<typeof robotsParser> | null
async function loadRobots(source: SourceSeed, origin: string): Promise<Robots> {
  const res = await politeFetch(`${origin}/robots.txt`, source)
  if (res.status !== 200) {
    console.warn(
      `[${source.slug}] robots.txt HTTP ${res.status} — tekshirib bo'lmadi (ehtiyotkor rejim: rss_only bo'lishi kerak)`,
    )
    return null
  }
  return robotsParser(`${origin}/robots.txt`, await res.text())
}

describe.skipIf(!RUN).concurrent('RSS feedlar (jonli)', () => {
  for (const source of sources) {
    it(`${source.name}`, { timeout: 300_000 }, async (ctx) => {
      const parser = new Parser()
      const robotsByOrigin = new Map<string, Robots>()
      const report: string[] = []
      let firstLink: string | undefined

      for (const feed of source.feeds) {
        const origin = new URL(feed.url).origin
        if (!robotsByOrigin.has(origin))
          robotsByOrigin.set(origin, await loadRobots(source, origin))
        const robots = robotsByOrigin.get(origin)
        if (robots)
          expect(robots.isAllowed(feed.url, UA_TOKEN), `robots: ${feed.url}`).not.toBe(false)
        // robots.txt o'qilmasa sahifalarni yuklash mumkin emas
        else expect(source.fetchMode, `${source.slug}: robots.txt tekshirilmadi`).toBe('rss_only')

        const res = await politeFetch(feed.url, source)
        if (
          res.status === 403 &&
          res.headers.get('cf-mitigated') === 'challenge' &&
          KNOWN_CLOUDFLARE_CHALLENGE.has(source.slug)
        ) {
          console.warn(
            `[${source.slug}] SKIP: ${feed.url} — Cloudflare challenge (403). Qo'lda tekshiring (docs/sources.md §8 #2).`,
          )
          ctx.skip()
        }
        expect(res.status, feed.url).toBe(200)
        expect(res.headers.get('content-type') ?? '', feed.url).toMatch(/xml/)
        const parsed = await parser.parseString(await res.text())
        if (feed.isActive) expect(parsed.items.length, `${feed.url} bo'sh`).toBeGreaterThan(0)
        const latest = parsed.items[0]?.isoDate ?? parsed.items[0]?.pubDate ?? '—'
        report.push(
          `  ${res.status} items=${parsed.items.length} latest=${latest} active=${feed.isActive} ${feed.url}`,
        )
        firstLink ??= parsed.items.find((i) => i.link)?.link
      }

      if (source.fetchMode === 'rss_plus_page') {
        expect(firstLink, 'maqola havolasi topilmadi').toBeTruthy()
        const pageUrl = stripTracking(firstLink!)
        const robots = robotsByOrigin.get(new URL(pageUrl).origin)
        if (robots)
          expect(robots.isAllowed(pageUrl, UA_TOKEN), `robots: ${pageUrl}`).not.toBe(false)
        const res = await politeFetch(pageUrl, source)
        expect(res.status, pageUrl).toBe(200)
        const { document } = parseHTML(await res.text())
        const text =
          document
            .querySelector(source.selectors!.content)
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() ?? ''
        expect(text.length, `${source.selectors!.content} @ ${pageUrl}`).toBeGreaterThanOrEqual(
          MIN_PAGE_TEXT,
        )
        report.push(`  page 200 "${source.selectors!.content}" chars=${text.length} ${pageUrl}`)
      }

      console.log(`[${source.slug}] fetchMode=${source.fetchMode}\n${report.join('\n')}`)
    })
  }
})
