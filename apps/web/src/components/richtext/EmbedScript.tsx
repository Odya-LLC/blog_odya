'use client'

import { useEffect, useRef } from 'react'

type TwitterWindow = Window & {
  twttr?: { widgets?: { load: (element?: HTMLElement) => void } }
}

const X_WIDGETS = 'https://platform.twitter.com/widgets.js'

function loadScriptOnce(src: string): void {
  if (document.querySelector(`script[src="${src}"]`)) return
  const script = document.createElement('script')
  script.src = src
  script.async = true
  script.charset = 'utf-8'
  document.body.appendChild(script)
}

/**
 * X (Twitter) posti: server `blockquote.twitter-tweet` (havola bilan — JS'siz ham o'qiladi)
 * chizadi, bu orol esa `widgets.js` ni faqat embed ko'ringanda yuklaydi (TZ §8.4: uchinchi
 * tomon skriptlari kechiktiriladi).
 */
export function XEmbedLoader({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        const twttr = (window as TwitterWindow).twttr
        if (twttr?.widgets) twttr.widgets.load(element)
        else loadScriptOnce(X_WIDGETS)
      },
      { rootMargin: '400px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} className="flex justify-center">
      {children}
    </div>
  )
}

/**
 * Telegram post: rasmiy widget skripti o'zi turgan joyga iframe qo'yadi, shuning uchun skript
 * konteyner ichiga (ko'ringanda) qo'shiladi. JS'siz — server chizgan havola qoladi.
 */
export function TelegramEmbedLoader({
  post,
  children,
}: {
  post: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        if (element.querySelector('script')) return
        const script = document.createElement('script')
        script.async = true
        script.src = 'https://telegram.org/js/telegram-widget.js?22'
        script.dataset.telegramPost = post
        script.dataset.width = '100%'
        script.dataset.dark = document.documentElement.classList.contains('dark') ? '1' : '0'
        script.addEventListener('load', () => {
          element.querySelector('[data-embed-fallback]')?.remove()
        })
        element.appendChild(script)
      },
      { rootMargin: '400px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [post])
  return <div ref={ref}>{children}</div>
}
