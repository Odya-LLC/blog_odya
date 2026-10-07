import config from '@payload-config'
import { getPayload } from 'payload'

import { isAdminOrEditorUser } from '@/access'
import { captureError } from '@/lib/sentry'
import { localeFromScript, siteOrigin } from '@/site/seo/config'
import { notFoundResponse } from '@/site/seo/files'
import { renderSocialImage } from '@/social/image'
import { loadMakeConfig } from '@/social/make/config'
import { parseSocialImageFile } from '@/social/make/payload'
import { loadSocialPost } from '@/social/post'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Context = { params: Promise<{ script: string; id: string; file: string }> }

/** CDN keshi: URL `?v=` bilan versiyalanadi (qisqa sarlavha, muqova, kategoriya, shablon). */
const CACHE_SECONDS = 60 * 60 * 24

/**
 * `/og/{latn|cyrl}/social/{postId}/{square|portrait|landscape}.jpg?v=…` — ijtimoiy tarmoqlar
 * uchun JPEG (OBLOG-91, shablon — OBLOG-94): 1080×1080, 1080×1350, 1200×630. Instagram API
 * WebP'ni qabul qilmaydi — Make shu URL'ni `instagram.imageUrl` sifatida oladi. Rasm ustida —
 * qisqa sarlavha, kategoriya va brend (`social-settings.imageOverlay` / `imageScheme`).
 *
 * Faqat chop etilgan post (aks holda 404). `?preview=1` — admin/muharrir (Payload sessiyasi)
 * uchun oxirgi qoralama versiya, chop etilmagan post ham (post panelidagi oldindan ko'rish);
 * javob keshlanmaydi.
 */
export async function GET(request: Request, { params }: Context) {
  const { script, id, file } = await params
  const locale = localeFromScript(script)
  const variant = parseSocialImageFile(file)
  if (!locale || !variant || !/^\d{1,12}$/.test(id)) return notFoundResponse()

  const payload = await getPayload({ config })
  let preview = false
  if (new URL(request.url).searchParams.get('preview') === '1') {
    const { user } = await payload.auth({ headers: request.headers }).catch(() => ({ user: null }))
    if (!isAdminOrEditorUser(user)) return notFoundResponse()
    preview = true
  }

  const [data, makeConfig] = await Promise.all([
    loadSocialPost(payload, Number(id), locale, siteOrigin(), { preview }),
    loadMakeConfig(payload),
  ])
  if (!data) return notFoundResponse()

  const { body, source } = await renderSocialImage(
    {
      variant,
      locale,
      title: data.socialTitle,
      category: {
        name: data.category.name,
        slug: data.category.slug,
        color: data.category.color,
      },
      cover: data.cover,
      overlay: makeConfig.imageOverlay,
      scheme: makeConfig.imageScheme,
    },
    undefined,
    (error) => {
      payload.logger.warn({
        err: error,
        postId: data.post.id,
        msg: 'Ijtimoiy rasm: muqovani o‘qib bo‘lmadi — brend kartochkasi',
      })
      captureError(error, { tags: { source: 'social-image' } })
    },
  )
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(body.byteLength),
      'Cache-Control': preview
        ? 'private, no-store'
        : `public, max-age=3600, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`,
      'X-Odya-Image-Source': source,
    },
  })
}
