import { getSiteStrings } from '@/i18n/site'
import { localeFromScript } from '@/site/seo/config'
import { notFoundResponse } from '@/site/seo/files'
import { ogImageResponse } from '@/site/seo/og'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ script: string }> }

/** `/og/{latn|cyrl}` — sayt OG rasmi (bosh sahifa; `site-settings.defaultOgImage` bo'lmasa). */
export async function GET(_request: Request, { params }: Context) {
  const locale = localeFromScript((await params).script)
  if (!locale) return notFoundResponse()
  return ogImageResponse({ locale, title: getSiteStrings(locale).tagline })
}
