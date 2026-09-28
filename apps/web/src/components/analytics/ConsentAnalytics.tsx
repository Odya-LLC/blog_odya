'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useSyncExternalStore } from 'react'

import {
  type AnalyticsWindow,
  CONSENT_ATTRIBUTE,
  consentCookie,
  type ConsentValue,
  type ContentGroup,
  COOKIE_BANNER_ID,
  GA4_SRC,
  initGa4,
  initMetrica,
  METRICA_SRC,
  readConsent,
} from '@/site/analytics'

type ConsentAnalyticsProps = {
  ga4Id: string | null
  metricaId: string | null
  contentGroup: ContentGroup
}

// Rozilik holati — cookie; o'zgarishi haqida faqat shu komponent xabar beradi.
const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const getConsent = () => readConsent(document.cookie)
/** SSR/hydration: holat noma'lum (`undefined`) — hech narsa yuklanmaydi. */
const getServerConsent = () => undefined

/**
 * Cookie banner tugmalari + analitika (TZ §9.5, §9.6; OBLOG-23).
 *
 * - Banner'ning o'zi serverda chiziladi (`Analytics.tsx`, LCP uchun); bu komponent uning
 *   tugmalarini (`data-consent-value`) ulaydi: tanlov → `cookie_consent` cookie'si va
 *   `<html data-consent>` (CSS bannerni yashiradi).
 * - GA4 va Metrica skriptlari **faqat** `granted` bo'lganda qo'shiladi (`<script async>`,
 *   `lazyOnload` kabi: `load` dan keyin, brauzer bo'sh vaqtida) — rozilikkacha hech qanday
 *   so'rov ketmaydi. `next/script` ishlatilmaydi: uning runtime'i banner chunk'ini JS
 *   byudjetidan (≤ 150 KB, TZ §8.4) oshirardi.
 * - Client navigatsiya: GA4 enhanced measurement (history) o'zi `page_view` yuboradi, Metrica
 *   uchun `hit` qo'lda.
 */
export function ConsentAnalytics({ ga4Id, metricaId, contentGroup }: ConsentAnalyticsProps) {
  const consent = useSyncExternalStore<ConsentValue | null | undefined>(
    subscribe,
    getConsent,
    getServerConsent,
  )

  useEffect(() => {
    const banner = document.getElementById(COOKIE_BANNER_ID)
    if (!banner) return
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const value = target?.closest<HTMLElement>('[data-consent-value]')?.dataset.consentValue
      if (value !== 'granted' && value !== 'denied') return
      document.cookie = consentCookie(value, window.location.protocol === 'https:')
      document.documentElement.setAttribute(CONSENT_ATTRIBUTE, value)
      listeners.forEach((listener) => listener())
    }
    banner.addEventListener('click', onClick)
    return () => banner.removeEventListener('click', onClick)
  }, [])

  return consent === 'granted' ? (
    <AnalyticsScripts ga4Id={ga4Id} metricaId={metricaId} contentGroup={contentGroup} />
  ) : null
}

/** `<script async src>` (CSP `script-src` dagi domenlar; inline skript yo'q). */
function injectScript(src: string) {
  const script = document.createElement('script')
  script.async = true
  script.src = src
  document.head.appendChild(script)
}

/**
 * `lazyOnload` ekvivalenti: `load` hodisasidan keyin, brauzer bo'sh vaqtida
 * (`requestIdleCallback`, bo'lmasa `setTimeout`). Qaytaradi — bekor qilish funksiyasi.
 */
function afterLoadIdle(run: () => void): () => void {
  let cancelIdle = () => {}
  const schedule = () => {
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(run)
      cancelIdle = () => window.cancelIdleCallback(handle)
    } else {
      const handle = window.setTimeout(run, 1)
      cancelIdle = () => window.clearTimeout(handle)
    }
  }
  if (document.readyState === 'complete') {
    schedule()
    return () => cancelIdle()
  }
  window.addEventListener('load', schedule, { once: true })
  return () => {
    window.removeEventListener('load', schedule)
    cancelIdle()
  }
}

function AnalyticsScripts({ ga4Id, metricaId, contentGroup }: ConsentAnalyticsProps) {
  const pathname = usePathname()
  const lastPath = useRef(pathname)
  const lastUrl = useRef<string | null>(null)

  // Rozilikdan keyin bir marta: navbat stub'lari + skriptlar. `initGa4`/`initMetrica` global
  // bor bo'lsa `false` qaytaradi — qayta render/remount'da ikki marta init/yuklash yo'q.
  useEffect(
    () =>
      afterLoadIdle(() => {
        const win = window as AnalyticsWindow
        if (ga4Id && initGa4(win, ga4Id, contentGroup)) injectScript(GA4_SRC(ga4Id))
        if (metricaId && initMetrica(win, metricaId, contentGroup)) injectScript(METRICA_SRC)
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
