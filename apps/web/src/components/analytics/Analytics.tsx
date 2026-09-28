import type { Locale } from '@blog-odya/shared'

import { buttonVariants } from '@/components/ui/button-variants'
import { getSiteStrings } from '@/i18n/site'
import { COOKIE_BANNER_ID, consentInitScript, hasAnalytics } from '@/site/analytics'
import { getAnalyticsConfig } from '@/site/data'

import { AnalyticsLoader } from './AnalyticsLoader'

/**
 * Analitika + cookie banner (TZ §9.5, OBLOG-23). `site-settings` da GA4 ham, Metrica ham
 * berilmagan bo'lsa — hech narsa (banner ham) chizilmaydi.
 *
 * Banner **serverda** (HTML'da) chiziladi, JS kutmaydi: client'da kech (lazy chunk + hydration
 * dan keyin) paydo bo'lgan banner matni sahifaning eng katta matn bloki bo'lib, LCP'ni
 * kechiktirardi (Lighthouse Performance < 90). Endi u birinchi bo'yashda (FCP) chiziladi.
 * Tanlov qilgan tashrifchida banner ko'rinmaydi: undan oldingi inline skript cookie'ni o'qib
 * `<html data-consent>` qo'yadi, CSS (`styles.css`) bannerni yashiradi — miltillash yo'q.
 * Sahifalar ISR/statik qoladi (server cookie o'qimaydi).
 *
 * Tugmalar va GA4/Metrica yuklash — `AnalyticsLoader` (lazy chunk, faqat ID'lar bo'lsa; JS
 * byudjeti ≤ 150 KB, TZ §8.4).
 */
export async function Analytics({ locale }: { locale: Locale }) {
  const config = await getAnalyticsConfig()
  if (!hasAnalytics(config)) return null
  const t = getSiteStrings(locale)
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: consentInitScript }} />
      <section
        id={COOKIE_BANNER_ID}
        role="region"
        aria-label={t.cookieBannerLabel}
        data-testid="cookie-banner"
        className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-2xl flex-col gap-3 rounded-lg border border-border bg-bg p-4 text-sm text-fg shadow-lg sm:flex-row sm:items-center"
      >
        <p className="flex-1 text-muted">{t.cookieBannerText}</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            data-consent-value="denied"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t.cookieDecline}
          </button>
          <button
            type="button"
            data-consent-value="granted"
            className={buttonVariants({ size: 'sm' })}
          >
            {t.cookieAccept}
          </button>
        </div>
      </section>
      <AnalyticsLoader
        ga4Id={config.ga4Id}
        metricaId={config.metricaId}
        contentGroup={locale === 'uz-Cyrl' ? 'cyrl' : 'latn'}
      />
    </>
  )
}
