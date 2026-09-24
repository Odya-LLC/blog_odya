import { localeFromScript } from '@/site/seo/config'
import { getOgCategory } from '@/site/seo/data'
import { notFoundResponse } from '@/site/seo/files'
import { ogImageResponse } from '@/site/seo/og'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ script: string; slug: string }> }

/** `/og/{latn|cyrl}/category/{slug}` — kategoriya sahifasi OG rasmi. */
export async function GET(_request: Request, { params }: Context) {
  const { script, slug } = await params
  const locale = localeFromScript(script)
  const category = locale ? await getOgCategory(locale, slug) : null
  if (!locale || !category) return notFoundResponse()
  return ogImageResponse({ locale, title: category.name })
}
