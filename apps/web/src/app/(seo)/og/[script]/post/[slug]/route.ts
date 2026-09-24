import { getArticle } from '@/site/data'
import { localeFromScript } from '@/site/seo/config'
import { notFoundResponse } from '@/site/seo/files'
import { ogImageResponse } from '@/site/seo/og'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ script: string; slug: string }> }

/**
 * `/og/{latn|cyrl}/post/{slug}?v=…` — muqovasiz maqola uchun avtomatik OG rasm (TZ §8.2):
 * kategoriya chipi + sarlavha + brend, joriy yozuvda. `?v=` — `updatedAt` (kesh-buzar).
 */
export async function GET(_request: Request, { params }: Context) {
  const { script, slug } = await params
  const locale = localeFromScript(script)
  const data = locale ? await getArticle(locale, slug) : null
  if (!locale || !data) return notFoundResponse()
  return ogImageResponse({
    locale,
    title: data.post.title,
    category: { name: data.category.name, slug: data.category.slug, color: data.category.color },
  })
}
