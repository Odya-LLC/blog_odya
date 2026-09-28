import { describe, expect, it } from 'vitest'

import {
  buildAdminCsp,
  buildSiteCsp,
  HSTS,
  originOf,
  securityHeaderRules,
} from '@/config/security-headers'

/** OBLOG-23 (TZ §9.2): CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy. */
const PROD_ENV = {
  NEXT_PUBLIC_SITE_URL: 'https://blog.odya.uz',
  MEDIA_PUBLIC_URL: 'https://media.odya.uz',
  S3_ENDPOINT: 'https://acc123.r2.cloudflarestorage.com',
  SENTRY_DSN: 'https://abc@o123.ingest.us.sentry.io/456',
}

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(';').map((part) => {
      const [name = '', ...values] = part.trim().split(/\s+/)
      return [name, values] as const
    }),
  )
}

function headersFor(path: string, env = PROD_ENV): Record<string, string> {
  // Next.js: bir xil kalit bir nechta qoidaga mos kelsa — oxirgisi ustun.
  const result: Record<string, string> = {}
  for (const rule of securityHeaderRules(env)) {
    const pattern = new RegExp(
      `^${rule.source.replace(/\/:path\*$/, '(?:/.*)?').replace(/:path\((.*)\)$/, '($1)')}$`,
    )
    if (!pattern.test(path)) continue
    for (const { key, value } of rule.headers) result[key] = value
  }
  return result
}

describe('security headers', () => {
  it('sayt: barcha asosiy sarlavhalar', () => {
    const headers = headersFor('/suniy-intellekt/maqola')
    expect(headers['Strict-Transport-Security']).toBe(HSTS)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Permissions-Policy']).toContain('camera=()')
    expect(headers['Permissions-Policy']).not.toContain('fullscreen')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Content-Security-Policy']).toBe(buildSiteCsp(PROD_ENV))
  })

  it('bosh sahifa ham hujjat sarlavhalarini oladi', () => {
    expect(headersFor('/')['Content-Security-Policy']).toBe(buildSiteCsp(PROD_ENV))
    expect(headersFor('/kr')['X-Frame-Options']).toBe('DENY')
  })

  it('statik chunk’lar: faqat qisqa sarlavhalar (JS byudjeti — sarlavhalar ham hisoblanadi)', () => {
    for (const path of ['/_next/static/chunks/abc.js', '/_next/image']) {
      const headers = headersFor(path)
      expect(headers['Strict-Transport-Security']).toBe(HSTS)
      expect(headers['X-Content-Type-Options']).toBe('nosniff')
      expect(headers['Content-Security-Policy']).toBeUndefined()
      expect(headers['Permissions-Policy']).toBeUndefined()
      expect(headers['X-Frame-Options']).toBeUndefined()
    }
    // `_next/data`, API, media fayllar — hujjat qoidasi saqlanadi.
    expect(headersFor('/api/media/file/x.webp')['Content-Security-Policy']).toBeDefined()
  })

  it('admin: o‘z CSP’si va SAMEORIGIN', () => {
    for (const path of ['/admin', '/admin/collections/posts']) {
      const headers = headersFor(path)
      expect(headers['X-Frame-Options']).toBe('SAMEORIGIN')
      expect(headers['Content-Security-Policy']).toBe(buildAdminCsp(PROD_ENV))
      expect(headers['Strict-Transport-Security']).toBe(HSTS)
    }
    expect(headersFor('/administrator')['X-Frame-Options']).toBe('DENY')
  })

  it('sayt CSP: analitika, embed, media va Sentry domenlari', () => {
    const csp = directives(buildSiteCsp(PROD_ENV))
    expect(csp.get('default-src')).toEqual(["'self'"])
    expect(csp.get('frame-ancestors')).toEqual(["'none'"])
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(csp.get('base-uri')).toEqual(["'self'"])
    expect(csp.get('script-src')).toEqual(
      expect.arrayContaining([
        "'self'",
        "'unsafe-inline'",
        'https://*.googletagmanager.com',
        'https://mc.yandex.ru',
        'https://platform.twitter.com',
        'https://telegram.org',
      ]),
    )
    expect(csp.get('script-src')).not.toContain("'unsafe-eval'")
    expect(csp.get('img-src')).toEqual(
      expect.arrayContaining(['https://media.odya.uz', 'https://i.ytimg.com', 'data:']),
    )
    expect(csp.get('connect-src')).toEqual(
      expect.arrayContaining([
        'https://*.google-analytics.com',
        // Real GA4 tag hit'lari (OBLOG-23 review): apex `analytics.google.com`, `www.google.com`,
        // `stats.g.doubleclick.net` (Google signals); Metrica websocket.
        'https://analytics.google.com',
        'https://*.google.com',
        'https://*.g.doubleclick.net',
        'https://mc.yandex.ru',
        'wss://mc.yandex.ru',
        'https://*.sentry.io',
        'https://o123.ingest.us.sentry.io',
      ]),
    )
    expect(csp.get('frame-src')).toEqual(
      expect.arrayContaining(['https://www.youtube-nocookie.com', 'https://t.me']),
    )
    expect(csp.has('upgrade-insecure-requests')).toBe(true)
  })

  it('admin CSP: bucket’ga yuklash, blob, Monaco', () => {
    const csp = directives(buildAdminCsp(PROD_ENV))
    expect(csp.get('frame-ancestors')).toEqual(["'self'"])
    expect(csp.get('connect-src')).toEqual(
      expect.arrayContaining([
        'https://acc123.r2.cloudflarestorage.com',
        'https://*.r2.cloudflarestorage.com',
        'https://media.odya.uz',
      ]),
    )
    expect(csp.get('img-src')).toEqual(expect.arrayContaining(['blob:', 'data:']))
    expect(csp.get('worker-src')).toEqual(expect.arrayContaining(['blob:']))
  })

  it('lokal http: upgrade-insecure-requests yo‘q, dev — eval va HMR websocket', () => {
    const local = { NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }
    expect(directives(buildSiteCsp(local)).has('upgrade-insecure-requests')).toBe(false)
    const dev = directives(buildSiteCsp(local, { dev: true }))
    expect(dev.get('script-src')).toContain("'unsafe-eval'")
    expect(dev.get('connect-src')).toContain('ws:')
  })

  it('Vercel preview: vercel.live ruxsat, productionda yo‘q', () => {
    const preview = directives(buildSiteCsp({ ...PROD_ENV, VERCEL_ENV: 'preview' }))
    expect(preview.get('script-src')).toContain('https://vercel.live')
    const prod = directives(buildSiteCsp({ ...PROD_ENV, VERCEL_ENV: 'production' }))
    expect(prod.get('script-src')).not.toContain('https://vercel.live')
  })

  it('MEDIA_PUBLIC_URL yo‘q — media sayt origin’idan (Payload /api/media/file, absolyut URL)', () => {
    // CI: sahifa `localhost:3100` da, Payload rasm URL'lari `NEXT_PUBLIC_SITE_URL` (3000) bilan.
    for (const build of [buildSiteCsp, buildAdminCsp]) {
      const csp = directives(build({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }))
      expect(csp.get('img-src')).toContain('http://localhost:3000')
      expect(csp.get('media-src')).toContain('http://localhost:3000')
      expect(csp.get('connect-src')).toContain('http://localhost:3000')
    }
    // Production: R2 media domeni ham, kanonik sayt origin'i ham (preview `*.vercel.app` uchun).
    const prod = directives(buildSiteCsp(PROD_ENV))
    expect(prod.get('img-src')).toEqual(
      expect.arrayContaining(['https://media.odya.uz', 'https://blog.odya.uz']),
    )
  })

  it('env qiymatlari yo‘q/noto‘g‘ri — CSP buzilmaydi', () => {
    const csp = buildSiteCsp({ MEDIA_PUBLIC_URL: 'not a url' })
    expect(csp).not.toContain('undefined')
    expect(csp).not.toContain('null')
    expect(csp).not.toMatch(/\s{2}/)
    expect(originOf('https://media.odya.uz/path')).toBe('https://media.odya.uz')
    expect(originOf(undefined)).toBeNull()
  })
})
