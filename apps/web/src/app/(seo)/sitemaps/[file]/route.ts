import {
  notFoundResponse,
  renderSitemapFile,
  seoFileResponse,
  XML_CONTENT_TYPE,
} from '@/site/seo/files'
import { parseSitemapFile } from '@/site/seo/sitemap'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ file: string }> }

/** `/sitemaps/{pages|categories|posts-YYYY-MM}.xml` — `xhtml:link` hreflang alternates bilan. */
export async function GET(_request: Request, { params }: Context) {
  const file = parseSitemapFile((await params).file)
  if (!file || file.kind === 'index' || file.kind === 'news') return notFoundResponse()
  const body = await renderSitemapFile(file)
  return body ? seoFileResponse(body, XML_CONTENT_TYPE) : notFoundResponse()
}
