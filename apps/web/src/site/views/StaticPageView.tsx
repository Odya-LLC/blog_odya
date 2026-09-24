import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'

import { Container } from '@/components/blog/SiteShell'
import { RichText } from '@/components/richtext/RichText'
import type { Page } from '@/payload-types'

import { pagePath } from '../paths'
import { JsonLd } from '../seo/JsonLd'
import { staticPageSeo } from '../seo/pages'
import { SitePage } from './SitePage'

type Block = NonNullable<Page['layout']>[number]

export function staticPageMetadata(locale: Locale, page: Page): Metadata {
  return staticPageSeo(locale, page).metadata
}

function PageBlock({ block, locale }: { block: Block; locale: Locale }) {
  switch (block.blockType) {
    case 'content':
      return <RichText data={block.richText} locale={locale} />
    case 'faq':
      return (
        <section>
          {block.title ? <h2>{block.title}</h2> : null}
          <dl>
            {(block.items ?? []).map((item) => (
              <div key={item.id ?? item.question}>
                <dt className="font-semibold text-fg">{item.question}</dt>
                <dd className="ml-0">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )
    default:
      return null
  }
}

/**
 * Statik sahifa `/{slug}` (TZ §7 "Sahifalar", §10.13): "Biz haqimizda", "Tahririyat siyosati",
 * aloqa va h.k. — sarlavha + bloklar (matn, savol-javob → `FAQPage` JSON-LD).
 */
export function StaticPageView({ locale, page }: { locale: Locale; page: Page }) {
  const { jsonLd } = staticPageSeo(locale, page)
  return (
    <SitePage locale={locale} pathname={pagePath(locale, page.slug)} activeCategorySlug={page.slug}>
      <JsonLd data={jsonLd} />
      <Container className="py-8 lg:py-12">
        <article
          className="prose prose-odya mx-auto w-full max-w-[680px] break-words"
          data-testid="static-page"
        >
          <h1>{page.title}</h1>
          {(page.layout ?? []).map((block, index) => (
            <PageBlock key={block.id ?? index} block={block} locale={locale} />
          ))}
        </article>
      </Container>
    </SitePage>
  )
}
