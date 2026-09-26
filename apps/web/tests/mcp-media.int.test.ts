import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiKeyRateLimiter, createRateLimiter, type RateLimiter } from '@/auth/rate-limit'
import type { McpMediaOptions } from '@/mcp/context'
import type { FetchImageDeps, TransportResponse } from '@/mcp/media-fetch'
import { MAX_MEDIA_BYTES } from '@/mcp/media-policy'
import { mediaUploadLimiter } from '@/mcp/media-tools'
import { createMcpRoute, MCP_PATH } from '@/mcp/route'
import type { Category, Media, Post, ScrapedItem, Source, User } from '@/payload-types'

import {
  as,
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  TEST_SLUG_PREFIX,
  testSlug,
  type TestUsers,
} from './helpers/content'
import { deleteTestUsers, initTestPayload } from './helpers/payload'
import { createTestS3Client, ensureBucket } from './helpers/s3'

/**
 * MCP media toollari (OBLOG-44) — SDK mijozi → `/api/mcp` route, haqiqiy Postgres + MinIO:
 * upload_media (base64 va URL — tarmoq/DNS soxta), litsenziya va domen qoidalari, set_cover,
 * `![alt](media:ID)` → Lexical upload, submit_for_review muqova ogohlantirishi, list_media,
 * search_stock_images (soxta Pexels), audit (`channel = mcp`) va kirill alt.
 */
let payload: Payload
let users: TestUsers
let category: Category
let source: Source
let editorKey: string
let editor2Key: string

const SITE_URL = 'https://blog.odya.test'
const ENDPOINT = `http://localhost:3000${MCP_PATH}`
const URL_PREFIX = 'https://mcp-media-test.example/'
const BLOCKED_SOURCE_HOST = 'mcp-media-news.example'
const TOKEN = `mcpm${Date.now().toString(36)}`
const ALT = `Apple iPhone 18 smartfoni oq fonda ${TOKEN}`

const createdPosts = new Set<number>()
const createdMedia = new Set<number>()
const createdTags = new Set<number>()

// --- Soxta tarmoq (upload_media url) va Pexels ---------------------------------------------

let jpegBytes: Buffer
const netCalls: string[] = []

function reply(status: number, headers: Record<string, string>, body?: Buffer): TransportResponse {
  return {
    status,
    headers,
    body: (async function* () {
      if (body) yield body
    })(),
    destroy: () => undefined,
  }
}

const fetchDeps: FetchImageDeps = {
  resolve: async (host) =>
    host === 'intranet.example.com'
      ? [{ address: '10.0.0.7', family: 4 }]
      : [{ address: '93.184.216.34', family: 4 }],
  transport: async (url) => {
    netCalls.push(url.toString())
    switch (url.toString()) {
      case 'https://images.pexels.test/photos/1/iphone.jpeg':
        return reply(200, { 'content-type': 'image/jpeg' }, jpegBytes)
      case 'https://short.example.com/r':
        return reply(302, { location: `https://cdn.${BLOCKED_SOURCE_HOST}/photo.jpg` })
      default:
        return reply(404, {})
    }
  },
}

const stockFetch = vi.fn(async () =>
  Response.json({
    page: 1,
    per_page: 1,
    total_results: 1,
    photos: [
      {
        id: 7,
        width: 3000,
        height: 2000,
        url: 'https://www.pexels.com/photo/7/',
        photographer: 'Jane Doe',
        src: { original: 'https://images.pexels.test/photos/1/iphone.jpeg' },
      },
    ],
  }),
)

function makeRoute(media: McpMediaOptions, deps: { limiter?: RateLimiter } = {}) {
  return createMcpRoute({ getPayload: async () => payload, siteUrl: SITE_URL, media, ...deps })
}

const route = makeRoute({ fetchDeps, pexelsApiKey: 'TEST-KEY', stockFetch: stockFetch as never })
const routeNoStock = makeRoute({ fetchDeps })

async function connect(key: string, handler = route): Promise<Client> {
  const client = new Client({ name: 'vitest-mcp-media', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(ENDPOINT), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
      fetch: async (input, init) => {
        const request = new Request(input, init)
        const fn = handler[request.method as 'GET' | 'POST' | 'DELETE']
        return fn ? fn(request) : new Response(null, { status: 405 })
      },
    }),
  )
  return client
}

async function enableKey(user: User): Promise<string> {
  const key = crypto.randomUUID()
  await payload.update({
    collection: 'users',
    id: user.id,
    data: { apiKey: key, enableAPIKey: true },
    ...as(user),
  })
  return key
}

function textOf(result: CallToolResult): string {
  const block = result.content[0]
  if (!block || block.type !== 'text') throw new Error('text emas')
  return block.text
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON javobini testda erkin tekshiramiz
function jsonOf(result: CallToolResult): any {
  return JSON.parse(textOf(result))
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult
  if (name === 'upload_media' && !result.isError) createdMedia.add(jsonOf(result).mediaId)
  if (name === 'save_rewrite' && !result.isError) {
    for (const tag of jsonOf(result).tags ?? []) if (tag.created) createdTags.add(tag.id)
  }
  return result
}

function codes(result: CallToolResult): string[] {
  return (jsonOf(result).errors ?? []).map((issue: { code: string }) => issue.code)
}

let counter = 0
async function draftPost(user: User, extra: Partial<Post> = {}): Promise<Post> {
  counter += 1
  const url = `${URL_PREFIX}${Date.now()}-${counter}`
  const item: ScrapedItem = await payload.create({
    collection: 'scraped-items',
    data: {
      title: `Apple event ${counter}`,
      source: source.id,
      status: 'scraped',
      url,
      urlHash: `mcp-media-test-${url}`,
      extractedText: 'Apple has delayed the iPhone 18 launch event to October.',
      language: 'en',
      score: 80,
    },
  })
  const post = await payload.create({
    collection: 'posts',
    data: {
      title: 'Qoralama',
      slug: testSlug('media'),
      category: category.id,
      workflowStatus: 'draft',
      assignee: user.id,
      sources: [{ url: item.url, name: 'MCP manba', scrapedItem: item.id }],
      ...extra,
    },
    ...as(user),
  })
  createdPosts.add(post.id)
  return post
}

/** Local API orqali (MCP'siz) — masalan, muharrir yuklagan litsenziyasi to'liq bo'lmagan rasm. */
async function directMedia(data: Partial<Media>): Promise<Media> {
  const media = await payload.create({
    collection: 'media',
    data: { alt: ALT, ...data },
    file: { data: jpegBytes, mimetype: 'image/jpeg', name: 'direct.jpg', size: jpegBytes.length },
    ...as(users.editor),
  })
  createdMedia.add(media.id)
  return media
}

const filler = (count: number) =>
  Array.from({ length: count }, (_, i) => `jumla${i % 17} maʼlumot`).join(' ')

function rewrite(postId: number, extraBody = '') {
  return {
    postId,
    title: `Apple iPhone 18 taqdimotini oktabrga koʻchirdi ${TOKEN}`,
    excerpt:
      'Apple iPhone 18 taqdimotini oktabr oyiga koʻchirdi. Bloomberg maʼlumotiga koʻra, ' +
      'kechikishga yangi A20 protsessorini ishlab chiqarishdagi muammolar sabab boʻlgan.',
    body: [
      `iPhone 18 taqdimoti oktabrga koʻchirildi. ${filler(80)}`,
      extraBody,
      '## iPhone 18 taqdimoti qachon boʻladi',
      '',
      `${filler(120)} Batafsil: [Apple](/gadjetlar/apple-2025) va [narxlar](/gadjetlar/narxlar).`,
      '',
      '## Oʻzbekiston uchun ahamiyati',
      '',
      `${filler(120)} Manba: [Bloomberg](https://www.bloomberg.com/news/x).`,
    ].join('\n\n'),
    category: category.slug,
    tags: ['Apple', `iPhone ${TOKEN}`, 'Bloomberg'],
  }
}

const SEO = {
  seoTitle: 'iPhone 18 taqdimoti oktabrga koʻchirildi',
  metaDescription:
    'iPhone 18 taqdimoti oktabrga koʻchirildi: Bloomberg maʼlumotiga koʻra, sabab — yangi ' +
    'A20 protsessorini ishlab chiqarishdagi muammolar. Sanalar va tafsilotlar.',
  focusKeyword: 'iPhone 18 taqdimoti',
  coverAlt: 'Apple logotipi tushirilgan sahna va taqdimot zali',
}

async function cleanup() {
  for (const id of createdPosts) {
    await payload.delete({ collection: 'posts', id }).catch(() => undefined)
  }
  for (const id of createdMedia) {
    await payload.delete({ collection: 'media', id }).catch(() => undefined)
  }
  for (const id of createdTags) {
    await payload.delete({ collection: 'tags', id }).catch(() => undefined)
  }
  await payload.delete({ collection: 'tags', where: { name: { like: 'mcpm' } } })
  await payload.delete({ collection: 'media', where: { alt: { like: 'mcpm' } } })
  await payload.delete({ collection: 'scraped-items', where: { url: { like: URL_PREFIX } } })
  await deleteTestContent(payload)
  await payload.delete({ collection: 'sources', where: { slug: { like: TEST_SLUG_PREFIX } } })
  await deleteTestUsers(payload)
}

describe('MCP media toollari (/api/mcp)', () => {
  beforeAll(async () => {
    await ensureBucket(createTestS3Client())
    payload = await initTestPayload()
    await cleanup()
    jpegBytes = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: '#2255aa' },
    })
      .jpeg()
      .toBuffer()
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    // Yangilik manbasi: uning domeni (va subdomenlari) rasm manbasi sifatida taqiqlanadi.
    source = await payload.create({
      collection: 'sources',
      data: {
        name: 'MCP media manbasi',
        slug: testSlug('msrc'),
        homepageUrl: `https://www.${BLOCKED_SOURCE_HOST}/`,
        feeds: [{ url: `https://feeds.${BLOCKED_SOURCE_HOST}/rss`, mapsTo: category.id }],
        language: 'en',
        fetchMode: 'rss_only',
        priority: 50,
      },
    })
    editorKey = await enableKey(users.editor)
    editor2Key = await enableKey(users.editor2)
  })

  beforeEach(() => {
    apiKeyRateLimiter.reset()
    mediaUploadLimiter.reset()
  })

  afterAll(async () => {
    if (payload) await cleanup()
    await payload?.db?.destroy?.()
  })

  it('upload_media (base64): media, variantlar, kirill alt, uploadedVia, audit', async () => {
    const client = await connect(editorKey)
    const result = await call(client, 'upload_media', {
      data: `data:image/jpeg;base64,${jpegBytes.toString('base64')}`,
      filename: '../Apple iPhone 18.png',
      alt: ALT,
      caption: 'Apple taqdimoti',
      license: 'press_kit',
      credit: 'Rasm: Apple',
      sourceUrl: 'https://www.apple.com/newsroom/',
    })
    expect(result.isError).toBeFalsy()
    const body = jsonOf(result)
    expect(body).toMatchObject({ ok: true, uploaded: true })
    expect(body.media).toMatchObject({
      id: body.mediaId,
      width: 1600,
      height: 900,
      license: 'press_kit',
      credit: 'Rasm: Apple',
      uploadedVia: 'mcp',
      markdown: `![${ALT}](media:${body.mediaId})`,
    })
    expect(body.media.filename).toMatch(/^apple-iphone-18(-\d+)?\.jpg$/)
    expect(body.media.url).toMatch(/^https?:\/\//)
    expect(Object.keys(body.media.sizes)).toEqual(expect.arrayContaining(['thumb', 'card', 'hero']))

    const stored = await payload.findByID({ collection: 'media', id: body.mediaId, depth: 0 })
    expect(stored.uploadedVia).toBe('mcp')
    expect(stored.uploadedBy).toBe(users.editor.id)
    expect(stored.sourceUrl).toBe('https://www.apple.com/newsroom/')
    const cyrl = await payload.findByID({
      collection: 'media',
      id: body.mediaId,
      locale: 'uz-Cyrl',
      fallbackLocale: false,
    })
    expect(cyrl.alt).toMatch(/[Ѐ-ӿ]/)
    expect(cyrl.caption).toMatch(/[Ѐ-ӿ]/)

    const audit = await payload.find({
      collection: 'audit-logs',
      where: {
        and: [{ collection: { equals: 'media' } }, { docId: { equals: String(body.mediaId) } }],
      },
      depth: 0,
    })
    expect(audit.docs.length).toBeGreaterThan(0)
    expect(audit.docs[0]).toMatchObject({
      channel: 'mcp',
      tool: 'upload_media',
      user: users.editor.id,
    })
  })

  it('upload_media (url): Pexels rasmi; sourceUrl — yakuniy URL (berilmasa)', async () => {
    const client = await connect(editorKey)
    const result = await call(client, 'upload_media', {
      url: 'https://images.pexels.test/photos/1/iphone.jpeg',
      alt: ALT,
      license: 'pexels',
      credit: 'Rasm: Jane Doe / Pexels',
    })
    expect(result.isError).toBeFalsy()
    const body = jsonOf(result)
    expect(body.media).toMatchObject({
      license: 'pexels',
      sourceUrl: 'https://images.pexels.test/photos/1/iphone.jpeg',
    })
    expect(body.media.filename).toMatch(/^iphone(-\d+)?\.jpg$/)
  })

  it('litsenziya va alt qoidalari — saqlanmaydi', async () => {
    const client = await connect(editorKey)
    const base = { data: jpegBytes.toString('base64'), filename: 'a.jpg', alt: ALT }
    const noCredit = await call(client, 'upload_media', { ...base, license: 'unsplash' })
    expect(noCredit.isError).toBe(true)
    expect(codes(noCredit)).toEqual(['credit_required'])
    const ccBy = await call(client, 'upload_media', { ...base, license: 'cc_by', credit: 'X' })
    expect(codes(ccBy)).toEqual(['license_url_required'])
    const other = await call(client, 'upload_media', { ...base, license: 'other', credit: 'X' })
    expect(codes(other)).toEqual(['license_note_required'])
    const shortAlt = await call(client, 'upload_media', { ...base, alt: 'iPhone', license: 'own' })
    expect(codes(shortAlt)).toEqual(['alt_words'])
    const cyrAlt = await call(client, 'upload_media', {
      ...base,
      alt: 'Айфон смартфони оқ фонда олд томондан',
      license: 'own',
    })
    expect(codes(cyrAlt)).toEqual(['cyrillic_in_latin'])
    const noLicense = await call(client, 'upload_media', { ...base })
    expect(noLicense.isError).toBe(true)
    expect(textOf(noLicense)).toMatch(/license/)
    const both = await call(client, 'upload_media', {
      ...base,
      url: 'https://images.pexels.test/x.jpg',
      license: 'own',
    })
    expect(textOf(both)).toMatch(/aynan bittasini/)
    const { totalDocs } = await payload.count({
      collection: 'media',
      where: {
        and: [{ alt: { like: TOKEN } }, { license: { in: ['unsplash', 'cc_by', 'other'] } }],
      },
    })
    expect(totalDocs).toBe(0)
  })

  it('taqiqlangan manbalar: agentlik, sources domeni, redirect, sourceUrl, ichki tarmoq', async () => {
    const client = await connect(editorKey)
    const base = { alt: ALT, license: 'own' }
    const getty = await call(client, 'upload_media', {
      ...base,
      url: 'https://media.gettyimages.com/id/1/photo.jpg',
    })
    expect(getty.isError).toBe(true)
    expect(textOf(getty)).toMatch(/taqiqlangan/)
    const news = await call(client, 'upload_media', {
      ...base,
      url: `https://cdn.${BLOCKED_SOURCE_HOST}/photo.jpg`,
    })
    expect(textOf(news)).toMatch(new RegExp(`taqiqlangan.*${BLOCKED_SOURCE_HOST}`))
    const redirect = await call(client, 'upload_media', {
      ...base,
      url: 'https://short.example.com/r',
    })
    expect(textOf(redirect)).toMatch(/taqiqlangan/)
    const source = await call(client, 'upload_media', {
      ...base,
      data: jpegBytes.toString('base64'),
      sourceUrl: 'https://www.reuters.com/world/x',
    })
    expect(codes(source)).toEqual(['blocked_source'])
    const intranet = await call(client, 'upload_media', {
      ...base,
      url: 'https://intranet.example.com/a.jpg',
    })
    expect(textOf(intranet)).toMatch(/Ichki tarmoq/)
    const metadata = await call(client, 'upload_media', {
      ...base,
      url: 'http://169.254.169.254/latest/meta-data/',
    })
    expect(textOf(metadata)).toMatch(/Ichki tarmoq/)
    expect(netCalls.some((url) => /gettyimages|mcp-media-news|intranet|169\.254/.test(url))).toBe(
      false,
    )
  })

  it('format va hajm: SVG, GIF, 10 MB dan katta — rad', async () => {
    const client = await connect(editorKey)
    const base = { alt: ALT, license: 'own', filename: 'a.jpg' }
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')
    const svgResult = await call(client, 'upload_media', { ...base, data: svg.toString('base64') })
    expect(textOf(svgResult)).toMatch(/JPEG, PNG yoki WebP emas/)
    const gif = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64')
    const gifResult = await call(client, 'upload_media', { ...base, data: gif.toString('base64') })
    expect(textOf(gifResult)).toMatch(/JPEG, PNG yoki WebP emas/)
    const big = Buffer.alloc(MAX_MEDIA_BYTES + 3, 1)
    const bigResult = await call(client, 'upload_media', { ...base, data: big.toString('base64') })
    expect(bigResult.isError).toBe(true)
    expect(textOf(bigResult)).toMatch(/10 MB/)
  })

  it('set_cover: muqova va coverAlt; egalik, holat, noma’lum va litsenziyasiz media', async () => {
    const client = await connect(editorKey)
    const uploaded = jsonOf(
      await call(client, 'upload_media', {
        data: jpegBytes.toString('base64'),
        filename: 'cover.jpg',
        alt: ALT,
        license: 'own',
      }),
    )
    const post = await draftPost(users.editor)
    const ok = await call(client, 'set_cover', {
      postId: post.id,
      mediaId: uploaded.mediaId,
      alt: 'Apple iPhone 18 taqdimoti sahnasi va tomoshabinlar zali',
    })
    expect(ok.isError).toBeFalsy()
    expect(jsonOf(ok)).toMatchObject({
      ok: true,
      saved: true,
      post: { id: post.id, workflowStatus: 'in_progress', coverImage: uploaded.mediaId },
    })
    const stored = await payload.findByID({
      collection: 'posts',
      id: post.id,
      draft: true,
      depth: 0,
    })
    expect(stored.coverImage).toBe(uploaded.mediaId)
    expect(stored.coverAlt).toBe('Apple iPhone 18 taqdimoti sahnasi va tomoshabinlar zali')
    const cyrl = await payload.findByID({
      collection: 'posts',
      id: post.id,
      draft: true,
      locale: 'uz-Cyrl',
      fallbackLocale: false,
    })
    expect(cyrl.coverAlt).toMatch(/[Ѐ-ӿ]/)

    // Boshqa muharrirning agenti — rad.
    const other = await connect(editor2Key)
    const foreign = await call(other, 'set_cover', { postId: post.id, mediaId: uploaded.mediaId })
    expect(foreign.isError).toBe(true)
    expect(textOf(foreign)).toMatch(/boshqa foydalanuvchiga/)

    // review holatidagi post — rad.
    const review = await draftPost(users.editor)
    await call(client, 'claim_draft', { postId: review.id })
    await payload.update({
      collection: 'posts',
      id: review.id,
      data: { workflowStatus: 'review' },
      ...as(users.editor),
    })
    const inReview = await call(client, 'set_cover', {
      postId: review.id,
      mediaId: uploaded.mediaId,
    })
    expect(textOf(inReview)).toMatch(/"review" holatida/)

    const missing = await call(client, 'set_cover', { postId: post.id, mediaId: 99_999_999 })
    expect(textOf(missing)).toMatch(/Media topilmadi/)

    const unlicensed = await directMedia({ license: 'unsplash', credit: null })
    const bad = await call(client, 'set_cover', { postId: post.id, mediaId: unlicensed.id })
    expect(codes(bad)).toEqual(['media_license'])

    const badAlt = await call(client, 'set_cover', {
      postId: post.id,
      mediaId: uploaded.mediaId,
      alt: 'qisqa',
    })
    expect(codes(badAlt)).toEqual(['alt_words'])
  })

  it('save_rewrite: ![alt](media:ID) → upload tuguni; noma’lum/litsenziyasiz — xato; tashqi — olib tashlanadi', async () => {
    const client = await connect(editorKey)
    const media = jsonOf(
      await call(client, 'upload_media', {
        data: jpegBytes.toString('base64'),
        filename: 'body.jpg',
        alt: ALT,
        license: 'ai_generated',
      }),
    ).media
    expect(media.credit).toBe('Rasm: AI yordamida yaratilgan')
    const post = await draftPost(users.editor)

    const unknown = await call(client, 'save_rewrite', rewrite(post.id, '![x](media:99999999)'))
    expect(unknown.isError).toBe(true)
    expect(codes(unknown)).toContain('media_not_found')

    const unlicensed = await directMedia({ license: 'cc_by', credit: 'X', licenseUrl: null })
    const badLicense = await call(
      client,
      'save_rewrite',
      rewrite(post.id, `![x](media:${unlicensed.id})`),
    )
    expect(codes(badLicense)).toContain('media_license')

    const blocked = await directMedia({
      license: 'own',
      sourceUrl: `https://www.${BLOCKED_SOURCE_HOST}/news/1`,
    })
    const badSource = await call(
      client,
      'save_rewrite',
      rewrite(post.id, `![x](media:${blocked.id})`),
    )
    expect(codes(badSource)).toContain('media_blocked_source')

    const ok = await call(
      client,
      'save_rewrite',
      rewrite(post.id, `![${ALT}](media:${media.id})\n\nTashqi: ![a](https://x.test/a.png)`),
    )
    expect(ok.isError).toBeFalsy()
    const body = jsonOf(ok)
    expect(body.media).toEqual([expect.objectContaining({ id: media.id })])
    expect(body.warnings.map((w: { code: string }) => w.code)).toContain('image_removed')

    const stored = await payload.findByID({
      collection: 'posts',
      id: post.id,
      draft: true,
      depth: 1,
    })
    const nodes = (stored.content as { root: { children: Record<string, unknown>[] } }).root
      .children
    const upload = nodes.find((node) => node.type === 'upload')
    expect(upload).toMatchObject({ relationTo: 'media', value: { id: media.id } })
    expect(JSON.stringify(stored.content)).not.toContain('x.test')
    // Kirill versiyasida ham rasm tuguni saqlanadi (matn o'giriladi, media ID o'zgarmaydi).
    const cyrl = await payload.findByID({
      collection: 'posts',
      id: post.id,
      draft: true,
      depth: 0,
      locale: 'uz-Cyrl',
      fallbackLocale: false,
    })
    const cyrlNodes = (cyrl.content as { root: { children: Record<string, unknown>[] } }).root
      .children
    expect(cyrlNodes.find((node) => node.type === 'upload')).toMatchObject({ value: media.id })
  })

  it('submit_for_review: muqovasiz — cover_missing ogohlantirishi, muqova bilan — yo‘q', async () => {
    const client = await connect(editorKey)
    const noCover = await draftPost(users.editor)
    expect((await call(client, 'save_rewrite', rewrite(noCover.id))).isError).toBeFalsy()
    expect((await call(client, 'set_seo', { postId: noCover.id, ...SEO })).isError).toBeFalsy()
    const submitted = await call(client, 'submit_for_review', { postId: noCover.id })
    expect(submitted.isError).toBeFalsy()
    const body = jsonOf(submitted)
    expect(body.submitted).toBe(true)
    expect(body.warnings.map((w: { code: string }) => w.code)).toContain('cover_missing')

    const withCover = await draftPost(users.editor)
    const media = jsonOf(
      await call(client, 'upload_media', {
        data: jpegBytes.toString('base64'),
        filename: 'c.jpg',
        alt: ALT,
        license: 'own',
      }),
    )
    await call(client, 'save_rewrite', rewrite(withCover.id))
    await call(client, 'set_seo', { postId: withCover.id, ...SEO })
    await call(client, 'set_cover', { postId: withCover.id, mediaId: media.mediaId })
    const ok = jsonOf(await call(client, 'submit_for_review', { postId: withCover.id }))
    expect(ok.submitted).toBe(true)
    expect(ok.warnings.map((w: { code: string }) => w.code)).not.toContain('cover_missing')
  })

  it('list_media: qidiruv, litsenziya, mine, usable', async () => {
    const client = await connect(editorKey)
    const found = jsonOf(await call(client, 'list_media', { query: TOKEN, limit: 50 }))
    expect(found.totalDocs).toBeGreaterThan(0)
    expect(found.items.every((item: { alt: string }) => item.alt.includes(TOKEN))).toBe(true)
    const unusable = found.items.filter((item: { usable: boolean }) => !item.usable)
    expect(unusable.length).toBeGreaterThan(0)
    expect(unusable[0].problems.length).toBeGreaterThan(0)

    const pexels = jsonOf(await call(client, 'list_media', { query: TOKEN, license: 'pexels' }))
    expect(pexels.items.length).toBeGreaterThan(0)
    expect(pexels.items.every((item: { license: string }) => item.license === 'pexels')).toBe(true)

    const other = await connect(editor2Key)
    const mine = jsonOf(await call(other, 'list_media', { query: TOKEN, mine: true }))
    expect(mine.totalDocs).toBe(0)
    const paged = jsonOf(await call(client, 'list_media', { query: TOKEN, limit: 1, page: 2 }))
    expect(paged).toMatchObject({ page: 2, limit: 1 })
    expect(paged.items).toHaveLength(1)
  })

  it('search_stock_images: Pexels (soxta) va sozlanmagan server', async () => {
    const client = await connect(editorKey)
    const result = await call(client, 'search_stock_images', { query: 'iphone', limit: 1 })
    expect(result.isError).toBeFalsy()
    expect(jsonOf(result).candidates[0].uploadWith).toMatchObject({
      license: 'pexels',
      credit: 'Rasm: Jane Doe / Pexels',
    })
    const bare = await connect(editorKey, routeNoStock)
    const missing = await call(bare, 'search_stock_images', { query: 'iphone' })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toMatch(/sozlanmagan/)
  })

  // --- OBLOG-45: admin — kvotasiz va kalit limitisiz; editor — kvota + retryAfterSec ------------

  function uploadArgs(n: number) {
    return {
      data: `data:image/jpeg;base64,${jpegBytes.toString('base64')}`,
      filename: `kvota-${n}.jpg`,
      alt: `${ALT} kvota ${n}`,
      license: 'press_kit',
      credit: 'Rasm: Apple',
    }
  }

  it('upload_media kvotasi: editor — rate_limited + retryAfterSec, admin — kvotasiz', async () => {
    const uploadLimiter = createRateLimiter({ limit: 1, windowMs: 60 * 60 * 1000 })
    const quotaRoute = makeRoute({ fetchDeps, uploadLimiter })

    const editor = await connect(editorKey, quotaRoute)
    expect((await call(editor, 'upload_media', uploadArgs(1))).isError).toBeFalsy()
    const limited = await call(editor, 'upload_media', uploadArgs(2))
    expect(limited.isError).toBe(true)
    const body = jsonOf(limited)
    expect(body).toMatchObject({ ok: false, uploaded: false, limitPerHour: 1 })
    expect(codes(limited)).toEqual(['rate_limited'])
    expect(body.retryAfterSec).toBeGreaterThan(0)
    expect(body.retryAfterSec).toBeLessThanOrEqual(3600)
    expect(body.errors[0].message).toMatch(/soatiga 1 ta/)

    const adminKey = await enableKey(users.admin)
    const admin = await connect(adminKey, quotaRoute)
    for (let n = 3; n <= 5; n++) {
      const result = await call(admin, 'upload_media', uploadArgs(n))
      expect(result.isError).toBeFalsy()
      expect(jsonOf(result)).toMatchObject({ ok: true, uploaded: true })
    }
  })

  it('MCP: admin kaliti uchun kalit bo‘yicha limit yo‘q, editor — 429', async () => {
    const strictRoute = makeRoute({ fetchDeps }, { limiter: createRateLimiter({ limit: 1 }) })
    const adminKey = await enableKey(users.admin)
    const admin = await connect(adminKey, strictRoute)
    for (let i = 0; i < 3; i++) {
      const result = await call(admin, 'list_media', { query: TOKEN, limit: 1 })
      expect(result.isError).toBeFalsy()
    }
    // Editor: `initialize` + `notifications/initialized` — ikkinchi so'rovdayoq limit (1) oshadi.
    await expect(connect(editorKey, strictRoute)).rejects.toThrow(/429|juda ko/)
  })
})
