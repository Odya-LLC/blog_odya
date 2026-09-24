import { renderNewsSitemap, seoFileResponse, XML_CONTENT_TYPE } from '@/site/seo/files'

export const dynamic = 'force-dynamic'

/** `/news-sitemap.xml` — Google News: oxirgi 48 soat, lotin va kirill (TZ §8.3). */
export async function GET() {
  return seoFileResponse(await renderNewsSitemap(), XML_CONTENT_TYPE)
}
