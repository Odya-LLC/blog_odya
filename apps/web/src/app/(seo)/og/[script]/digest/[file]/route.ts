import { DEFAULT_LOCALE } from '@blog-odya/shared/locales'
import config from '@payload-config'
import { getPayload } from 'payload'

import type { Post } from '@/payload-types'
import { localeFromScript } from '@/site/seo/config'
import { notFoundResponse } from '@/site/seo/files'
import { renderDigestCoverJpeg } from '@/social/image'
import { parseDigestCoverUrl } from '@/social/instagram/digestPayload'
import { resolveSocialTitle } from '@/social/title'
import { digestDateParts } from '@/telegram/digestCaption'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Context = { params: Promise<{ script: string; file: string }> }

/** CDN keshi: URL deterministik (slot + postlar + shablon versiyasi), imzolangan. */
const CACHE_SECONDS = 60 * 60 * 24

/**
 * `/og/{latn|cyrl}/digest/cover.jpg?at={slot}&p={id.id…}&v={shablon}&s={imzo}` — Instagram dayjest
 * karuselining muqova slaydi (OBLOG-118): JPEG 1080×1350, "Kun yangiliklari · 10-oktabr" va
 * birinchi 5 sarlavha. URL'ni dayjest bosqichi yasaydi (`digestCoverUrl`) — imzo (`s`) Payload siri
 * bilan; noto'g'ri imzo, parametrlar yoki chop etilmagan postlar — 404. Ommaviy (`/og/**` — Meta
 * crawler'i oladi), chop etilmagan post sarlavhasi chiqmaydi.
 */
export async function GET(request: Request, { params }: Context) {
  const { script, file } = await params
  const locale = localeFromScript(script)
  if (!locale || file !== 'cover.jpg') return notFoundResponse()

  const payload = await getPayload({ config })
  const parsed = parseDigestCoverUrl(locale, new URL(request.url).searchParams, payload.secret)
  if (!parsed) return notFoundResponse()

  const { docs } = (await payload.find({
    collection: 'posts',
    locale,
    fallbackLocale: DEFAULT_LOCALE,
    draft: false,
    depth: 0,
    overrideAccess: true,
    where: {
      and: [
        { id: { in: parsed.postIds } },
        { _status: { equals: 'published' } },
        { workflowStatus: { equals: 'published' } },
      ],
    },
    select: { title: true, socialTitle: true, meta: { title: true } },
    pagination: false,
    limit: parsed.postIds.length,
  })) as unknown as { docs: Pick<Post, 'id' | 'title' | 'socialTitle' | 'meta'>[] }
  const byId = new Map(docs.map((post) => [post.id, post]))
  const titles = parsed.postIds
    .map((id) => byId.get(id))
    .filter((post): post is NonNullable<typeof post> => Boolean(post))
    .map((post) =>
      resolveSocialTitle({
        socialTitle: post.socialTitle,
        title: post.title,
        metaTitle: post.meta?.title,
      }),
    )
  if (titles.length === 0) return notFoundResponse()

  const body = await renderDigestCoverJpeg({
    locale,
    date: digestDateParts(parsed.slotAt, locale).date,
    titles,
  })
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(body.byteLength),
      'Cache-Control': `public, max-age=3600, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`,
    },
  })
}
