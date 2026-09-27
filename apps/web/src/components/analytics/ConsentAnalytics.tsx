'use client'

import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { useEffect, useRef, useSyncExternalStore } from 'react'

import { buttonVariants } from '@/components/ui/button-variants'
import {
  consentCookie,
  type ConsentValue,
  type ContentGroup,
  GA4_SRC,
  ga4InitScript,
  METRICA_SRC,
  metricaInitScript,
  readConsent,
} from '@/site/analytics'

type ConsentAnalyticsProps = {
  ga4Id: string | null
  metricaId: string | null
  contentGroup: ContentGroup
  strings: { label: string; text: string; accept: string; decline: string }
}

type YmWindow = Window & { ym?: (id: number, method: string, ...args: unknown[]) => void }

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
 * - GA4 va Metrica skriptlari **faqat** `granted` bo'lganda chiziladi, `lazyOnload` bilan
 *   (brauzer bo'sh vaqtida, `load` dan keyin) — rozilikkacha hech qanday so'rov ketmaydi.
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
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {strings.decline}
            </button>
            <button
              type="button"
              onClick={() => decide('granted')}
              className={buttonVariants({ size: 'sm' })}
            >
              {strings.accept}
            </button>
          </div>
        </section>
      ) : null}
    </>
  )
}

function AnalyticsScripts({
  ga4Id,
  metricaId,
  contentGroup,
}: Omit<ConsentAnalyticsProps, 'strings'>) {
  const pathname = usePathname()
  const lastPath = useRef(pathname)
  const lastUrl = useRef<string | null>(null)

  // Metrica `init` birinchi sahifani o'zi hisoblaydi; keyingi client navigatsiyalar — `hit`.
  useEffect(() => {
    const url = window.location.href
    const referer = lastUrl.current
    lastUrl.current = url
    if (!metricaId || pathname === lastPath.current) return
    lastPath.current = pathname
    ;(window as YmWindow).ym?.(Number(metricaId), 'hit', url, referer ? { referer } : undefined)
  }, [metricaId, pathname])

  return (
    <>
      {ga4Id ? (
        <>
          <Script id="ga4-src" src={GA4_SRC(ga4Id)} strategy="lazyOnload" />
          <Script id="ga4-init" strategy="lazyOnload">
            {ga4InitScript(ga4Id, contentGroup)}
          </Script>
        </>
      ) : null}
      {metricaId ? (
        <>
          <Script id="metrica-init" strategy="lazyOnload">
            {metricaInitScript(metricaId, contentGroup)}
          </Script>
          <Script id="metrica-src" src={METRICA_SRC} strategy="lazyOnload" />
        </>
      ) : null}
    </>
  )
}
