'use client'

import { toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  apiRoute: string
  postId: number
  editUrl: string
}

async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
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
 * Chop etilgan postdagi kutilayotgan o'zgarish (OBLOG-64): "O'zgarishlarni chop etish" va
 * "Rad etish" (sabab bilan — saytdagi versiya tiklanadi). Amaldan so'ng ro'yxat yangilanadi.
 */
export function RevisionActions({ apiRoute, postId, editUrl }: Props) {
  const router = useRouter()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: 'publish' | 'discard') => {
    if (action === 'discard' && !reason.trim()) {
      setError('Rad etish sababini yozing.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (action === 'publish') {
        await post(`${apiRoute}/posts/${postId}/publish-revision`, {})
        toast.success('O‘zgarishlar chop etildi')
      } else {
        await post(`${apiRoute}/posts/${postId}/discard-revision`, { reason })
        toast.success('O‘zgarishlar rad etildi — saytdagi versiya saqlandi')
        setRejecting(false)
      }
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="editorial__actions">
      <a className="editorial__btn editorial__btn--secondary" href={editUrl}>
        Ochish
      </a>
      <div className="editorial__actions-row">
        <button
          type="button"
          className="editorial__btn"
          onClick={() => run('publish')}
          disabled={busy}
          data-testid="revision-publish"
        >
          O‘zgarishlarni chop etish
        </button>
        <button
          type="button"
          className="editorial__btn editorial__btn--danger"
          onClick={() => {
            setRejecting((value) => !value)
            setError(null)
          }}
          disabled={busy}
          aria-expanded={rejecting}
          data-testid="revision-discard"
        >
          Rad etish
        </button>
      </div>
      {rejecting && (
        <div className="editorial__reject">
          <textarea
            aria-label="Rad etish sababi"
            placeholder="Sabab (masalan: faktlar tasdiqlanmagan, sarlavha mos emas)"
            value={reason}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            className="editorial__btn editorial__btn--danger"
            onClick={() => run('discard')}
            disabled={busy}
          >
            Rad etishni tasdiqlash
          </button>
        </div>
      )}
      {error && (
        <span className="editorial__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
