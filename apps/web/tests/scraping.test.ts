import { describe, expect, it, vi } from 'vitest'

import { isFeedDue } from '@/jobs/scheduler'
import { resolveJobsSettings } from '@/jobs/settings'
import { selectCandidates } from '@/jobs/tasks/feedPoll'
import {
  buildConditionalHeaders,
  fetchFeed,
  FeedHttpError,
  htmlToText,
  parseFeed,
  USER_AGENT,
} from '@/scraping/feed'
import { hashUrl, normalizeUrl, urlHash } from '@/scraping/url'

import { FeedFixtures, SEED_SOURCES } from './helpers/feeds'

describe('normalizeUrl', () => {
  it.each([
    [
      'https://habr.com/ru/news/123456/?utm_source=habr.com&utm_medium=rss&utm_campaign=123456#habracut',
      'https://habr.com/ru/news/123456',
    ],
    ['https://www.theverge.com/news/1/', 'https://www.theverge.com/news/1'],
    ['HTTPS://WWW.TheVerge.COM:443/News/1#x', 'https://www.theverge.com/News/1'],
    ['https://techcrunch.com/2026/09/24/a//b/', 'https://techcrunch.com/2026/09/24/a/b'],
    ['https://example.com/?b=2&a=1&fbclid=x&gclid=y', 'https://example.com/?a=1&b=2'],
    ['https://example.com', 'https://example.com/'],
    ['http://example.com:80/a', 'http://example.com/a'],
    ['https://user:pw@example.com/a', 'https://example.com/a'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected)
  })

  it('noto‘g‘ri va http(s) bo‘lmagan URL — null', () => {
    expect(normalizeUrl('not a url')).toBeNull()
    expect(normalizeUrl('ftp://example.com/a')).toBeNull()
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
  })

  it('nisbiy havola base bilan', () => {
    expect(normalizeUrl('/news/1/', 'https://www.ixbt.com/feed')).toBe(
      'https://www.ixbt.com/news/1',
    )
  })
})

describe('urlHash', () => {
  it('SHA-256 hex, deterministik', () => {
    const hash = urlHash('https://example.com/a')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(urlHash('https://example.com/a')).toBe(hash)
    expect(urlHash('https://example.com/b')).not.toBe(hash)
  })

  it('bir maqolaning turli ko‘rinishlari — bitta hash', () => {
    const variants = [
      'https://habr.com/ru/news/1/',
      'https://habr.com/ru/news/1?utm_source=rss',
      'https://HABR.com/ru/news/1#comments',
      'https://habr.com:443/ru/news/1/?utm_medium=rss&utm_campaign=x',
    ]
    const hashes = new Set(variants.map((v) => hashUrl(v)?.hash))
    expect(hashes.size).toBe(1)
  })
})

describe('feed: shartli so‘rov va parse', () => {
  it('ETag / Last-Modified → If-None-Match / If-Modified-Since', () => {
    expect(buildConditionalHeaders({})).toEqual({})
    expect(buildConditionalHeaders({ etag: '"v1"', lastModified: null })).toEqual({
      'If-None-Match': '"v1"',
    })
    expect(
      buildConditionalHeaders({ etag: 'W/"x"', lastModified: 'Wed, 24 Sep 2026 08:00:00 GMT' }),
    ).toEqual({
      'If-None-Match': 'W/"x"',
      'If-Modified-Since': 'Wed, 24 Sep 2026 08:00:00 GMT',
    })
  })

  it('User-Agent, shartli sarlavhalar yuboriladi; 304 — not-modified', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 304 }))
    const result = await fetchFeed('https://example.com/rss', {
      etag: '"v1"',
      lastModified: 'Wed, 24 Sep 2026 08:00:00 GMT',
      timeoutMs: 1000,
      fetchImpl,
    })
    expect(result).toEqual({ status: 'not-modified', httpStatus: 304 })
    const headers = new Headers(fetchImpl.mock.calls[0]![1]!.headers)
    expect(headers.get('user-agent')).toBe(USER_AGENT)
    expect(headers.get('if-none-match')).toBe('"v1"')
    expect(headers.get('if-modified-since')).toBe('Wed, 24 Sep 2026 08:00:00 GMT')
  })

  it('HTTP xato — FeedHttpError (status bilan)', async () => {
    const fetchImpl: typeof fetch = async () => new Response('no', { status: 403 })
    await expect(
      fetchFeed('https://example.com/rss', { timeoutMs: 1000, fetchImpl }),
    ).rejects.toMatchObject({ name: 'FeedHttpError', httpStatus: 403 })
    expect(new FeedHttpError(500, 'x')).toBeInstanceOf(Error)
  })

  it('RSS 2.0 va Atom parse: havola, sana, muallif, excerpt, content, teglar', async () => {
    const fixtures = new FeedFixtures(Date.parse('2026-09-24T08:00:00Z'))
    const ixbtFeed = SEED_SOURCES.find((s) => s.slug === 'ixbt')!.feeds[0]!.url
    const rss = await parseFeed(fixtures.render(ixbtFeed))
    expect(rss.length).toBe(4)
    expect(rss[0]).toMatchObject({
      link: expect.stringContaining('https://www.ixbt.com/news/ixbt-'),
      author: 'Author',
      excerpt: expect.stringContaining('Description of'),
      contentHtml: expect.stringContaining('<p>Full text of'),
      categories: ['News', 'Tech'],
    })
    expect(rss[0]!.publishedAt).toBe('2026-09-24T07:00:00.000Z')

    const atom = await parseFeed(fixtures.render('https://www.theverge.com/rss/index.xml'))
    expect(atom.length).toBeGreaterThan(4)
    expect(atom[0]).toMatchObject({
      link: expect.stringContaining('https://www.theverge.com/news/the-verge-'),
      author: 'Verge Author',
      publishedAt: '2026-09-24T07:00:00.000Z',
    })
    expect(atom[0]!.contentHtml).toContain('Body of')
  })

  it('havolasiz yozuvlar tashlanadi, guid URL bo‘lsa havola sifatida', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
      <item><title>no link</title></item>
      <item><title>guid</title><guid>https://example.com/a</guid></item>
    </channel></rss>`
    const items = await parseFeed(xml)
    expect(items.map((i) => i.link)).toEqual(['https://example.com/a'])
  })

  it('htmlToText', () => {
    expect(htmlToText('<p>Salom&nbsp;<b>dunyo</b> &amp; boshqalar</p><script>x()</script>')).toBe(
      'Salom dunyo & boshqalar',
    )
  })
})

describe('selectCandidates', () => {
  const now = Date.parse('2026-09-24T08:00:00Z')
  const item = (link: string, hoursAgo?: number) => ({
    link,
    categories: [],
    publishedAt:
      hoursAgo === undefined ? undefined : new Date(now - hoursAgo * 3_600_000).toISOString(),
  })

  it('eskilarini tashlaydi, feed ichidagi takrorlarni birlashtiradi, yangilari birinchi', () => {
    const { candidates, skippedOld } = selectCandidates(
      [
        item('https://e.com/a?utm_source=x', 5),
        item('https://e.com/a/', 5),
        item('https://e.com/b', 1),
        item('https://e.com/old', 100),
        item('https://e.com/undated'),
        item('mailto:x@e.com', 1),
      ],
      { now, maxItemAgeHours: 72 },
    )
    expect(skippedOld).toBe(1)
    expect(candidates.map((c) => c.url)).toEqual([
      'https://e.com/b',
      'https://e.com/a',
      'https://e.com/undated',
    ])
  })
})

describe('scheduler: pollIntervalMin', () => {
  const now = Date.parse('2026-09-24T08:00:00Z')
  const ago = (min: number) => new Date(now - min * 60_000).toISOString()

  it('hech o‘qilmagan — muddati kelgan; interval o‘tmagan — yo‘q; nofaol — yo‘q', () => {
    expect(isFeedDue({ lastPolledAt: null }, 15, now)).toBe(true)
    expect(isFeedDue({ lastPolledAt: ago(5) }, 15, now)).toBe(false)
    expect(isFeedDue({ lastPolledAt: ago(16) }, 15, now)).toBe(true)
    // 1 daqiqalik slack: 10 daqiqalik cron interval chegarasida kechikmaslik uchun.
    expect(isFeedDue({ lastPolledAt: ago(14.5) }, 15, now)).toBe(true)
    expect(isFeedDue({ lastPolledAt: null, isActive: false }, 15, now)).toBe(false)
  })
})

describe('scraping-settings → jobs sozlamalari', () => {
  it('default va chegaralar (deadline ≤ 45 s)', () => {
    expect(resolveJobsSettings(null)).toEqual({
      isEnabled: true,
      batchLimit: 10,
      deadlineSec: 40,
      maxNewItemsPerPoll: 30,
      maxItemAgeHours: 72,
      defaultPollIntervalMin: 15,
    })
    const clamped = resolveJobsSettings({
      jobsDeadlineSec: 55,
      jobsBatchLimit: 500,
      isEnabled: false,
    })
    expect(clamped.deadlineSec).toBe(45)
    expect(clamped.batchLimit).toBe(50)
    expect(clamped.isEnabled).toBe(false)
  })
})
