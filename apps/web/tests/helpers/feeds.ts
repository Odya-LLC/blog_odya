import sourcesJson from '@blog-odya/shared/seed/sources.json' with { type: 'json' }

/**
 * Lokal feed fixture'lari — testlar internetga chiqmaydi. `sources.json` dagi har bir feed URL
 * uchun RSS 2.0 (The Verge — Atom) javobi yasaladi:
 * - har feed'da 3 ta yangi maqola + 1 ta eski (> 72 soat, olinmasligi kerak);
 * - The Verge "All" feed'i boshqa Verge feed'laridagi maqolalarni takrorlaydi (feed'lar orasida
 *   dedupe);
 * - Habr havolalarida `utm_*` parametrlari va `#fragment` (normallashtirish);
 * - `ETag` beriladi, `If-None-Match` mos kelsa — `304`.
 */

interface SeedFeed {
  url: string
  isActive: boolean
}
interface SeedSource {
  slug: string
  isActive: boolean
  feeds: SeedFeed[]
}

export const SEED_SOURCES = sourcesJson as unknown as SeedSource[]

export interface FixtureItem {
  link: string
  title: string
  publishedAt: Date
}

const HOUR = 3_600_000

function feedKey(url: string): string {
  return new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export class FeedFixtures {
  readonly items = new Map<string, FixtureItem[]>()
  readonly requests: { url: string; headers: Headers }[] = []
  /** Feed URL → versiya (ETag); element qo'shilganda o'zgaradi. */
  private readonly versions = new Map<string, number>()

  constructor(now = Date.now()) {
    for (const source of SEED_SOURCES) {
      const verge = source.slug === 'the-verge'
      for (const feed of source.feeds) {
        const origin = new URL(feed.url).origin
        const key = feedKey(feed.url)
        const list: FixtureItem[] = []
        for (let i = 1; i <= 3; i++) {
          const path = `/news/${source.slug}-${key}-${i}`
          const link =
            source.slug === 'habr'
              ? `${origin}${path}/?utm_source=habr.com&utm_medium=rss&utm_campaign=${key}#habracut`
              : `${origin}${path}`
          list.push({
            link,
            title: `${source.slug} ${key} #${i}`,
            publishedAt: new Date(now - i * HOUR),
          })
        }
        list.push({
          link: `${origin}/news/${source.slug}-${key}-old`,
          title: `${source.slug} ${key} eski`,
          publishedAt: new Date(now - 10 * 24 * HOUR),
        })
        this.items.set(feed.url, list)
        this.versions.set(feed.url, 1)
      }
      if (verge) {
        // "All" feed boshqa Verge feed'laridagi birinchi maqolalarni ham o'z ichiga oladi.
        const all = source.feeds.find((f) => f.url.endsWith('/rss/index.xml'))
        if (all) {
          const extra = source.feeds
            .filter((f) => f !== all)
            .map((f) => this.items.get(f.url)![0]!)
            // Kichik farq: oxirida `/` — normallashtirishdan keyin bir xil.
            .map((item) => ({ ...item, link: `${item.link}/` }))
          this.items.get(all.url)!.push(...extra)
        }
      }
    }
  }

  /** Aktiv manbalardagi aktiv feed'lar bo'yicha kutilayotgan noyob yangi maqolalar soni. */
  expectedNewItems(sourceSlug: string): number {
    const source = SEED_SOURCES.find((s) => s.slug === sourceSlug)!
    const links = new Set<string>()
    for (const feed of source.feeds.filter((f) => f.isActive)) {
      for (const item of this.items.get(feed.url) ?? []) {
        if (item.link.includes('-old')) continue
        const url = new URL(item.link)
        links.add(url.origin + url.pathname.replace(/\/$/, ''))
      }
    }
    return links.size
  }

  addItem(feedUrl: string, item: FixtureItem): void {
    this.items.get(feedUrl)!.unshift(item)
    this.versions.set(feedUrl, (this.versions.get(feedUrl) ?? 1) + 1)
  }

  etag(feedUrl: string): string {
    return `"v${this.versions.get(feedUrl)}"`
  }

  render(feedUrl: string): string {
    const items = this.items.get(feedUrl) ?? []
    if (feedUrl.includes('theverge.com')) {
      const entries = items
        .map(
          (item) => `<entry>
  <title type="html">${escapeXml(item.title)}</title>
  <link rel="alternate" type="text/html" href="${escapeXml(item.link)}"/>
  <id>${escapeXml(item.link)}</id>
  <published>${item.publishedAt.toISOString()}</published>
  <updated>${item.publishedAt.toISOString()}</updated>
  <author><name>Verge Author</name></author>
  <summary type="html">&lt;p&gt;Summary of ${escapeXml(item.title)}&lt;/p&gt;</summary>
  <content type="html">&lt;p&gt;Body of ${escapeXml(item.title)}&lt;/p&gt;</content>
</entry>`,
        )
        .join('\n')
      return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>The Verge</title>
  <id>${escapeXml(feedUrl)}</id>
  <updated>${new Date().toISOString()}</updated>
  ${entries}
</feed>`
    }
    const rssItems = items
      .map(
        (item) => `<item>
  <title>${escapeXml(item.title)}</title>
  <link>${escapeXml(item.link)}</link>
  <guid isPermaLink="false">${escapeXml(item.link)}</guid>
  <pubDate>${item.publishedAt.toUTCString()}</pubDate>
  <dc:creator>Author</dc:creator>
  <category>News</category>
  <category>Tech</category>
  <description>&lt;p&gt;Description of ${escapeXml(item.title)}&lt;/p&gt;</description>
  <content:encoded><![CDATA[<p>Full text of ${item.title}</p>]]></content:encoded>
</item>`,
      )
      .join('\n')
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>${escapeXml(feedUrl)}</title>
  <link>${escapeXml(new URL(feedUrl).origin)}</link>
  <description>fixture</description>
  ${rssItems}
</channel>
</rss>`
  }

  /** `fetch` o'rnini bosuvchi: faqat fixture URL'lari, aks holda 404. */
  readonly fetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const headers = new Headers(init?.headers)
    this.requests.push({ url, headers })
    if (!this.items.has(url)) return new Response('not found', { status: 404 })
    const etag = this.etag(url)
    if (headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } })
    }
    return new Response(this.render(url), {
      status: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        ETag: etag,
        'Last-Modified': new Date().toUTCString(),
      },
    })
  }
}
