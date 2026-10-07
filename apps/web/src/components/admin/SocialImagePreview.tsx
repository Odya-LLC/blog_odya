'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState } from 'react'

type Script = 'uz-Latn' | 'uz-Cyrl'

const SCRIPT_PATH: Record<Script, 'latn' | 'cyrl'> = { 'uz-Latn': 'latn', 'uz-Cyrl': 'cyrl' }
const SCRIPT_LABEL: Record<Script, string> = { 'uz-Latn': 'Lotin', 'uz-Cyrl': 'Kirill' }
const VARIANTS = [
  { variant: 'square', label: 'Kvadrat 1:1' },
  { variant: 'portrait', label: 'Vertikal 4:5' },
] as const

interface Props {
  postId: number
  scripts: Script[]
}

/**
 * Instagram rasmining oldindan ko'rinishi (OBLOG-94): `/og/{yozuv}/social/{id}/{variant}.jpg?
 * preview=1` — admin sessiyasi bilan, oxirgi saqlangan (qoralama) versiya bo'yicha. Saqlangandan
 * keyin (`lastUpdateTime`) yoki "Yangilash" tugmasida qayta yuklanadi.
 */
export function SocialImagePreview({ postId, scripts }: Props) {
  const { lastUpdateTime } = useDocumentInfo()
  const [script, setScript] = useState<Script>(scripts[0] ?? 'uz-Latn')
  const [nonce, setNonce] = useState(0)
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const key = `${lastUpdateTime ?? 0}-${nonce}`

  return (
    <div className="social-preview" data-testid="social-image-preview">
      <div className="social-preview__toolbar">
        <strong>Rasm (oldindan ko‘rish)</strong>
        {scripts.length > 1
          ? scripts.map((item) => (
              <button
                key={item}
                type="button"
                className={`social-preview__tab${item === script ? ' social-preview__tab--active' : ''}`}
                onClick={() => setScript(item)}
              >
                {SCRIPT_LABEL[item]}
              </button>
            ))
          : null}
        <button
          type="button"
          className="social-preview__tab"
          onClick={() => {
            setFailed({})
            setNonce((value) => value + 1)
          }}
        >
          Yangilash
        </button>
      </div>
      <div className="social-preview__grid">
        {VARIANTS.map(({ variant, label }) => {
          const src = `/og/${SCRIPT_PATH[script]}/social/${postId}/${variant}.jpg?preview=1&t=${key}`
          const id = `${script}-${variant}-${key}`
          return (
            <figure key={variant} className="social-preview__item">
              {failed[id] ? (
                <span className="social-preview__error">
                  Rasm tayyor emas — kategoriya va sarlavhani saqlang.
                </span>
              ) : (
                <a href={src} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin preview, dinamik JPEG */}
                  <img
                    src={src}
                    alt={`${label} — Instagram rasmi`}
                    loading="lazy"
                    onError={() => setFailed((value) => ({ ...value, [id]: true }))}
                  />
                </a>
              )}
              <figcaption>{label}</figcaption>
            </figure>
          )
        })}
      </div>
    </div>
  )
}
