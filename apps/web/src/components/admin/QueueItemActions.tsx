'use client'

import { toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { ScrapedItemStatus } from '@/collections/ScrapedItems'

interface Props {
  apiRoute: string
  itemId: number
  status: ScrapedItemStatus
  postTitle: string | null
  postUrl: string | null
  suggestedCategoryId: number | null
  categories: { id: number; name: string }[]
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
 * Navbat elementidagi tugmalar: "Qoralamaga olish" (kategoriya tanlab) va "Rad etish" (sabab bilan).
 * Qoralama yaratilgach — post tahrirlash sahifasiga o'tiladi; rad etilgach — ro'yxat yangilanadi.
 */
export function QueueItemActions({
  apiRoute,
  itemId,
  status,
  postTitle,
  postUrl,
  suggestedCategoryId,
  categories,
}: Props) {
  const router = useRouter()
  const [categoryId, setCategoryId] = useState(
    suggestedCategoryId ? String(suggestedCategoryId) : '',
  )
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'drafted' && postUrl) {
    return (
      <div className="editorial__actions">
        <a className="editorial__btn editorial__btn--secondary" href={postUrl}>
          Postni ochish
        </a>
        {postTitle && <span className="editorial__muted">{postTitle}</span>}
      </div>
    )
  }
  if (status === 'rejected') return <div className="editorial__actions" />

  const take = async () => {
    if (!categoryId) {
      setError('Kategoriyani tanlang.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await post(`${apiRoute}/scraped-items/${itemId}/take`, {
        categoryId: Number(categoryId),
      })
      toast.success(
        result.created ? 'Qoralama yaratildi' : 'Element allaqachon olingan — post ochilmoqda',
      )
      router.push(String(result.editUrl))
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const reject = async () => {
    if (!reason.trim()) {
      setError('Rad etish sababini yozing.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await post(`${apiRoute}/scraped-items/${itemId}/reject`, { reason })
      toast.success('Element rad etildi')
      setRejecting(false)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="editorial__actions">
      <select
        aria-label="Kategoriya"
        value={categoryId}
        onChange={(event) => setCategoryId(event.target.value)}
        disabled={busy}
      >
        <option value="">Kategoriya…</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <div className="editorial__actions-row">
        <button type="button" className="editorial__btn" onClick={take} disabled={busy}>
          Qoralamaga olish
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
        >
          Rad etish
        </button>
      </div>
      {rejecting && (
        <div className="editorial__reject">
          <textarea
            aria-label="Rad etish sababi"
            placeholder="Sabab (masalan: ahamiyatsiz, dublikat, reklama)"
            value={reason}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            className="editorial__btn editorial__btn--danger"
            onClick={reject}
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
