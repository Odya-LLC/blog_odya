import { notFoundResponse, renderFeed, RSS_CONTENT_TYPE, seoFileResponse } from '@/site/seo/files'
import { localeFromScript } from '@/site/seo/config'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ script: string; category?: string[] }> }

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * RSS 2.0 (TZ §7). Ommaviy URL'lar `next.config.ts` → `rewrites` orqali shu yerga keladi:
 * `/rss.xml` → `/feeds/latn`, `/kr/rss.xml` → `/feeds/cyrl`,
 * `/{category}/rss.xml` → `/feeds/latn/{category}`, `/kr/{category}/rss.xml` → `/feeds/cyrl/{category}`.
 */
export async function GET(_request: Request, { params }: Context) {
  const { script, category } = await params
  const locale = localeFromScript(script)
  const slug = category?.[0] ?? null
  if (!locale || (category && category.length > 1) || (slug !== null && !SLUG.test(slug))) {
    return notFoundResponse()
  }
  const body = await renderFeed(locale, slug)
  return body ? seoFileResponse(body, RSS_CONTENT_TYPE) : notFoundResponse()
}
