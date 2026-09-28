'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useSyncExternalStore } from 'react'

import {
  type AnalyticsWindow,
  consentCookie,
  type ConsentValue,
  type ContentGroup,
  GA4_SRC,
  initGa4,
  initMetrica,
  METRICA_SRC,
  readConsent,
} from '@/site/analytics'

import { BANNER_BUTTON } from './banner-classes'

type ConsentAnalyticsProps = {
  ga4Id: string | null
  metricaId: string | null
  contentGroup: ContentGroup
  strings: { label: string; text: string; accept: string; decline: string }
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
/** SSR/hydration: holat noma'lum (`undefined`) — hech narsa chizilmaydi. */
const getServerConsent = () => undefined

/**
 * Cookie banner + analitika (TZ §9.5, §9.6; OBLOG-23).
 *
 * - Rozilik `cookie_consent` cookie'sida; server uni o'qimaydi (sahifalar ISR/statik qoladi) —
 *   holat mount'dan keyin aniqlanadi, banner `fixed` (CLS yo'q).
 * - GA4 va Metrica skriptlari **faqat** `granted` bo'lganda qo'shiladi (`<script async>`,
 *   `lazyOnload` kabi: `load` dan keyin, brauzer bo'sh vaqtida) — rozilikkacha hech qanday
 *   so'rov ketmaydi. `next/script` ishlatilmaydi: uning runtime'i banner chunk'ini JS
 *   byudjetidan (≤ 150 KB, TZ §8.4) oshirardi.
 * - Client navigatsiya: GA4 enhanced measurement (history) o'zi `page_view` yuboradi, Metrica
 *   uchun `hit` qo'lda.
 */
export function ConsentAnalytics({
  ga4Id,
  metricaId,
  contentGroup,
  strings,
}: ConsentAnalyticsProps) {
  // `undefined` — hali aniqlanmagan (SSR/hydration), `null` — tanlov yo'q (banner).
  const consent = useSyncExternalStore<ConsentValue | null | undefined>(
    subscribe,
    getConsent,
    getServerConsent,
  )

  const decide = (value: ConsentValue) => {
    document.cookie = consentCookie(value, window.location.protocol === 'https:')
    listeners.forEach((listener) => listener())
  }

  return (
    <>
      {consent === 'granted' ? (
        <AnalyticsScripts ga4Id={ga4Id} metricaId={metricaId} contentGroup={contentGroup} />
      ) : null}
      {consent === null ? (
        <section
          role="region"
          aria-label={strings.label}
          data-testid="cookie-banner"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-2xl flex-col gap-3 rounded-lg border border-border bg-bg p-4 text-sm text-fg shadow-lg sm:flex-row sm:items-center"
        >
          <p className="flex-1 text-muted">{strings.text}</p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => decide('denied')}
              className={BANNER_BUTTON.decline}
            >
              {strings.decline}
            </button>
            <button
              type="button"
              onClick={() => decide('granted')}
              className={BANNER_BUTTON.accept}
            >
              {strings.accept}
            </button>
          </div>
        </section>
      ) : null}
    </>
  )
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

function AnalyticsScripts({
  ga4Id,
  metricaId,
  contentGroup,
}: Omit<ConsentAnalyticsProps, 'strings'>) {
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
