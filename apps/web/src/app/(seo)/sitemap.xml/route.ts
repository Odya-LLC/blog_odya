import { renderSitemapIndex, seoFileResponse, XML_CONTENT_TYPE } from '@/site/seo/files'

/** Build'da chizilmaydi (DB yo'q) — so'rovda, ma'lumot keshi teglar bilan (`src/site/seo/data.ts`). */
export const dynamic = 'force-dynamic'

/** `/sitemap.xml` — sitemap index (TZ §8.3). */
export async function GET() {
  return seoFileResponse(await renderSitemapIndex(), XML_CONTENT_TYPE)
}
