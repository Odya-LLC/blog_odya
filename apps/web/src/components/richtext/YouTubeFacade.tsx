'use client'

import { useState } from 'react'

type YouTubeFacadeProps = {
  id: string
  start?: number
  title: string
  /** "Videoni ko'rish" — tugma yorlig'i (joriy yozuvda). */
  playLabel: string
}

/**
 * YouTube "facade" (TZ §8.4: uchinchi tomon skriptlari kechiktiriladi): sahifa yuklanganda faqat
 * muqova rasmi (i.ytimg.com) va tugma — ~1 MB YouTube pleyer JS'i foydalanuvchi bosgandagina
 * yuklanadi (Lighthouse "third-party facades"). JS'siz — oddiy havola (youtube.com).
 */
export function YouTubeFacade({ id, start, title, playLabel }: YouTubeFacadeProps) {
  const [active, setActive] = useState(false)
  const params = new URLSearchParams({ rel: '0', autoplay: '1' })
  if (start) params.set('start', String(start))
  const watchUrl = `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`

  if (active) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?${params}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="absolute inset-0 size-full border-0"
      />
    )
  }

  return (
    <a
      href={watchUrl}
      target="_blank"
      rel="noopener"
      onClick={(event) => {
        event.preventDefault()
        setActive(true)
      }}
      className="group absolute inset-0 flex items-center justify-center"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tashqi muqova, loader'siz */}
      <img
        src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
        alt=""
        width={480}
        height={360}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
      <span className="relative flex h-12 w-17 items-center justify-center rounded-xl bg-[#ff0033] text-white shadow-lg transition-transform group-hover:scale-110 group-focus-visible:scale-110">
        <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
        <span className="sr-only">
          {playLabel}: {title}
        </span>
      </span>
    </a>
  )
}
