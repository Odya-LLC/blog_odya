import type { Locale } from '@blog-odya/shared'

import { getSiteStrings } from '@/i18n/site'
import { hasAnalytics } from '@/site/analytics'
import { getAnalyticsConfig } from '@/site/data'

import { ConsentAnalytics } from './ConsentAnalytics'

/**
 * Analitika + cookie banner (TZ §9.5, OBLOG-23). `site-settings` da GA4 ham, Metrica ham
 * berilmagan bo'lsa — hech narsa (banner ham) chizilmaydi.
 */
export async function Analytics({ locale }: { locale: Locale }) {
  const config = await getAnalyticsConfig()
  if (!hasAnalytics(config)) return null
  const t = getSiteStrings(locale)
  return (
    <ConsentAnalytics
      ga4Id={config.ga4Id}
      metricaId={config.metricaId}
      contentGroup={locale === 'uz-Cyrl' ? 'cyrl' : 'latn'}
      strings={{
        label: t.cookieBannerLabel,
        text: t.cookieBannerText,
        accept: t.cookieAccept,
        decline: t.cookieDecline,
      }}
    />
  )
}
