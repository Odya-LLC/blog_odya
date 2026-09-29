import type { Locale } from '@blog-odya/shared'

import { hasAnalytics } from '@/site/analytics'
import { getAnalyticsConfig } from '@/site/data'

import { AnalyticsLoader } from './AnalyticsLoader'

/**
 * Analitika (TZ §9.5; OBLOG-23, OBLOG-60): GA4 + Yandex Metrica har bir tashrifchida, cookie
 * banner va rozilik so'ralmasdan (egasi qarori, OBLOG-60 — maxfiylik siyosatida yozilgan).
 * `site-settings` da GA4 ham, Metrica ham berilmagan bo'lsa — hech narsa chizilmaydi va
 * analitika chunk'i yuklanmaydi. Sahifalar ISR/statik qoladi (server cookie o'qimaydi).
 *
 * Yuklash — `AnalyticsLoader` (lazy chunk, faqat ID'lar bo'lsa; JS byudjeti ≤ 150 KB, TZ §8.4).
 */
export async function Analytics({ locale }: { locale: Locale }) {
  const config = await getAnalyticsConfig()
  if (!hasAnalytics(config)) return null
  return (
    <AnalyticsLoader
      ga4Id={config.ga4Id}
      metricaId={config.metricaId}
      contentGroup={locale === 'uz-Cyrl' ? 'cyrl' : 'latn'}
    />
  )
}
