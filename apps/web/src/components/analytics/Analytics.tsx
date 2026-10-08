import type { Locale } from '@blog-odya/shared'

import { thirdPartyScript } from '@/site/analytics'
import { getAnalyticsConfig } from '@/site/data'

/**
 * Uchinchi tomon hisoblagichlari (TZ §9.5; OBLOG-23, OBLOG-60, OBLOG-80, OBLOG-111): GA4 + Yandex
 * Metrica (`site-settings` da ID bo'lsa) va TopSayt.uz — har bir tashrifchida, bannersiz.
 *
 * Bitta inline skript (`thirdPartyScript`), React chunk'i yo'q: birinchi yuklash JS byudjeti
 * (≤ 150 KB, TZ §8.4) Next/React freymvorkining o'zi bilan chegarada — ilgarigi lazy client
 * komponentlar (`AnalyticsLoader`/`AnalyticsScripts`) ~2,3 KB qo'shardi. Skriptlar birinchi
 * faollikda yoki 5 s dan keyin yuklanadi (batafsil: `site/analytics.ts`). Sahifalar ISR/statik
 * qoladi (server cookie o'qimaydi).
 */
export async function Analytics({ locale }: { locale: Locale }) {
  const config = await getAnalyticsConfig()
  const script = thirdPartyScript({
    ga4Id: config.ga4Id,
    metricaId: config.metricaId,
    contentGroup: locale === 'uz-Cyrl' ? 'cyrl' : 'latn',
  })
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
