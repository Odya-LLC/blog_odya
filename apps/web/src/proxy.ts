import { NextResponse, type NextRequest } from 'next/server'

import { goneResponse, isGone } from './site/gone'

/**
 * Next.js Proxy (sobiq middleware, Next 16) — OBLOG-50:
 *
 * 1. WordPress buzilganidan qolgan axlat URL'lar → `410 Gone` (`site/gone.ts`).
 * 2. Trailing slash: `/x/` → `308 /x` (query saqlanadi). Next'ning o'rnatilgan redirect'i
 *    `next.config.ts` `redirects` bosqichida, proxy'dan OLDIN ishlaydi — shunda
 *    `/products/1/` avval 308, keyin 410 bo'lardi. Shuning uchun `skipTrailingSlashRedirect: true`
 *    va xuddi shu redirect shu yerda, 410 tekshiruvidan KEYIN.
 *
 * Matcher: Next statik fayllari, Payload `/api/…` va `/admin/…` dan tashqari hammasi. Proxy bor
 * yo'lda Next so'rov tanasini xotirada buferlaydi (`proxyClientMaxBodySize`, 10 MB) — media
 * yuklash va MCP so'rovlari proxy'dan o'tmasin. Ularning trailing-slash redirect'i —
 * `next.config.ts` `redirects` (`TRAILING_SLASH_REDIRECTS`).
 */
export function proxy(request: NextRequest): Response {
  const url = request.nextUrl
  if (isGone(url)) return goneResponse(request.method)

  const { pathname } = url
  if (pathname.length > 1 && pathname.endsWith('/')) {
    // Oddiy `URL` (NextURL emas — u asl trailing slash'ni qayta qo'shadi); `pathname` setter —
    // host saqlanadi (`//evil.com/` ochiq redirect bo'lmaydi).
    const target = new URL(request.url)
    target.pathname = pathname.replace(/\/+$/, '') || '/'
    return NextResponse.redirect(target, 308)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static/|_next/image|api/|admin/).*)'],
}
