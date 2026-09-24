import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'

import { FEED_REWRITES } from '@/site/seo/rewrites'
import { robotsConfig } from '@/site/seo/robots'
import { feedPath, rfc822Date, rssXml } from '@/site/seo/rss'
import {
  isWithinNewsWindow,
  localizedSitemapUrls,
  monthKey,
  monthRange,
  NEWS_NS,
  newsSitemapXml,
  newsWindowStart,
  parseSitemapFile,
  SITEMAP_NS,
  sitemapFileUrl,
  sitemapIndexXml,
  urlsetXml,
  XHTML_NS,
  xmlEscape,
} from '@/site/seo/sitemap'

const ORIGIN = 'https://blog.odya.uz'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  isArray: (name) => ['url', 'sitemap', 'xhtml:link', 'item'].includes(name),
})

function parse(xml: string) {
  const valid = XMLValidator.validate(xml)
  expect(valid).toBe(true)
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  return parser.parse(xml)
}

type XmlUrl = {
  loc: string
  lastmod?: string
  'xhtml:link'?: Array<{ '@rel': string; '@hreflang': string; '@href': string }>
}

/** Har bir `<url>` o'zini va barcha muqobillarini ko'rsatadi; juftliklar o'zaro bir xil. */
function expectReciprocalHreflang(urls: XmlUrl[]) {
  const byLoc = new Map(urls.map((url) => [url.loc, url]))
  for (const url of urls) {
    const links = url['xhtml:link'] ?? []
    expect(links.every((link) => link['@rel'] === 'alternate')).toBe(true)
    const map = Object.fromEntries(links.map((link) => [link['@hreflang'], link['@href']]))
    expect(Object.keys(map).sort()).toEqual(['uz-Cyrl', 'uz-Latn', 'x-default'])
    expect(Object.values(map)).toContain(url.loc)
    expect(map['x-default']).toBe(map['uz-Latn'])
    for (const hreflang of ['uz-Latn', 'uz-Cyrl']) {
      const other = byLoc.get(map[hreflang]!)
      // Muqobil URL ham sitemap'da va u ham shu URL'ga qaytadi.
      expect(other).toBeDefined()
      const back = Object.fromEntries(
        (other!['xhtml:link'] ?? []).map((link) => [link['@hreflang'], link['@href']]),
      )
      expect(back).toEqual(map)
    }
  }
}

describe('sitemap (sitemaps.org + xhtml:link)', () => {
  const urls = [
    ...localizedSitemapUrls('/', '2026-09-24T10:00:00Z', ORIGIN),
    ...localizedSitemapUrls('/kibersport', null, ORIGIN),
    ...localizedSitemapUrls('/kibersport/a-b?x=1&y=2', '2026-09-24T10:00:00.000Z', ORIGIN),
  ]
  const xml = urlsetXml(urls)

  it('XML to‘g‘ri, nomlar fazosi: sitemap 0.9 + xhtml', () => {
    const doc = parse(xml)
    expect(doc.urlset['@xmlns']).toBe(SITEMAP_NS)
    expect(doc.urlset['@xmlns:xhtml']).toBe(XHTML_NS)
    expect(doc.urlset.url).toHaveLength(6)
  })

  it('har bir yozuv alohida <url>, hreflang juftliklari o‘zaro to‘g‘ri', () => {
    const doc = parse(xml)
    const parsed = doc.urlset.url as XmlUrl[]
    expect(parsed.map((url) => url.loc)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/kr`,
      `${ORIGIN}/kibersport`,
      `${ORIGIN}/kr/kibersport`,
      `${ORIGIN}/kibersport/a-b?x=1&y=2`,
      `${ORIGIN}/kr/kibersport/a-b?x=1&y=2`,
    ])
    expectReciprocalHreflang(parsed)
  })

  it('lastmod — W3C Datetime (UTC), bo‘lmasa yozilmaydi; & qochiriladi', () => {
    const doc = parse(xml)
    const parsed = doc.urlset.url as XmlUrl[]
    expect(parsed[0]?.lastmod).toBe('2026-09-24T10:00:00.000Z')
    expect(parsed[2]?.lastmod).toBeUndefined()
    expect(xml).toContain('a-b?x=1&amp;y=2')
    expect(xmlEscape(`a<b>"c"'d'&\u0001`)).toBe('a&lt;b&gt;&quot;c&quot;&apos;d&apos;&amp;')
  })

  it('sitemap index', () => {
    const index = sitemapIndexXml([
      { loc: sitemapFileUrl({ kind: 'pages' }, ORIGIN), lastmod: '2026-09-24T10:00:00.000Z' },
      { loc: sitemapFileUrl({ kind: 'categories' }, ORIGIN) },
      { loc: sitemapFileUrl({ kind: 'posts', month: '2026-09' }, ORIGIN) },
    ])
    const doc = parse(index)
    expect(doc.sitemapindex['@xmlns']).toBe(SITEMAP_NS)
    expect(doc.sitemapindex.sitemap.map((entry: { loc: string }) => entry.loc)).toEqual([
      `${ORIGIN}/sitemaps/pages.xml`,
      `${ORIGIN}/sitemaps/categories.xml`,
      `${ORIGIN}/sitemaps/posts-2026-09.xml`,
    ])
  })

  it('fayl nomlari va oy chegaralari', () => {
    expect(parseSitemapFile('posts-2026-09.xml')).toEqual({ kind: 'posts', month: '2026-09' })
    expect(parseSitemapFile('posts-2026-13.xml')).toBeNull()
    expect(parseSitemapFile('pages.xml')).toEqual({ kind: 'pages' })
    expect(parseSitemapFile('../etc.xml')).toBeNull()
    expect(monthKey('2026-09-30T23:59:59Z')).toBe('2026-09')
    expect(monthRange('2026-12')).toEqual({
      start: '2026-12-01T00:00:00.000Z',
      end: '2027-01-01T00:00:00.000Z',
    })
    expect(sitemapFileUrl({ kind: 'index' }, ORIGIN)).toBe(`${ORIGIN}/sitemap.xml`)
    expect(sitemapFileUrl({ kind: 'news' }, ORIGIN)).toBe(`${ORIGIN}/news-sitemap.xml`)
  })
})

describe('Google News sitemap', () => {
  const now = new Date('2026-09-24T12:00:00.000Z')

  it('48 soatlik oyna: 47 soat — ha, 49 soat — yo‘q, kelajak — yo‘q', () => {
    expect(newsWindowStart(now).toISOString()).toBe('2026-09-22T12:00:00.000Z')
    expect(isWithinNewsWindow('2026-09-22T13:00:00.000Z', now)).toBe(true)
    expect(isWithinNewsWindow('2026-09-22T12:00:00.000Z', now)).toBe(true)
    expect(isWithinNewsWindow('2026-09-22T11:00:00.000Z', now)).toBe(false)
    expect(isWithinNewsWindow('2026-09-24T13:00:00.000Z', now)).toBe(false)
    expect(isWithinNewsWindow(null, now)).toBe(false)
  })

  it('XML to‘g‘ri: news nomlar fazosi, ikkala yozuv, majburiy teglar', () => {
    const alternates = {
      'uz-Latn': `${ORIGIN}/kibersport/a`,
      'uz-Cyrl': `${ORIGIN}/kr/kibersport/a`,
      'x-default': `${ORIGIN}/kibersport/a`,
    }
    const xml = newsSitemapXml([
      {
        loc: alternates['uz-Latn'],
        title: 'Oʻzbek jamoasi & CS2',
        publicationDate: '2026-09-24T10:00:00.000Z',
        publicationName: 'Blog Odya',
        language: 'uz',
        alternates,
      },
      {
        loc: alternates['uz-Cyrl'],
        title: 'Ўзбек жамоаси & CS2',
        publicationDate: '2026-09-24T10:00:00.000Z',
        publicationName: 'Blog Odya',
        language: 'uz',
        alternates,
      },
    ])
    const doc = parse(xml)
    expect(doc.urlset['@xmlns']).toBe(SITEMAP_NS)
    expect(doc.urlset['@xmlns:news']).toBe(NEWS_NS)
    const urls = doc.urlset.url as Array<XmlUrl & { 'news:news': Record<string, unknown> }>
    expect(urls).toHaveLength(2)
    for (const url of urls) {
      const news = url['news:news']
      expect(news['news:publication']).toEqual({ 'news:name': 'Blog Odya', 'news:language': 'uz' })
      expect(news['news:publication_date']).toBe('2026-09-24T10:00:00.000Z')
      expect(typeof news['news:title']).toBe('string')
    }
    expect(urls[1]?.['news:news']['news:title']).toBe('Ўзбек жамоаси & CS2')
    expectReciprocalHreflang(urls)
  })
})

describe('RSS 2.0', () => {
  it('lenta yo‘llari', () => {
    expect(feedPath('uz-Latn')).toBe('/rss.xml')
    expect(feedPath('uz-Cyrl')).toBe('/kr/rss.xml')
    expect(feedPath('uz-Latn', 'kibersport')).toBe('/kibersport/rss.xml')
    expect(feedPath('uz-Cyrl', 'kibersport')).toBe('/kr/kibersport/rss.xml')
  })

  it('XML to‘g‘ri: channel, atom:link self, item (guid, pubDate RFC 822)', () => {
    const xml = rssXml(
      {
        title: 'Блог Одя',
        link: `${ORIGIN}/kr`,
        selfUrl: `${ORIGIN}/kr/rss.xml`,
        description: 'Шиор',
        language: 'uz-Cyrl',
        image: { url: `${ORIGIN}/brand/icon-512.png`, title: 'Блог Одя', link: `${ORIGIN}/kr` },
      },
      [
        {
          title: 'A & B <c>',
          link: `${ORIGIN}/kr/kibersport/a`,
          description: 'Lid',
          pubDate: '2026-09-24T10:00:00.000Z',
          category: 'Киберспорт',
          author: 'Таҳририят',
          image: {
            url: 'https://media.odya.uz/a.webp',
            type: 'image/webp',
            width: 1200,
            height: 630,
          },
        },
      ],
    )
    const doc = parse(xml)
    expect(doc.rss['@version']).toBe('2.0')
    const channel = doc.rss.channel
    expect(channel['atom:link']['@href']).toBe(`${ORIGIN}/kr/rss.xml`)
    expect(channel['atom:link']['@rel']).toBe('self')
    expect(channel.language).toBe('uz-Cyrl')
    expect(channel.lastBuildDate).toBe('Thu, 24 Sep 2026 10:00:00 GMT')
    const [item] = channel.item
    expect(item.title).toBe('A & B <c>')
    expect(item.guid['#text']).toBe(`${ORIGIN}/kr/kibersport/a`)
    expect(item.guid['@isPermaLink']).toBe('true')
    expect(item.pubDate).toBe(rfc822Date('2026-09-24T10:00:00.000Z'))
    expect(item['media:content']['@url']).toBe('https://media.odya.uz/a.webp')
  })

  it('rewrites: /kr/… qoidalari /:category/… dan oldin', () => {
    const sources = FEED_REWRITES.map((rule) => rule.source)
    expect(sources.indexOf('/kr/rss.xml')).toBeLessThan(sources.indexOf('/:category/rss.xml'))
    expect(sources.indexOf('/kr/:category/rss.xml')).toBeLessThan(
      sources.indexOf('/:category/rss.xml'),
    )
  })
})

describe('robots.txt (TZ §8.3)', () => {
  it('production: /admin, /api, /search, /kr/search yopiq; sitemap’lar', () => {
    const robots = robotsConfig(true, ORIGIN)
    expect(robots.rules).toEqual([
      {
        userAgent: '*',
        allow: ['/', '/api/media/file/'],
        disallow: ['/admin', '/api', '/search', '/kr/search'],
      },
    ])
    expect(robots.sitemap).toEqual([`${ORIGIN}/sitemap.xml`, `${ORIGIN}/news-sitemap.xml`])
  })

  it('preview: Disallow: / (sitemap’larsiz)', () => {
    const robots = robotsConfig(false, ORIGIN)
    expect(robots.rules).toEqual([{ userAgent: '*', disallow: '/' }])
    expect(robots.sitemap).toBeUndefined()
  })
})
