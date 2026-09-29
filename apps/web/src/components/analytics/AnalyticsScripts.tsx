'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

import {
  afterLoadIdle,
  type AnalyticsTargets,
  type AnalyticsWindow,
  loadAnalytics,
} from '@/site/analytics'

/**
 * GA4 + Yandex Metrica (TZ §9.5, §9.6; OBLOG-23, OBLOG-60).
 *
 * - Har bir tashrifchida, rozilik so'ralmasdan (cookie banner yo'q — egasi qarori, OBLOG-60).
 * - Skriptlar `<script async>` bilan, `lazyOnload` kabi: `load` dan keyin, brauzer bo'sh vaqtida.
 *   `next/script` ishlatilmaydi: uning runtime'i analitika chunk'ini JS byudjetidan
 *   (≤ 150 KB, TZ §8.4) oshirardi.
 * - Client navigatsiya: GA4 enhanced measurement (history) o'zi `page_view` yuboradi, Metrica
 *   uchun `hit` qo'lda.
 */
export function AnalyticsScripts({ ga4Id, metricaId, contentGroup }: AnalyticsTargets) {
  const pathname = usePathname()
  const lastPath = useRef(pathname)
  const lastUrl = useRef<string | null>(null)

  // Bir marta: navbat stub'lari + skriptlar. `initGa4`/`initMetrica` global bor bo'lsa hech narsa
  // qilmaydi — qayta render/remount'da ikki marta init/yuklash yo'q.
  useEffect(
    () =>
      afterLoadIdle(() => {
        loadAnalytics(window as AnalyticsWindow, document, { ga4Id, metricaId, contentGroup })
      }),
    [ga4Id, metricaId, contentGroup],
  )

  // GA4: client navigatsiyada `page_view` ni enhanced measurement (history) o'zi yuboradi.
  // Metrica: `init` birinchi sahifani hisoblaydi; keyingi client navigatsiyalar — `hit`.
  useEffect(() => {
    const url = window.location.href
    const referer = lastUrl.current
    lastUrl.current = url
    if (!metricaId || pathname === lastPath.current) return
    lastPath.current = pathname
    ;(window as AnalyticsWindow).ym?.(
      Number(metricaId),
      'hit',
      url,
      referer ? { referer } : undefined,
    )
  }, [metricaId, pathname])

  return null
}
