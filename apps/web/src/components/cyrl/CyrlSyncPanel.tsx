'use client'

import { Button, toast, useConfig, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useState } from 'react'

/**
 * Admin sidebar paneli (TZ §3.6): kirill sinxronlash holati va "Kirillni qayta generatsiya
 * qilish" tugmasi. `withCyrlSync` / `withCyrlSyncGlobal` tomonidan `ui` maydoni sifatida
 * qo'shiladi; `fields` — sinxronlanadigan maydonlar (`clientProps`).
 */
export interface CyrlSyncPanelProps {
  fields?: Array<{ path: string; label?: string }>
}

function parseLocked(value: unknown): string[] {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  return Object.entries(parsed as Record<string, unknown>)
    .filter(([, flag]) => flag === true)
    .map(([key]) => key)
}

export function CyrlSyncPanel({ fields = [] }: CyrlSyncPanelProps) {
  const { id, collectionSlug, globalSlug } = useDocumentInfo()
  const { config } = useConfig()
  const stale = useFormFields(([formFields]) => formFields?.cyrlStale?.value === true)
  const lockedValue = useFormFields(([formFields]) => formFields?.cyrlLocked?.value)
  const [busy, setBusy] = useState(false)

  const locked = parseLocked(lockedValue)
  const labelOf = (path: string) => fields.find((f) => f.path === path)?.label ?? path
  const canRun = Boolean(globalSlug || (collectionSlug && id))

  const regenerate = async () => {
    if (!canRun) return
    setBusy(true)
    try {
      const base = `${config.serverURL ?? ''}${config.routes.api}`
      const url = globalSlug
        ? `${base}/globals/${globalSlug}/regenerate-cyrl`
        : `${base}/${collectionSlug}/${id}/regenerate-cyrl`
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? `HTTP ${response.status}`)
      }
      toast.success('Kirill versiyasi lotin matnidan qayta generatsiya qilindi')
      // Forma holati yangi qiymatlar bilan qayta yuklanadi.
      window.location.reload()
    } catch (error) {
      toast.error(`Qayta generatsiya qilib boʻlmadi: ${(error as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <div className="field-type cyrl-sync-panel" style={{ marginBottom: 'var(--base)' }}>
      <div className="field-label">Kirill versiyasi</div>
      {stale ? (
        <p style={{ color: 'var(--theme-warning-500)', margin: '0 0 8px' }}>
          Kirill versiyasi eskirgan boʻlishi mumkin: lotin matni oʻzgargan, qulflangan kirill
          maydonlari yangilanmadi.
        </p>
      ) : null}
      <p style={{ margin: '0 0 8px', color: 'var(--theme-elevation-500)' }}>
        {locked.length > 0
          ? `Qoʻlda tuzatilgan (qulflangan): ${locked.map(labelOf).join(', ')}`
          : 'Kirill maydonlari lotin matnidan avtomatik yaratiladi.'}
      </p>
      <Button
        buttonStyle="secondary"
        size="small"
        disabled={!canRun || busy}
        onClick={regenerate}
        tooltip={canRun ? undefined : 'Avval hujjatni saqlang'}
      >
        {busy ? 'Generatsiya qilinmoqda…' : 'Kirillni qayta generatsiya qilish'}
      </Button>
    </div>
  )
}
