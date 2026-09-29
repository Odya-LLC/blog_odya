import { indexNowKey } from '@/indexnow'
import { notFoundResponse } from '@/site/seo/files'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ key: string }> }

/**
 * IndexNow kalit fayli (OBLOG-57): `/{INDEXNOW_KEY}.txt` → shu route (`next.config.ts` rewrite,
 * `src/site/seo/rewrites.ts`). Tanasi — kalitning o'zi (UTF-8, `text/plain`). Kalit sozlanmagan
 * yoki mos emas — 404 (boshqa `*.txt` so'rovlari kalitni bilib olmaydi).
 */
export async function GET(_request: Request, { params }: Context) {
  const key = indexNowKey()
  if (!key || (await params).key !== key) return notFoundResponse()
  return new Response(key, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  })
}
