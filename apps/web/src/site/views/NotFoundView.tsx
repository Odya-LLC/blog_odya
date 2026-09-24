import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'

import { NotFound } from '@/components/blog/NotFound'
import { Container } from '@/components/blog/SiteShell'
import { getSiteStrings } from '@/i18n/site'

import { homePath } from '../paths'
import { SitePage } from './SitePage'

export function notFoundMetadata(locale: Locale): Metadata {
  const t = getSiteStrings(locale)
  return { title: `${t.notFoundTitle} — ${t.siteName}`, robots: { index: false } }
}

/** 404 (TZ §12.3) — joriy yozuvda, header/footer bilan. */
export function NotFoundView({ locale }: { locale: Locale }) {
  return (
    <SitePage locale={locale} pathname={homePath(locale)}>
      <Container>
        <NotFound locale={locale} />
      </Container>
    </SitePage>
  )
}
