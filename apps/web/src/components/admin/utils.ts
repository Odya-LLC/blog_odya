import { SITE_TIME_ZONE } from '@/lib/format'

/** Admin'da sana: `24.09.2026 14:05` (Toshkent vaqti; `admin.dateFormat` bilan bir xil ko'rinish). */
export function formatAdminDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SITE_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`
}

/** RSS/Markdown matndan qisqa oddiy matn (HTML teglarsiz). */
export function snippet(text: string | null | undefined, max = 240): string {
  if (!text) return ''
  const plain = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain
}

/** Relationship qiymatidan id (populyatsiya qilingan obyekt yoki id). */
export function relId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return ((value as { id?: number }).id ?? null) as number | null
  return typeof value === 'number' ? value : Number(value) || null
}

export function relName(value: unknown, key: 'name' | 'title' = 'name'): string | null {
  if (value && typeof value === 'object') {
    const name = (value as Record<string, unknown>)[key]
    return typeof name === 'string' && name.trim() ? name : null
  }
  return null
}
