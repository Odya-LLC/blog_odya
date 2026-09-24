import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'

import { RichText } from '@/components/richtext/RichText'
import { Container } from '@/components/blog/SiteShell'
import { getSiteStrings } from '@/i18n/site'
import type { Page } from '@/payload-types'

import { pagePath } from '../paths'
import { JsonLd } from '../seo/JsonLd'
import { staticPageSeo } from '../seo/pages'
import { SitePage } from './SitePage'

export function staticPageMetadata(locale: Locale, page: Page): Metadata {
  return staticPageSeo(locale, page).metadata
}

/**
 * Statik sahifa (`pages`, TZ §10.13): `/{slug}` va `/kr/{slug}` — "Biz haqimizda", "Tahririyat
 * siyosati", aloqa… Bloklar: matn (Lexical) va savol-javob (`FAQPage` JSON-LD). Kirill bloklari
 * bo'sh bo'lsa — lotin (Payload `fallback`).
 */
export function StaticPageView({ locale, page }: { locale: Locale; page: Page }) {
  const t = getSiteStrings(locale)
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
          {(page.layout ?? []).map((block, index) => {
            const key = block.id ?? `${block.blockType}-${index}`
            if (block.blockType === 'content') {
              return <RichText key={key} data={block.richText} locale={locale} />
            }
            const items = block.items ?? []
            if (items.length === 0) return null
            return (
              <section key={key}>
                <h2>{block.title || t.faq}</h2>
                {items.map((item) => (
                  <details key={item.id ?? item.question}>
                    <summary className="cursor-pointer font-semibold">{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </section>
            )
          })}
        </article>
      </Container>
    </SitePage>
  )
}
