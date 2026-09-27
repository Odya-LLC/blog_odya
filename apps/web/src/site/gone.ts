/**
 * `410 Gone` — WordPress buzilganidan (OBLOG-49) qolgan "axlat" URL'lar (OBLOG-50).
 *
 * Google indeksida ~22 000 spam URL (`/products/{n}/`, `/listing/{n}/`, `/shop/…`, `/clientlog…`)
 * va WordPress izlari (`/wp-admin`, `*.php`, `/feed`, `/?p=`) bor. 404 ham oxir-oqibat
 * indeksdan chiqadi, 410 esa tezroq. `src/proxy.ts` har so'rovda `isGone()` ni tekshiradi —
 * trailing-slash redirect'dan OLDIN (`/products/1/` → birdaniga 410, 308 → 410 emas).
 *
 * Qoidalar faqat bizda HECH QACHON bo'lmaydigan shakllarga tegadi:
 * - ildiz segmentlari `GONE_ROOT_SEGMENTS` — `ROUTE_RESERVED_SLUGS` ga qo'shilgan, shuning uchun
 *   bunday kategoriya/sahifa yaratib bo'lmaydi;
 * - fayl kengaytmalari (`.php`, `.html`, `.asp` …) — bizda bunday fayl yo'q (`public/` — faqat
 *   `.png`/`.svg`; SEO — `.xml`/`.txt`);
 * - `/YYYY/MM/…`, `/page/N` — bizning sxemada yo'q (`/{category}/page/N` bor);
 * - `/tag|author/{x}/feed` va slug formatiga to'g'ri kelmaydigan eski teg/muallif URL'lari;
 * - bosh sahifa (`/`, `/kr`) begona query parametrlari bilan (oq ro'yxatdan tashqari).
 *
 * Ataylab TEGILMAYDI: bitta segmentli ildiz slug'lari (eski WP maqolalari, masalan
 * `/veb-sayt-sinovini-…/` — bizning `/{category}` va `/{page}` bilan to'qnashadi) va
 * `/category/*` — ular 404 yoki `redirects` kolleksiyasi (OBLOG-29) orqali hal qilinadi.
 *
 * Yon ta'sirsiz, bog'liqliksiz modul: proxy (edge/node), `lib/slug.ts` va testlar import qiladi.
 */

/** Ildiz segmentlari: `/{segment}` va `/{segment}/…` — to'liq 410. */
export const GONE_ROOT_SEGMENTS = [
  // WordPress
  'wp-admin',
  'wp-content',
  'wp-includes',
  'wp-json',
  'feed',
  'comments',
  // Spam (GSC eksporti, OBLOG-49)
  'products',
  'listing',
  'shop',
  'clientlog',
] as const

/** Bizda yo'q server-skript / statik sahifa kengaytmalari (har qanday segment oxirida). */
const GONE_EXTENSION =
  /\.(?:php\d?|phtml|html?|shtml|xhtml|asp|aspx|ashx|asmx|axd|jsp|jspx|jsf|do|action|cgi|pl|cfm|cfml)$/i

/** WordPress arxivlari: `/2019/05/…` (bizda sanali URL yo'q). */
const DATE_ARCHIVE = /^\/(?:19|20)\d{2}\/(?:0?[1-9]|1[0-2])(?:\/|$)/

/** Bizning slug formati (`site/route.ts` `SEGMENT`, `lib/slug.ts` `SLUG_PATTERN`). */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Proxy tekshirmaydigan tizim yo'llari (Payload admin/API, Next ichki fayllari). */
const SKIP_PREFIXES = ['/_next/', '/api/', '/admin/', '/.well-known/'] as const
const SKIP_EXACT = ['/api', '/admin'] as const

/** Kirill prefiksi (`@blog-odya/shared/locales` `LOCALE_PATH_PREFIX`) — bog'liqliksiz nusxa. */
const CYRL_PREFIX = '/kr'

/**
 * Bosh sahifada ruxsat etilgan query parametrlari. Qolgan har qanday parametr → 410
 * (`/?p=123`, `/?page_id=`, `/?cat=`, `/?author=`, `/?feed=`, `/?s=` — WP; `/?xxx=` — spam).
 * Bizning qidiruv — `/search?q=`, bosh sahifa o'zi hech qanday parametr o'qimaydi.
 */
const HOME_QUERY_ALLOWED = new Set([
  // Reklama / analitika klik ID'lari
  'gclid',
  'gbraid',
  'wbraid',
  'dclid',
  'fbclid',
  'yclid',
  'ysclid',
  'msclkid',
  'twclid',
  'ttclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref',
  // Next.js RSC so'rovlari (client navigatsiya / prefetch) — BUZILMASIN
  '_rsc',
  // Preview / draft
  'preview',
  'token',
])

/** Prefiks bo'yicha ruxsat: UTM (Telegram — OBLOG-22), Next va Vercel ichki parametrlari. */
const HOME_QUERY_ALLOWED_PREFIXES = ['utm_', '_next', '__next', '_vercel', '__vercel'] as const

/** `/a//b/` → `/a/b`, `/` → `/`. Kichik harf: bizning barcha marshrutlar kichik harfda. */
export function normalizeGonePath(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  return (collapsed || '/').toLowerCase()
}

function isSkipped(path: string): boolean {
  return (
    (SKIP_EXACT as readonly string[]).includes(path) ||
    SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))
  )
}

/** Yo'l (query'siz) 410 bo'lishi kerakmi. `path` — `normalizeGonePath` natijasi. */
export function isGonePath(pathname: string): boolean {
  const path = normalizeGonePath(pathname)
  if (path === '/' || isSkipped(path)) return false

  const segments = path.slice(1).split('/')
  if (segments.some((segment) => GONE_EXTENSION.test(segment))) return true

  const [root = ''] = segments
  if ((GONE_ROOT_SEGMENTS as readonly string[]).includes(root)) return true
  if (DATE_ARCHIVE.test(path)) return true

  // Qolgan qoidalar kirill prefiksida ham (`/kr/page/2`, `/kr/tag/x/feed`).
  const local = root === CYRL_PREFIX.slice(1) ? segments.slice(1) : segments
  const [first, second, ...rest] = local

  // `/page/N` — WP bosh sahifa sahifalashi (bizda `/{category}/page/N`; `page` — band slug).
  if (first === 'page') return true

  // Eski teg/muallif: `/tag/{x}/feed`, `/author/{x}/feed/…`, slug formatiga mos kelmaydigan.
  if (first === 'tag' || first === 'author') {
    if (second === undefined) return false
    if (!SLUG.test(safeDecode(second))) return true
    if (rest[0] === 'feed') return true
  }
  return false
}

/** Bosh sahifa (`/`, `/kr`) oq ro'yxatdan tashqari query parametri bilan. */
export function hasForeignHomeQuery(pathname: string, searchParams: URLSearchParams): boolean {
  const path = normalizeGonePath(pathname)
  if (path !== '/' && path !== CYRL_PREFIX) return false
  for (const key of searchParams.keys()) {
    const name = key.toLowerCase()
    if (HOME_QUERY_ALLOWED.has(name)) continue
    if (HOME_QUERY_ALLOWED_PREFIXES.some((prefix) => name.startsWith(prefix))) continue
    return true
  }
  return false
}

/** URL 410 Gone bilan javob berishi kerakmi (yo'l qoidalari + bosh sahifa query'si). */
export function isGone(input: URL | string): boolean {
  const url = typeof input === 'string' ? new URL(input, 'http://localhost') : input
  return isGonePath(url.pathname) || hasForeignHomeQuery(url.pathname, url.searchParams)
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** Minimal HTML (o'zbekcha, bosh sahifaga havola) — CDN'da keshlanadi, indekslanmaydi. */
export const GONE_BODY = `<!doctype html>
<html lang="uz">
<head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>410 — Sahifa oʻchirilgan</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem">
<h1>Sahifa oʻchirilgan</h1>
<p>Bu manzil endi mavjud emas va qaytmaydi.</p>
<p><a href="/">Blog Odya bosh sahifasi</a></p>
</body>
</html>
`

export const GONE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex',
  'Cache-Control': 'public, max-age=0, s-maxage=86400',
} as const

export function goneResponse(method = 'GET'): Response {
  return new Response(method === 'HEAD' ? null : GONE_BODY, { status: 410, headers: GONE_HEADERS })
}
