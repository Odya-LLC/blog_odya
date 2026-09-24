import { Readability } from '@mozilla/readability'
import type { SourceSelectors } from '@blog-odya/shared'
import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'

import { htmlToText } from './feed'

/**
 * Maqola matni va metadatasini ajratish (`item.extract`, TZ §3.5). Yon ta'sirsiz — fixture'lar
 * bilan snapshot-testlanadi (`tests/extract.test.ts`).
 *
 * - `page` rejimi (`rss_plus_page`): Readability (`@mozilla/readability` + `linkedom`) asosiy;
 *   natija bo'sh/qisqa bo'lsa yoki `sources.selectors.content` sezilarli ko'proq matn bersa —
 *   selektor (fallback). `selectors.remove` ikkala yo'lda ham oldindan olib tashlanadi.
 * - `rss` rejimi (`rss_only`): sahifa yuklanmaydi — RSS'dagi HTML (`content:encoded`/`content`
 *   yoki description) tozalanadi.
 * - Metadata: sarlavha, muallif, sana, teglar (`article:tag`, JSON-LD `keywords`, `keywords`),
 *   `og:image`, canonical, til; yo'q bo'lsa — RSS qiymatlari.
 * - `extractedText` — Markdown (`turndown`), rasmlarsiz; rasmlar faqat URL sifatida
 *   (`imageUrls`) — manba rasmlari yuklanmaydi (TZ §2.3).
 */

/** Readability natijasi shundan qisqa bo'lsa — selektor fallback. */
export const MIN_READABILITY_CHARS = 250
/** Selektor matni Readability'dan shuncha marta uzun bo'lsa — selektor afzal. */
const SELECTOR_PREFERENCE_RATIO = 1.5

export const MAX_EXTRACTED_CHARS = 100_000
export const MAX_IMAGES = 30
export const MAX_TAGS = 30

export type ExtractMode = 'page' | 'rss'
export type ExtractMethod = 'readability' | 'selectors' | 'rss' | 'none'

/** RSS'dan kelgan qiymatlar — sahifada topilmasa ishlatiladi. */
export interface ExtractFallback {
  title?: string | null
  author?: string | null
  publishedAt?: string | null
  tags?: string[] | null
  excerpt?: string | null
}

export interface ExtractInput {
  html: string
  /** Sahifa (yoki RSS elementi) URL'i — nisbiy havolalar shunga nisbatan. */
  url: string
  mode: ExtractMode
  selectors?: Partial<SourceSelectors> | null
  fallback?: ExtractFallback
}

export interface ExtractedImage {
  url: string
  alt?: string
}

export interface ExtractResult {
  method: ExtractMethod
  title: string | null
  author: string | null
  /** ISO 8601 (UTC). */
  publishedAt: string | null
  tags: string[]
  ogImage: string | null
  canonicalUrl: string | null
  lang: string | null
  excerpt: string | null
  /** Tozalangan maqola HTML'i (R2 `.clean.html.gz`). */
  cleanHtml: string
  /** Markdown. */
  markdown: string
  imageUrls: ExtractedImage[]
  wordCount: number
}

// linkedom `Document` DOM `Document` bilan tuzilmaviy mos; turlarni bir joyda moslaymiz.
type Doc = Document

function parseDocument(html: string): Doc {
  return parseHTML(html).document as unknown as Doc
}

function clean(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, ' ').trim()
  return text ? text : null
}

function absoluteUrl(value: string | null | undefined, base: string): string | null {
  const raw = value?.trim()
  if (!raw || raw.startsWith('data:')) return null
  try {
    const url = new URL(raw, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function isoDate(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  const time = Date.parse(raw)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

function safeQueryAll(root: ParentNode, selector: string | undefined): Element[] {
  if (!selector) return []
  try {
    return [...root.querySelectorAll(selector)]
  } catch {
    // Admin kiritgan noto'g'ri selektor task'ni yiqitmasin.
    return []
  }
}

function safeQuery(root: ParentNode, selector: string | undefined): Element | null {
  return safeQueryAll(root, selector)[0] ?? null
}

function meta(doc: Doc, ...keys: string[]): string | null {
  for (const key of keys) {
    const element =
      doc.querySelector(`meta[property="${key}"]`) ?? doc.querySelector(`meta[name="${key}"]`)
    const value = clean(element?.getAttribute('content'))
    if (value) return value
  }
  return null
}

function metaAll(doc: Doc, key: string): string[] {
  return [
    ...doc.querySelectorAll(`meta[property="${key}"]`),
    ...doc.querySelectorAll(`meta[name="${key}"]`),
  ]
    .map((element) => clean(element.getAttribute('content')))
    .filter((value): value is string => Boolean(value))
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

type JsonLd = Record<string, unknown>

const ARTICLE_TYPES = /(Article|BlogPosting|Report)$/

function flattenJsonLd(value: unknown, out: JsonLd[]): void {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, out)
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as JsonLd
  out.push(record)
  if (record['@graph']) flattenJsonLd(record['@graph'], out)
}

function jsonLdArticle(doc: Doc): JsonLd | null {
  const nodes: JsonLd[] = []
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      flattenJsonLd(JSON.parse(script.textContent ?? ''), nodes)
    } catch {
      // Buzuq JSON-LD — e'tiborsiz.
    }
  }
  return (
    nodes.find((node) => {
      const type = node['@type']
      const types = Array.isArray(type) ? type : [type]
      return types.some((t) => typeof t === 'string' && ARTICLE_TYPES.test(t))
    }) ?? null
  )
}

function ldText(value: unknown): string | null {
  if (typeof value === 'string') return clean(value)
  if (Array.isArray(value)) {
    const names = value.map(ldText).filter((v): v is string => Boolean(v))
    return names.length ? names.join(', ') : null
  }
  if (value && typeof value === 'object') return ldText((value as JsonLd).name)
  return null
}

function ldList(value: unknown): string[] {
  if (typeof value === 'string') return value.split(',').map((v) => v.trim())
  if (Array.isArray(value)) return value.flatMap(ldList)
  return []
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

function selectorText(doc: Doc, selector: string | undefined): string | null {
  const element = safeQuery(doc, selector)
  return element ? clean(element.textContent) : null
}

function selectorDate(doc: Doc, selector: string | undefined): string | null {
  const element = safeQuery(doc, selector)
  if (!element) return null
  return (
    isoDate(element.getAttribute('datetime')) ??
    isoDate(element.getAttribute('content')) ??
    isoDate(element.textContent)
  )
}

/** `og:title` dagi " - Dexerto" / " | Site" kabi sayt nomi qo'shimchasini olib tashlaydi. */
function stripSiteName(title: string, siteName: string | null): string {
  if (!siteName) return title
  const escaped = siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return title.replace(new RegExp(`\\s*[-|–—:·]\\s*${escaped}\\s*$`, 'i'), '').trim() || title
}

/** URL ko'rinishidagi "muallif" (masalan, `article:author` profil havolasi) — ism emas. */
function authorName(value: string | null): string | null {
  if (!value || /^https?:\/\//i.test(value)) return null
  return value
}

function uniqueTags(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    // "- Rubrika" kabi boshidagi tire/nuqtalar olib tashlanadi.
    const tag = clean(value?.replace(/^[\s\-–—•·]+/, ''))?.slice(0, 100)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
    if (result.length >= MAX_TAGS) break
  }
  return result
}

interface PageMeta {
  title: string | null
  author: string | null
  publishedAt: string | null
  tags: string[]
  ogImage: ExtractedImage | null
  canonicalUrl: string | null
  lang: string | null
  description: string | null
}

function readMeta(doc: Doc, url: string, selectors: Partial<SourceSelectors>): PageMeta {
  const ld = jsonLdArticle(doc)
  const siteName = meta(doc, 'og:site_name')
  const ogTitle = meta(doc, 'og:title', 'twitter:title')
  const h1s = [...doc.querySelectorAll('h1')]
  const h1 = h1s.length === 1 ? clean(h1s[0]!.textContent) : null
  const ogImageUrl = absoluteUrl(meta(doc, 'og:image', 'og:image:url', 'twitter:image'), url)
  const twitterAuthor =
    meta(doc, 'twitter:label1')?.toLowerCase() === 'written by' ? meta(doc, 'twitter:data1') : null

  return {
    title:
      selectorText(doc, selectors.title) ??
      ldText(ld?.headline) ??
      (ogTitle ? stripSiteName(ogTitle, siteName) : null) ??
      h1 ??
      clean(doc.querySelector('title')?.textContent),
    author:
      selectorText(doc, selectors.author) ??
      ldText(ld?.author) ??
      authorName(meta(doc, 'author', 'article:author')) ??
      twitterAuthor,
    publishedAt:
      selectorDate(doc, selectors.publishedAt) ??
      isoDate(meta(doc, 'article:published_time', 'og:article:published_time')) ??
      isoDate(typeof ld?.datePublished === 'string' ? ld.datePublished : null) ??
      isoDate(doc.querySelector('[itemprop="datePublished"]')?.getAttribute('content')) ??
      isoDate(doc.querySelector('[itemprop="datePublished"]')?.getAttribute('datetime')) ??
      isoDate(doc.querySelector('article time[datetime]')?.getAttribute('datetime')),
    tags: uniqueTags([
      ...metaAll(doc, 'article:tag'),
      ...ldList(ld?.keywords),
      ...(meta(doc, 'keywords')?.split(',') ?? []),
    ]),
    ogImage: ogImageUrl
      ? {
          url: ogImageUrl,
          ...(meta(doc, 'og:image:alt') ? { alt: meta(doc, 'og:image:alt')! } : {}),
        }
      : null,
    canonicalUrl: absoluteUrl(
      doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? meta(doc, 'og:url'),
      url,
    ),
    lang: clean(doc.documentElement?.getAttribute('lang')),
    description: meta(doc, 'og:description', 'description', 'twitter:description'),
  }
}

// ---------------------------------------------------------------------------
// Kontent
// ---------------------------------------------------------------------------

/** Maqola matniga tegishli bo'lmagan elementlar. */
const DROP_ELEMENTS = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'svg',
  'canvas',
  'link',
  'meta',
]

const KEEP_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  time: ['datetime'],
  ol: ['start'],
}

const LAZY_SRC = ['data-src', 'data-lazy-src', 'data-original', 'data-url']

function removeAll(root: ParentNode, selectors: string[]): void {
  for (const selector of selectors) {
    for (const element of safeQueryAll(root, selector)) element.remove()
  }
}

/**
 * Kontent HTML'ini tozalaydi: skript/forma/iframe va h.k. olib tashlanadi, atributlardan faqat
 * zarurlari qoladi, havola va rasm URL'lari mutlaq qilinadi (lazy `data-src` → `src`).
 */
function sanitize(root: Element, baseUrl: string): void {
  removeAll(root, DROP_ELEMENTS)
  for (const element of [...root.querySelectorAll('*')]) {
    const tag = element.tagName.toLowerCase()
    if (tag === 'img') {
      const src = absoluteUrl(element.getAttribute('src'), baseUrl)
      const lazy = LAZY_SRC.map((name) => absoluteUrl(element.getAttribute(name), baseUrl)).find(
        Boolean,
      )
      const finalSrc = lazy ?? src
      if (!finalSrc) {
        element.remove()
        continue
      }
      element.setAttribute('src', finalSrc)
    }
    if (tag === 'a') {
      const href = absoluteUrl(element.getAttribute('href'), baseUrl)
      if (href) element.setAttribute('href', href)
      else element.removeAttribute('href')
    }
    const keep = KEEP_ATTRIBUTES[tag] ?? []
    for (const attribute of [...element.attributes]) {
      if (!keep.includes(attribute.name)) element.removeAttribute(attribute.name)
    }
  }
  // Bo'sh qolgan bloklar (reklama joylari va h.k.).
  for (const element of [...root.querySelectorAll('div, span, p, section, figure')].reverse()) {
    if (!clean(element.textContent) && !element.querySelector('img, video, picture, table')) {
      element.remove()
    }
  }
}

function textLength(element: Element | null): number {
  return clean(element?.textContent)?.length ?? 0
}

function wrap(html: string): Element {
  return parseDocument(
    `<!doctype html><html><body><article>${html}</article></body></html>`,
  ).querySelector('article')!
}

interface ContentResult {
  method: ExtractMethod
  root: Element | null
  readability: ReturnType<Readability['parse']>
}

function extractPageContent(
  html: string,
  selectors: Partial<SourceSelectors>,
  remove: string[],
): ContentResult {
  // Readability hujjatni o'zgartiradi — alohida nusxa.
  const readabilityDoc = parseDocument(html)
  removeAll(readabilityDoc, remove)
  let readability: ContentResult['readability'] = null
  try {
    readability = new Readability(readabilityDoc, { charThreshold: 200 }).parse()
  } catch {
    readability = null
  }
  const readabilityRoot = readability?.content ? wrap(readability.content) : null
  const readabilityLength = textLength(readabilityRoot)

  let selectorRoot: Element | null = null
  if (selectors.content) {
    const doc = parseDocument(html)
    const element = safeQuery(doc, selectors.content)
    if (element) {
      removeAll(element, remove)
      selectorRoot = wrap(element.innerHTML)
    }
  }
  const selectorLength = textLength(selectorRoot)

  const useSelector =
    selectorRoot !== null &&
    selectorLength > 0 &&
    (readabilityLength < MIN_READABILITY_CHARS ||
      selectorLength > readabilityLength * SELECTOR_PREFERENCE_RATIO)

  if (useSelector) return { method: 'selectors', root: selectorRoot, readability }
  if (readabilityRoot && readabilityLength > 0) {
    return { method: 'readability', root: readabilityRoot, readability }
  }
  return { method: 'none', root: null, readability }
}

// ---------------------------------------------------------------------------
// Markdown va statistika
// ---------------------------------------------------------------------------

function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    hr: '---',
  })
  // Rasmlar Markdown'ga kirmaydi — faqat `imageUrls` da (manba rasmlari ommaga chiqmaydi).
  // `remove()` emas: CommonMark `image` qoidasi undan ustun turadi.
  service.addRule('dropMedia', {
    filter: ['img', 'picture', 'video', 'audio', 'source'],
    replacement: () => '',
  })
  return service
}

const turndown = createTurndown()

export function htmlToMarkdown(html: string): string {
  return turndown
    .turndown(html)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const WORD = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0
}

function collectImages(root: Element | null, ogImage: ExtractedImage | null): ExtractedImage[] {
  const images: ExtractedImage[] = []
  const seen = new Set<string>()
  const push = (image: ExtractedImage) => {
    if (seen.has(image.url) || images.length >= MAX_IMAGES) return
    seen.add(image.url)
    images.push(image)
  }
  if (ogImage) push(ogImage)
  for (const img of root ? [...root.querySelectorAll('img')] : []) {
    const url = img.getAttribute('src')
    if (!url) continue
    const alt = clean(img.getAttribute('alt'))
    push(alt ? { url, alt: alt.slice(0, 300) } : { url })
  }
  return images
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

// ---------------------------------------------------------------------------
// Asosiy funksiya
// ---------------------------------------------------------------------------

export function extractArticle(input: ExtractInput): ExtractResult {
  const selectors = input.selectors ?? {}
  const remove = selectors.remove ?? []
  const fallback = input.fallback ?? {}

  let pageMeta: PageMeta | null = null
  let content: ContentResult
  if (input.mode === 'page') {
    pageMeta = readMeta(parseDocument(input.html), input.url, selectors)
    content = extractPageContent(input.html, selectors, remove)
  } else {
    const root = wrap(input.html.trim() ? input.html : `<p>${fallback.excerpt ?? ''}</p>`)
    content = { method: textLength(root) > 0 ? 'rss' : 'none', root, readability: null }
  }

  const root = content.root
  if (root) sanitize(root, input.url)
  const cleanHtml =
    root && textLength(root) > 0 ? root.innerHTML.replace(/<!--[\s\S]*?-->/g, '').trim() : ''
  const markdown = cleanHtml ? truncate(htmlToMarkdown(cleanHtml), MAX_EXTRACTED_CHARS) : ''
  const text = cleanHtml ? (clean(root?.textContent) ?? '') : ''
  const readability = content.readability

  return {
    method: cleanHtml ? content.method : 'none',
    title: pageMeta?.title ?? clean(readability?.title) ?? clean(htmlToText(fallback.title ?? '')),
    author: pageMeta?.author ?? clean(readability?.byline) ?? clean(fallback.author),
    publishedAt:
      pageMeta?.publishedAt ??
      isoDate(readability?.publishedTime) ??
      isoDate(fallback.publishedAt ?? null),
    tags: uniqueTags([...(pageMeta?.tags ?? []), ...(fallback.tags ?? [])]),
    ogImage: pageMeta?.ogImage?.url ?? null,
    canonicalUrl: pageMeta?.canonicalUrl ?? null,
    lang: pageMeta?.lang ?? null,
    excerpt:
      clean(fallback.excerpt) ??
      pageMeta?.description ??
      clean(readability?.excerpt) ??
      (text ? truncate(text, 300) : null),
    cleanHtml,
    markdown,
    imageUrls: collectImages(cleanHtml ? root : null, pageMeta?.ogImage ?? null),
    wordCount: countWords(text),
  }
}
