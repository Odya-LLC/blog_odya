'use client'

import { toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Script = 'uz-Latn' | 'uz-Cyrl'
type TestType = 'post' | 'story' | 'digest'

const TEST_TYPES: { value: TestType; label: string }[] = [
  { value: 'post', label: 'Post' },
  { value: 'story', label: 'Story' },
  { value: 'digest', label: 'Dayjest (karusel)' },
]

interface Props {
  apiRoute: string
  postId: number
  scripts: Script[]
  canSend: boolean
}

async function call(url: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const errors = json.errors as { message?: string }[] | undefined
    throw new Error(errors?.[0]?.message ?? `Xatolik (${response.status})`)
  }
  return json
}

/**
 * Make tugmalari (OBLOG-91, faqat admin): "Sinov yuborish" — shu post JSON'i `test: true` bilan
 * (Make'da maydonlarni xaritalash uchun; Instagram oldidagi `test = false` filtri uni o'tkazmaydi);
 * "Make'ga yuborish" — hali yuborilmagan yozuvlar uchun haqiqiy yuborish (navbat). OBLOG-118:
 * sinov turi — post, story yoki dayjest karuseli (Make ssenariysi Router'ini sozlash uchun).
 */
export function MakeActions({ apiRoute, postId, scripts, canSend }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [type, setType] = useState<TestType>('post')
  const url = `${apiRoute}/posts/${postId}/make`

  const test = async (script: Script) => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await call(url, { mode: 'test', script, type })
      const text = `${String(result.message ?? '')} HTTP ${String(result.httpStatus ?? '—')}`
      if (result.ok) toast.success(text)
      else toast.error(text)
      setMessage(text)
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    if (!window.confirm('Post Make orqali ijtimoiy tarmoqlarga chop etiladi. Davom etasizmi?'))
      return
    setBusy(true)
    setMessage(null)
    try {
      const result = await call(url, { mode: 'send' })
      toast.success(`Navbatga qo‘yildi: ${String(result.queued ?? 0)}`)
      router.refresh()
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="editorial__actions" data-testid="make-actions">
      <select
        aria-label="Sinov turi"
        value={type}
        onChange={(event) => setType(event.target.value as TestType)}
        disabled={busy}
      >
        {TEST_TYPES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {(type === 'digest' ? (['uz-Latn'] as Script[]) : scripts).map((script) => (
        <button
          key={script}
          type="button"
          className="editorial__btn editorial__btn--secondary"
          onClick={() => test(script)}
          disabled={busy}
        >
          Sinov yuborish
          {scripts.length > 1 ? ` (${script === 'uz-Cyrl' ? 'kirill' : 'lotin'})` : ''}
        </button>
      ))}
      {canSend ? (
        <button type="button" className="editorial__btn" onClick={send} disabled={busy}>
          Make’ga yuborish
        </button>
      ) : null}
      {message ? <span className="editorial__muted">{message}</span> : null}
    </div>
  )
}
