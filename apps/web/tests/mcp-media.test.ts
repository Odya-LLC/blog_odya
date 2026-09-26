import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { lexicalToMarkdown, markdownToLexical, mediaIdsFromLexical } from '@/mcp/markdown'
import {
  checkRemoteUrl,
  fetchRemoteImage,
  MAX_FETCH_BUDGET_MS,
  resolveFetchTimeouts,
  type FetchImageDeps,
  type ResolvedAddress,
  type TransportResponse,
} from '@/mcp/media-fetch'
import { mediaUsageIssues, sourceDomains } from '@/mcp/media-library'
import {
  baseDomain,
  blockedDomainOf,
  checkDimensions,
  checkMediaAlt,
  checkMediaLicense,
  checkMediaMeta,
  isBlockedAddress,
  safeFilename,
  sniffImageFormat,
  STATIC_BLOCKED_IMAGE_DOMAINS,
} from '@/mcp/media-policy'
import { decodeBase64Image, inspectImage } from '@/mcp/media-tools'
import { McpToolError } from '@/mcp/result'
import { MCP_MAX_DURATION } from '@/mcp/route'
import { PEXELS_LICENSE_URL, searchPexels } from '@/mcp/stock'

/**
 * MCP media (OBLOG-44) — sof funksiyalar: litsenziya/alt qoidalari, taqiqlangan domenlar, SSRF
 * (tarmoq va DNS soxta), format va o'lcham, `![alt](media:ID)` konvertatsiyasi, Pexels qidiruvi.
 */

const BLOCKED = [...STATIC_BLOCKED_IMAGE_DOMAINS, 'kun.uz']
const PUBLIC_IP: ResolvedAddress = { address: '93.184.216.34', family: 4 }
const GOOD_ALT = 'Apple iPhone 18 smartfoni oq fonda old tomondan'

async function jpeg(width = 800, height = 600): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#3366cc' } })
    .jpeg()
    .toBuffer()
}

async function png(width = 800, height = 600): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: '#ffffff' } })
    .png()
    .toBuffer()
}

function response(
  status: number,
  headers: Record<string, string>,
  body: Uint8Array[] = [],
): TransportResponse {
  return {
    status,
    headers,
    body: (async function* () {
      for (const chunk of body) yield chunk
    })(),
    destroy: vi.fn(),
  }
}

/** Soxta tarmoq: URL → javob; DNS: host → manzillar (standart — ommaviy IP). */
function fakeNet(
  routes: Record<string, () => TransportResponse | Promise<TransportResponse>>,
  dns: Record<string, ResolvedAddress[]> = {},
) {
  const calls: { url: string; address: string }[] = []
  const deps: FetchImageDeps = {
    resolve: async (host) => dns[host] ?? [PUBLIC_IP],
    transport: async (url, address) => {
      calls.push({ url: url.toString(), address: address.address })
      const route = routes[url.toString()]
      if (!route) throw new Error(`no route ${url.toString()}`)
      return route()
    },
  }
  return { deps, calls }
}

async function rejects(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toBeInstanceOf(McpToolError)
  await expect(promise).rejects.toThrow(pattern)
}

describe('media-policy: litsenziya va alt', () => {
  it('license majburiy; cc_by — licenseUrl, other — licenseNote, kredit shartli', () => {
    expect(checkMediaLicense({ license: undefined }).map((e) => e.code)).toEqual([
      'license_required',
    ])
    expect(checkMediaLicense({ license: 'own' })).toEqual([])
    expect(checkMediaLicense({ license: 'ai_generated' })).toEqual([])
    expect(
      checkMediaLicense({ license: 'cc_by', credit: 'Rasm: X / Wikimedia' }).map((e) => e.code),
    ).toEqual(['license_url_required'])
    expect(
      checkMediaLicense({
        license: 'cc_by',
        credit: 'Rasm: X',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      }),
    ).toEqual([])
    expect(checkMediaLicense({ license: 'other', credit: 'X' }).map((e) => e.code)).toEqual([
      'license_note_required',
    ])
    expect(checkMediaLicense({ license: 'unsplash' }).map((e) => e.code)).toEqual([
      'credit_required',
    ])
    expect(
      checkMediaLicense({ license: 'pexels', credit: 'X', licenseUrl: 'ftp://x' }).map(
        (e) => e.code,
      ),
    ).toEqual(['invalid_url'])
  })

  it('alt: 5–15 so‘z, lotin, «rasm» bilan boshlanmaydi', () => {
    expect(checkMediaAlt(GOOD_ALT).errors).toEqual([])
    expect(checkMediaAlt('iPhone rasmi').errors.map((e) => e.code)).toEqual(['alt_words'])
    expect(checkMediaAlt(Array(16).fill('soʻz').join(' ')).errors.map((e) => e.code)).toEqual([
      'alt_words',
    ])
    expect(
      checkMediaAlt('Айфон смартфони оқ фонда олд томондан').errors.map((e) => e.code),
    ).toEqual(['cyrillic_in_latin'])
    expect(checkMediaAlt('   ').errors.map((e) => e.code)).toEqual(['required'])
    expect(checkMediaAlt('Rasm: Apple iPhone 18 oq fonda').warnings.map((w) => w.code)).toEqual([
      'starts_with_image',
    ])
    const meta = checkMediaMeta({
      alt: GOOD_ALT,
      caption: 'Изоҳ',
      license: 'own',
    })
    expect(meta.errors.map((e) => `${e.field}:${e.code}`)).toEqual(['caption:cyrillic_in_latin'])
  })
})

describe('media-policy: domenlar', () => {
  it('asosiy domen va subdomenlar', () => {
    expect(baseDomain('feeds.bbci.co.uk')).toBe('bbci.co.uk')
    expect(baseDomain('www.kun.uz')).toBe('kun.uz')
    expect(baseDomain('cdn.daryo.uz')).toBe('daryo.uz')
    expect(baseDomain('habr.com')).toBe('habr.com')
    expect(blockedDomainOf('media.gettyimages.com', BLOCKED)).toBe('gettyimages.com')
    expect(blockedDomainOf('habrastorage.org', BLOCKED)).toBe('habrastorage.org')
    expect(blockedDomainOf('KUN.UZ.', BLOCKED)).toBe('kun.uz')
    expect(blockedDomainOf('images.pexels.com', BLOCKED)).toBeNull()
    expect(blockedDomainOf('notgettyimages.com', BLOCKED)).toBeNull()
  })

  it('sources kolleksiyasidan domenlar (sayt va RSS)', () => {
    expect(
      sourceDomains([
        { homepageUrl: 'https://www.kun.uz/', feeds: [{ url: 'https://feeds.kun.uz/rss' }] },
        { homepageUrl: 'https://habr.com/ru/', feeds: [{ url: 'https://habr.com/ru/rss/all/' }] },
        { homepageUrl: 'not a url', feeds: [] },
      ] as never),
    ).toEqual(['kun.uz', 'habr.com'])
  })

  it('media ishlatilishi: litsenziya va taqiqlangan manba', () => {
    expect(
      mediaUsageIssues({ id: 1, license: 'own', sourceUrl: null } as never, BLOCKED, 'body'),
    ).toEqual([])
    expect(
      mediaUsageIssues({ id: 2, license: 'unsplash', credit: null } as never, BLOCKED, 'body').map(
        (i) => i.code,
      ),
    ).toEqual(['media_license'])
    expect(
      mediaUsageIssues(
        { id: 3, license: 'own', sourceUrl: 'https://kun.uz/news/1' } as never,
        BLOCKED,
        'body',
      ).map((i) => i.code),
    ).toEqual(['media_blocked_source'])
  })
})

describe('media-policy: IP manzillar (SSRF)', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '64:ff9b::a9fe:a9fe',
    'fe80::1',
    'fd00:ec2::254',
    'fc00::1',
    'ff02::1',
    '2001:db8::1',
    '2002:7f00:1::1',
    'not-an-ip',
  ])('%s — taqiqlangan', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true)
  })

  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    '%s — ommaviy',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false)
    },
  )
})

describe('media-fetch: URL tekshiruvi', () => {
  it.each([
    ['ftp://example.com/a.jpg', /http/],
    ['file:///etc/passwd', /http/],
    ['javascript:alert(1)', /http/],
    ['https://user:pass@example.com/a.jpg', /login/],
    ['https://example.com:8080/a.jpg', /port/],
    ['http://localhost/a.jpg', /Ichki/],
    ['http://printer.local/a.jpg', /Ichki/],
    ['http://127.0.0.1/a.jpg', /Ichki/],
    ['http://[::1]/a.jpg', /Ichki/],
    ['http://169.254.169.254/latest/meta-data', /Ichki/],
    ['https://media.gettyimages.com/photo.jpg', /taqiqlangan/],
    ['https://www.reuters.com/a.jpg', /taqiqlangan/],
    ['https://habrastorage.org/a.png', /taqiqlangan/],
    ['https://cdn.kun.uz/a.jpg', /taqiqlangan/],
    ['nonsense', /Noto'g'ri/],
  ])('%s — rad etiladi', (url, pattern) => {
    expect(() => checkRemoteUrl(url, BLOCKED)).toThrow(pattern)
  })

  it('oddiy https va http:443 — ruxsat', () => {
    expect(checkRemoteUrl('https://images.pexels.com/a.jpg', BLOCKED).hostname).toBe(
      'images.pexels.com',
    )
    expect(checkRemoteUrl('https://example.com:443/a.jpg', BLOCKED).port).toBe('')
  })
})

describe('media-fetch: yuklab olish (soxta tarmoq/DNS)', () => {
  it('JPEG yuklanadi, ulanish tekshirilgan IP ga', async () => {
    const data = await jpeg()
    const { deps, calls } = fakeNet({
      'https://images.example.com/a.jpg': () =>
        response(200, { 'content-type': 'image/jpeg' }, [
          data.subarray(0, 100),
          data.subarray(100),
        ]),
    })
    const result = await fetchRemoteImage('https://images.example.com/a.jpg', BLOCKED, deps)
    expect(result.format).toBe('jpeg')
    expect(result.data.equals(data)).toBe(true)
    expect(calls).toEqual([{ url: 'https://images.example.com/a.jpg', address: PUBLIC_IP.address }])
  })

  it('DNS ichki manzilga (yoki aralash) qaytarsa — ulanishsiz rad etiladi', async () => {
    const { deps, calls } = fakeNet(
      {},
      {
        'internal.example.com': [{ address: '10.0.0.5', family: 4 }],
        'mixed.example.com': [PUBLIC_IP, { address: '169.254.169.254', family: 4 }],
        'v6.example.com': [{ address: 'fd00::1', family: 6 }],
      },
    )
    await rejects(fetchRemoteImage('https://internal.example.com/a.jpg', BLOCKED, deps), /Ichki/)
    await rejects(fetchRemoteImage('https://mixed.example.com/a.jpg', BLOCKED, deps), /Ichki/)
    await rejects(fetchRemoteImage('https://v6.example.com/a.jpg', BLOCKED, deps), /Ichki/)
    expect(calls).toEqual([])
  })

  it('redirect: taqiqlangan domen, ichki IP, sxema — rad; ruxsat etilgani — kuzatiladi', async () => {
    const data = await png()
    const { deps, calls } = fakeNet(
      {
        'https://a.example.com/getty': () =>
          response(302, { location: 'https://media.gettyimages.com/x.jpg' }),
        'https://a.example.com/meta': () => response(301, { location: 'http://169.254.169.254/' }),
        'https://a.example.com/rebind': () =>
          response(302, { location: 'https://rebind.example.com/x.jpg' }),
        'https://a.example.com/file': () => response(302, { location: 'file:///etc/passwd' }),
        'https://a.example.com/ok': () => response(302, { location: '/final.png' }),
        'https://a.example.com/final.png': () =>
          response(200, { 'content-type': 'image/png' }, [data]),
      },
      { 'rebind.example.com': [{ address: '127.0.0.1', family: 4 }] },
    )
    await rejects(fetchRemoteImage('https://a.example.com/getty', BLOCKED, deps), /taqiqlangan/)
    await rejects(fetchRemoteImage('https://a.example.com/meta', BLOCKED, deps), /Ichki/)
    await rejects(fetchRemoteImage('https://a.example.com/rebind', BLOCKED, deps), /Ichki/)
    await rejects(fetchRemoteImage('https://a.example.com/file', BLOCKED, deps), /http/)
    const ok = await fetchRemoteImage('https://a.example.com/ok', BLOCKED, deps)
    expect(ok.finalUrl).toBe('https://a.example.com/final.png')
    expect(ok.chain).toEqual(['https://a.example.com/ok', 'https://a.example.com/final.png'])
    expect(calls.some((call) => call.url.includes('gettyimages'))).toBe(false)
  })

  it("juda ko'p redirect", async () => {
    const { deps } = fakeNet({
      'https://loop.example.com/a': () => response(302, { location: '/a' }),
    })
    await rejects(fetchRemoteImage('https://loop.example.com/a', BLOCKED, deps), /redirect/)
  })

  it('SVG, HTML, noma’lum baytlar, HTTP xato — rad', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    const { deps } = fakeNet({
      'https://x.example.com/a.svg': () =>
        response(200, { 'content-type': 'image/svg+xml' }, [svg]),
      'https://x.example.com/page': () => response(200, { 'content-type': 'text/html' }, [svg]),
      'https://x.example.com/fake.jpg': () =>
        response(200, { 'content-type': 'image/jpeg' }, [svg]),
      'https://x.example.com/404.jpg': () => response(404, {}),
    })
    await rejects(fetchRemoteImage('https://x.example.com/a.svg', BLOCKED, deps), /Content-Type/)
    await rejects(fetchRemoteImage('https://x.example.com/page', BLOCKED, deps), /Content-Type/)
    await rejects(fetchRemoteImage('https://x.example.com/fake.jpg', BLOCKED, deps), /JPEG, PNG/)
    await rejects(fetchRemoteImage('https://x.example.com/404.jpg', BLOCKED, deps), /HTTP 404/)
  })

  it('hajm: Content-Length va oqim bo‘yicha', async () => {
    const chunk = new Uint8Array(600)
    const declared = response(200, { 'content-type': 'image/jpeg', 'content-length': '5000' })
    const streamed = response(200, { 'content-type': 'image/jpeg' }, [chunk, chunk])
    const { deps } = fakeNet({
      'https://x.example.com/declared.jpg': () => declared,
      'https://x.example.com/streamed.jpg': () => streamed,
    })
    const small = { ...deps, maxBytes: 1000 }
    await rejects(fetchRemoteImage('https://x.example.com/declared.jpg', BLOCKED, small), /katta/)
    await rejects(fetchRemoteImage('https://x.example.com/streamed.jpg', BLOCKED, small), /katta/)
    expect(streamed.destroy).toHaveBeenCalled()
  })

  it('ulanish timeout: javob bermayotgan host tez rad etiladi (bitta qayta urinish bilan)', async () => {
    let attempts = 0
    const deps: FetchImageDeps = {
      resolve: async () => [PUBLIC_IP],
      connectTimeoutMs: 20,
      timeoutMs: 5_000,
      transport: (_url, _address, signal) => {
        attempts += 1
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
      },
    }
    const started = Date.now()
    await rejects(
      fetchRemoteImage('https://slow.example.com/a.jpg', BLOCKED, deps),
      /slow\.example\.com 0\.02 s ichida javob bermadi/,
    )
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(attempts).toBe(2)
  })

  it('sekin tana ulanish timeoutidan uzoq, lekin tana timeoutiga sig‘adi — muvaffaqiyat', async () => {
    const data = await jpeg()
    const parts = [data.subarray(0, 200), data.subarray(200, 1000), data.subarray(1000)]
    const deps: FetchImageDeps = {
      resolve: async () => [PUBLIC_IP],
      connectTimeoutMs: 30,
      timeoutMs: 2_000,
      transport: async () => ({
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
        body: (async function* () {
          for (const part of parts) {
            await new Promise((resolve) => setTimeout(resolve, 40))
            yield part
          }
        })(),
        destroy: vi.fn(),
      }),
    }
    const result = await fetchRemoteImage('https://slow.example.com/a.jpg', BLOCKED, deps)
    expect(result.data.equals(data)).toBe(true)
  })

  it('tana to‘xtab qolsa — tana timeout; host va olingan baytlar xabarda, qayta urinish yo‘q', async () => {
    let attempts = 0
    const destroy = vi.fn()
    const deps: FetchImageDeps = {
      resolve: async () => [PUBLIC_IP],
      connectTimeoutMs: 1_000,
      timeoutMs: 50,
      transport: async () => {
        attempts += 1
        return {
          status: 200,
          headers: { 'content-type': 'image/jpeg', 'content-length': '2097152' },
          body: (async function* () {
            yield new Uint8Array(2048)
            await new Promise(() => undefined)
          })(),
          destroy,
        }
      },
    }
    await rejects(
      fetchRemoteImage('https://stall.example.com/a.jpg', BLOCKED, deps),
      /juda sekin: stall\.example\.com dan 0\.05 s ichida faqat 2 KB \/ 2\.0 MB/,
    )
    expect(attempts).toBe(1)
    expect(destroy).toHaveBeenCalled()
  })

  it('tana o‘rtasida uzilish — bitta qayta urinish; ikkinchi uzilish — xato', async () => {
    const data = await jpeg()
    let attempts = 0
    const broken = (): TransportResponse => ({
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
      body: (async function* () {
        yield data.subarray(0, 100)
        throw new Error('ECONNRESET')
      })(),
      destroy: vi.fn(),
    })
    const { deps } = fakeNet({
      'https://flaky.example.com/a.jpg': () => {
        attempts += 1
        return attempts === 1 ? broken() : response(200, { 'content-type': 'image/jpeg' }, [data])
      },
      'https://broken.example.com/a.jpg': broken,
    })
    const ok = await fetchRemoteImage('https://flaky.example.com/a.jpg', BLOCKED, deps)
    expect(ok.data.equals(data)).toBe(true)
    expect(ok.chain).toEqual(['https://flaky.example.com/a.jpg'])
    expect(attempts).toBe(2)
    await rejects(
      fetchRemoteImage('https://broken.example.com/a.jpg', BLOCKED, deps),
      /uzilish: broken\.example\.com ulanishni uzdi \(100 bayt olindi\)/,
    )
  })

  it('ulanish xatosi — bitta qayta urinish; HTTP xato va hajm — qayta urinilmaydi', async () => {
    const { deps, calls } = fakeNet({
      'https://x.example.com/404.jpg': () => response(404, {}),
    })
    await rejects(fetchRemoteImage('https://down.example.com/a.jpg', BLOCKED, deps), /ulanib/)
    expect(calls.filter((call) => call.url.includes('down.example.com'))).toHaveLength(2)
    await rejects(fetchRemoteImage('https://x.example.com/404.jpg', BLOCKED, deps), /HTTP 404/)
    expect(calls.filter((call) => call.url.includes('404'))).toHaveLength(1)
  })

  it('umumiy chegara: qayta urinish uchun byudjet qolmasa — urinilmaydi', async () => {
    let attempts = 0
    const deps: FetchImageDeps = {
      resolve: async () => [PUBLIC_IP],
      connectTimeoutMs: 40,
      timeoutMs: 1_000,
      totalTimeoutMs: 60,
      transport: (_url, _address, signal) => {
        attempts += 1
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
      },
    }
    await rejects(
      fetchRemoteImage('https://slow.example.com/a.jpg', BLOCKED, deps),
      /javob bermadi/,
    )
    expect(attempts).toBe(1)
  })

  it('timeout’lar: env standartlari va umumiy 90 s chegarasi', () => {
    expect(resolveFetchTimeouts()).toEqual({ connectMs: 10_000, bodyMs: 45_000, totalMs: 65_000 })
    expect(resolveFetchTimeouts({ timeoutMs: 120_000 }).totalMs).toBe(MAX_FETCH_BUDGET_MS)
    // Route `maxDuration` yuklab olish byudjeti + qayta ishlash (≥ 30 s) ni sig‘diradi.
    expect(MCP_MAX_DURATION * 1000).toBeGreaterThanOrEqual(MAX_FETCH_BUDGET_MS + 30_000)
  })

  // Qo'lda: `MEDIA_FETCH_LIVE_URL=<url> pnpm vitest run tests/mcp-media.test.ts` — haqiqiy tarmoq
  // va standart timeout'lar (OBLOG-46 reproduksiyasi: sekin press-sayt). CI'da o'chiq.
  it.runIf(process.env.MEDIA_FETCH_LIVE_URL)(
    'haqiqiy tarmoq: sekin press-rasm yuklanadi',
    async () => {
      const started = Date.now()
      const result = await fetchRemoteImage(process.env.MEDIA_FETCH_LIVE_URL!, BLOCKED)
      console.info(
        `live: ${result.data.length} bayt, ${result.format}, ${Date.now() - started} ms, ${result.finalUrl}`,
      )
      expect(result.data.length).toBeGreaterThan(0)
    },
    120_000,
  )

  it('haqiqiy DNS: localhost / 127.0.0.1 ga ulanilmaydi', async () => {
    await rejects(fetchRemoteImage('http://127.0.0.1/a.jpg', BLOCKED), /Ichki/)
    await rejects(fetchRemoteImage('http://localhost/a.jpg', BLOCKED), /Ichki/)
  })
})

describe('format, o‘lcham, base64', () => {
  it('magic bytes', async () => {
    expect(sniffImageFormat(await jpeg())).toBe('jpeg')
    expect(sniffImageFormat(await png())).toBe('png')
    const webp = await sharp(await png())
      .webp()
      .toBuffer()
    expect(sniffImageFormat(webp)).toBe('webp')
    expect(sniffImageFormat(Buffer.from('GIF89a......'))).toBeNull()
    expect(sniffImageFormat(Buffer.from('<svg></svg>'))).toBeNull()
  })

  it('o‘lcham chegaralari', async () => {
    expect(checkDimensions(1600, 900)).toBeNull()
    expect(checkDimensions(300, 900)).toMatch(/kichik/)
    expect(checkDimensions(12_000, 900)).toMatch(/katta/)
    await expect(inspectImage(await jpeg(300, 150))).rejects.toThrow(/kichik/)
    await expect(inspectImage(await jpeg(1200, 630))).resolves.toMatchObject({
      format: 'jpeg',
      width: 1200,
      height: 630,
    })
    // Sarlavhasi JPEG, lekin buzilgan fayl.
    await expect(
      inspectImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)])),
    ).rejects.toThrow(/o'qib bo'lmadi/)
  })

  it('base64 va data URI', async () => {
    const data = await png()
    expect(decodeBase64Image(data.toString('base64')).equals(data)).toBe(true)
    expect(decodeBase64Image(`data:image/png;base64,${data.toString('base64')}`).equals(data)).toBe(
      true,
    )
    expect(() => decodeBase64Image('data:image/svg+xml,<svg/>')).toThrow(/base64/)
    expect(() => decodeBase64Image('!!!not base64!!!')).toThrow(/base64/)
    expect(() => decodeBase64Image('')).toThrow(/base64/)
  })

  it('fayl nomi xavfsiz, kengaytma — haqiqiy formatdan', () => {
    expect(safeFilename('../../etc/passwd.svg', 'png')).toBe('etc-passwd.png')
    expect(safeFilename('Apple iPhone 18 (press).JPG', 'jpeg')).toBe('apple-iphone-18-press.jpg')
    expect(safeFilename(undefined, 'webp')).toBe('rasm.webp')
  })
})

describe('save_rewrite: ![alt](media:ID)', () => {
  it('alohida qatordagi media → upload tuguni; paragraf ichidagi — bo‘linadi', () => {
    const result = markdownToLexical(
      [
        'Birinchi paragraf matni.',
        '',
        '![Apple iPhone 18 oq fonda](media:12)',
        '',
        'Oldin ![ikkinchi](media:7) keyin.',
      ].join('\n'),
    )
    expect(result.errors).toEqual([])
    expect(result.media).toEqual([
      { id: 12, alt: 'Apple iPhone 18 oq fonda' },
      { id: 7, alt: 'ikkinchi' },
    ])
    const types = result.state.root.children.map((node) => node.type)
    expect(types).toEqual(['paragraph', 'upload', 'paragraph', 'upload', 'paragraph'])
    expect(result.state.root.children[1]).toMatchObject({
      type: 'upload',
      version: 3,
      relationTo: 'media',
      value: 12,
      fields: {},
    })
    expect(String(result.state.root.children[1]!.id)).toMatch(/^[0-9a-f]{24}$/)
    expect(mediaIdsFromLexical(result.state)).toEqual([12, 7])
    expect(lexicalToMarkdown(result.state)).toContain('![](media:12)')
    expect(result.stats.firstParagraph).toBe('Birinchi paragraf matni.')
  })

  it('reference sintaksisi ham ishlaydi', () => {
    const result = markdownToLexical('![logo][l]\n\n[l]: media:5')
    expect(result.media).toEqual([{ id: 5, alt: 'logo' }])
  })

  it('noto‘g‘ri ID — xato; tashqi URL — olib tashlanadi (ogohlantirish)', () => {
    const bad = markdownToLexical('![x](media:abc)\n\n![y](media:0)')
    expect(bad.errors.map((e) => e.code)).toEqual(['invalid_media_ref', 'invalid_media_ref'])
    const external = markdownToLexical('Matn ![rasm](https://x.test/a.png) davomi.')
    expect(external.media).toEqual([])
    expect(external.warnings.map((w) => w.code)).toEqual(['image_removed'])
    expect(external.state.root.children.map((node) => node.type)).toEqual(['paragraph'])
    expect(JSON.stringify(external.state)).not.toContain('x.test')
  })

  it('ro‘yxat/sarlavha/havola ichidagi media — olib tashlanadi', () => {
    const result = markdownToLexical('- band ![a](media:3)\n\n[![b](media:4)](https://x.test)')
    expect(result.media).toEqual([])
    expect(result.warnings.map((w) => w.code)).toContain('media_not_block')
    expect(JSON.stringify(result.state)).not.toContain('"upload"')
  })
})

describe('search_stock_images: Pexels', () => {
  it('kalit yo‘q — tushunarli xato', async () => {
    await expect(searchPexels({ query: 'x', page: 1, limit: 5 }, undefined)).rejects.toThrow(
      /sozlanmagan/,
    )
  })

  it('nomzodlar va upload_media argumentlari', async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        page: 1,
        per_page: 2,
        total_results: 40,
        next_page: 'https://api.pexels.com/v1/search?page=2',
        photos: [
          {
            id: 101,
            width: 4000,
            height: 2667,
            url: 'https://www.pexels.com/photo/iphone-101/',
            photographer: 'Jane Doe',
            photographer_url: 'https://www.pexels.com/@jane',
            alt: 'Black iPhone on desk',
            src: {
              original: 'https://images.pexels.com/photos/101/a.jpeg',
              large2x: 'https://images.pexels.com/photos/101/a.jpeg?w=1880',
              medium: 'https://images.pexels.com/photos/101/a.jpeg?h=350',
            },
          },
        ],
      }),
    )
    const result = await searchPexels(
      { query: 'iphone', page: 1, limit: 2, orientation: 'landscape' },
      'KEY',
      fetchFn as unknown as typeof fetch,
    )
    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).toBe(
      'https://api.pexels.com/v1/search?query=iphone&page=1&per_page=2&orientation=landscape',
    )
    expect(new Headers(init.headers).get('authorization')).toBe('KEY')
    expect(result.hasNextPage).toBe(true)
    expect(result.candidates[0]).toMatchObject({
      id: 101,
      photographer: 'Jane Doe',
      uploadWith: {
        url: 'https://images.pexels.com/photos/101/a.jpeg?w=1880',
        license: 'pexels',
        credit: 'Rasm: Jane Doe / Pexels',
        sourceUrl: 'https://www.pexels.com/photo/iphone-101/',
        licenseUrl: PEXELS_LICENSE_URL,
      },
    })
  })

  it('API xatolari', async () => {
    const status = (code: number) => vi.fn(async () => new Response('', { status: code }))
    await expect(
      searchPexels({ query: 'x', page: 1, limit: 5 }, 'K', status(429) as never),
    ).rejects.toThrow(/limiti/)
    await expect(
      searchPexels({ query: 'x', page: 1, limit: 5 }, 'K', status(500) as never),
    ).rejects.toThrow(/HTTP 500/)
  })
})
