import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { countWords, extractArticle, htmlToMarkdown } from '@/scraping/extract'
import { htmlToText } from '@/scraping/feed'

import { SEED_SOURCES } from './helpers/feeds'

/**
 * `item.extract` — saqlangan haqiqiy sahifalar/RSS yozuvlari bo'yicha snapshot testlar
 * (TASKS M2-02). Fixture'lar: `tests/__fixtures__/scraping/{source}/{n}.html` + `{n}.json`
 * (RSS elementi: url, title, publishedAt, author, categories, excerpt[, contentHtml]).
 *
 * - `rss_plus_page` manbalar (Habr, Dexerto): `{n}.html` — maqola sahifasi (2026-09-24 da
 *   `OdyaBlogBot` UA bilan, robots.txt ruxsati bilan yuklangan; `<script>`/`<style>`/`<svg>`
 *   olib tashlangan, JSON-LD qoldirilgan).
 * - `rss_only` manbalar: `{n}.html` — RSS'dagi HTML (`content:encoded` / Atom `content` /
 *   description) — sahifa yuklanmaydi (TZ §2.3).
 */

const FIXTURES = path.join(__dirname, '__fixtures__', 'scraping')

interface FixtureMeta {
  url: string
  title?: string
  publishedAt?: string
  author?: string
  categories: string[]
  excerpt?: string
  contentHtml?: string
}

interface SeedSourceFull {
  slug: string
  fetchMode: 'rss_only' | 'rss_plus_page'
  selectors: Record<string, unknown> | null
}

const SOURCES = SEED_SOURCES as unknown as SeedSourceFull[]

function fixtures(slug: string) {
  const dir = path.join(FIXTURES, slug)
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const name = file.replace(/\.json$/, '')
      return {
        name,
        meta: JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as FixtureMeta,
        html: readFileSync(path.join(dir, `${name}.html`), 'utf8'),
      }
    })
}

function extractFixture(source: SeedSourceFull, fixture: ReturnType<typeof fixtures>[number]) {
  const { meta, html } = fixture
  return extractArticle({
    html,
    url: meta.url,
    mode: source.fetchMode === 'rss_plus_page' ? 'page' : 'rss',
    selectors: source.selectors,
    fallback: {
      title: meta.title,
      author: meta.author,
      publishedAt: meta.publishedAt,
      tags: meta.categories,
      excerpt: meta.excerpt,
    },
  })
}

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/[\s\u00a0\u2011]+/g, ' ').trim()

describe('item.extract: har bir manba fixture’lari', () => {
  it('har bir seed manbasida 2–3 ta fixture bor', () => {
    for (const source of SOURCES) {
      const count = fixtures(source.slug).length
      expect(count, source.slug).toBeGreaterThanOrEqual(2)
      expect(count, source.slug).toBeLessThanOrEqual(3)
    }
  })

  for (const source of SOURCES) {
    describe(`${source.slug} (${source.fetchMode})`, () => {
      for (const fixture of fixtures(source.slug)) {
        it(`${fixture.name}: sarlavha, sana, matn`, () => {
          const result = extractFixture(source, fixture)

          // Sarlavha — manbadagi sarlavha (RSS'dagi bilan bir xil).
          expect(normalize(result.title)).toBe(normalize(fixture.meta.title))
          // Sana — RSS'dagi sana bilan bir kun ichida (sahifada aniqroq vaqt bo'lishi mumkin).
          expect(result.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
          const drift = Math.abs(
            Date.parse(result.publishedAt!) - Date.parse(fixture.meta.publishedAt!),
          )
          expect(drift).toBeLessThan(24 * 3_600_000)
          // Matn bor, HTML teglarsiz Markdown.
          expect(result.method).toBe(source.fetchMode === 'rss_plus_page' ? 'readability' : 'rss')
          expect(result.markdown.length).toBeGreaterThan(40)
          expect(result.markdown).not.toMatch(/<\/?(p|div|span|script|img)\b/i)
          expect(result.wordCount).toBeGreaterThan(5)
          if (source.fetchMode === 'rss_plus_page') {
            // Sahifadan to'liq matn: RSS description'dan qisqa emas.
            expect(result.wordCount).toBeGreaterThan(150)
            expect(result.markdown.length).toBeGreaterThan(
              htmlToText(fixture.meta.contentHtml ?? '').length,
            )
            expect(result.ogImage).toMatch(/^https:\/\//)
            expect(result.canonicalUrl).toMatch(/^https:\/\//)
          }
          // Tozalangan HTML: skript/stil/atributlarsiz.
          expect(result.cleanHtml).not.toMatch(/<(script|style|iframe|form)\b/i)
          expect(result.cleanHtml).not.toMatch(/\s(class|style|on\w+)=/i)
          for (const image of result.imageUrls) expect(image.url).toMatch(/^https?:\/\//)

          expect({
            method: result.method,
            title: result.title,
            author: result.author,
            publishedAt: result.publishedAt,
            tags: result.tags,
            ogImage: result.ogImage,
            canonicalUrl: result.canonicalUrl,
            lang: result.lang,
            wordCount: result.wordCount,
            imageUrls: result.imageUrls,
            markdownLength: result.markdown.length,
            markdownStart: result.markdown.slice(0, 300),
            markdownEnd: result.markdown.slice(-200),
          }).toMatchSnapshot()
        })
      }
    })
  }
})

describe('extractArticle: fallback va chekka holatlar', () => {
  const habr = SOURCES.find((s) => s.slug === 'habr')!

  it('Readability muvaffaqiyatsiz bo‘lsa — sources.selectors.content', () => {
    const html = `<!doctype html><html lang="ru"><head><title>T</title></head><body>
      <h1 class="tm-title">Заголовок</h1>
      <div class="article-formatted-body"><p>Короткий текст новости.</p><p>Вторая строка.</p></div>
    </body></html>`
    const result = extractArticle({
      html,
      url: 'https://habr.com/ru/news/1/',
      mode: 'page',
      selectors: habr.selectors,
    })
    expect(result.method).toBe('selectors')
    expect(result.title).toBe('Заголовок')
    expect(result.markdown).toBe('Короткий текст новости.\n\nВторая строка.')
    expect(result.wordCount).toBe(5)
  })

  it('selectors.remove va noto‘g‘ri selektor task’ni yiqitmaydi', () => {
    const html = `<html><body><div id="c"><p>Matn birinchi.</p><div class="ad">Reklama</div></div></body></html>`
    const result = extractArticle({
      html,
      url: 'https://example.com/a',
      mode: 'page',
      selectors: { content: '#c', remove: ['.ad', ':::invalid'], title: '[[bad' },
    })
    expect(result.markdown).toBe('Matn birinchi.')
  })

  it('rss rejimi: bo‘sh contentHtml — description ishlatiladi; hech narsa yo‘q — method none', () => {
    const withExcerpt = extractArticle({
      html: '',
      url: 'https://www.hltv.org/news/1/x',
      mode: 'rss',
      fallback: { title: 'T', excerpt: 'Only one sentence here.' },
    })
    expect(withExcerpt.method).toBe('rss')
    expect(withExcerpt.markdown).toBe('Only one sentence here.')

    const empty = extractArticle({ html: '  ', url: 'https://x.test/', mode: 'rss' })
    expect(empty.method).toBe('none')
    expect(empty.markdown).toBe('')
    expect(empty.wordCount).toBe(0)
  })

  it('nisbiy havola va lazy rasm mutlaq URL’ga aylanadi, data: rasm tashlanadi', () => {
    const result = extractArticle({
      html: '<p>Text <a href="/about">link</a></p><img data-src="/i/1.jpg" src="data:image/gif;base64,xx" alt="A"><img src="data:image/png;base64,yy">',
      url: 'https://example.com/news/1',
      mode: 'rss',
    })
    expect(result.cleanHtml).toContain('href="https://example.com/about"')
    expect(result.imageUrls).toEqual([{ url: 'https://example.com/i/1.jpg', alt: 'A' }])
    expect(result.markdown).toBe('Text [link](https://example.com/about)')
  })

  it('htmlToMarkdown va countWords', () => {
    expect(htmlToMarkdown('<h2>Sarlavha</h2><ul><li>bir</li><li>ikki</li></ul>')).toBe(
      '## Sarlavha\n\n-   bir\n-   ikki',
    )
    expect(countWords('Oʻzbekiston — bu “test”, 2026-yil; e-mail va don’t')).toBe(7)
    expect(countWords('Привет, мир! 42')).toBe(3)
  })
})
