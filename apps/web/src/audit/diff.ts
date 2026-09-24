/**
 * Audit `diff` (TZ §6.4): faqat o'zgargan **yuqori darajadagi** maydonlar —
 * `{ [maydon]: { from, to } }`.
 *
 * - Ichma-ich maydonlar (group, array, richText) butunligicha taqqoslanadi; qiymat JSON'da
 *   `MAX_VALUE_CHARS` dan katta bo'lsa (masalan, Lexical matn) o'rniga qisqa belgi yoziladi:
 *   `{ _omitted: true, chars }` — Supabase Free (500 MB) uchun hajmni cheklash. To'liq tarix
 *   kerak bo'lsa — kolleksiya versiyalari (posts/pages).
 * - Populyatsiya qilingan bog'lanishlar (`afterChange` dagi `doc` so'rov `depth` i bilan keladi,
 *   `previousDoc` esa `depth: 0`) ID'ga qaytariladi — aks holda soxta farq chiqadi.
 * - Maxfiy maydonlar (parol xeshi, API kalit va uning indeksi, tokenlar) hech qachon yozilmaydi,
 *   texnik maydonlar (`updatedAt`, `createdAt`, ...) e'tiborsiz qoldiriladi.
 */
export const MAX_VALUE_CHARS = 1000

/** Hech qachon audit'ga tushmaydigan maydonlar (maxfiy yoki texnik). */
export const IGNORED_DIFF_FIELDS: ReadonlySet<string> = new Set([
  'id',
  'createdAt',
  'updatedAt',
  // auth (maxfiy)
  'password',
  'hash',
  'salt',
  'apiKey',
  'apiKeyIndex',
  'hasAPIKey',
  'resetPasswordToken',
  'resetPasswordExpiration',
  '_verificationToken',
  'loginAttempts',
  'lockUntil',
  'sessions',
  'lastLoginAt',
  // Payload ichki
  '_locked',
  '_lockedByUser',
  'globalType',
])

export interface OmittedValue {
  _omitted: true
  chars: number
}

export type DiffValue = unknown

export interface FieldChange {
  from: DiffValue
  to: DiffValue
}

export type AuditDiff = Record<string, FieldChange>

type Doc = Record<string, unknown> | null | undefined

/** Kalit tartibiga bog'liq bo'lmagan JSON (taqqoslash uchun). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value)) ?? 'null'
}

function normalize(value: unknown): unknown {
  if (value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    if (isPopulatedDoc(value)) return (value as { id: unknown }).id
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = normalize((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/**
 * Populyatsiya qilingan hujjat (`id` + `createdAt`/`updatedAt`). Array/blok qatorlarida ham `id`
 * bor, lekin timestamp'lar yo'q — ular tegilmaydi.
 */
function isPopulatedDoc(value: object): boolean {
  return 'id' in value && ('createdAt' in value || 'updatedAt' in value)
}

/** Katta qiymatlar o'rniga qisqa belgi. */
export function compactValue(value: unknown): DiffValue {
  const normalized = normalize(value)
  const json = JSON.stringify(normalized) ?? 'null'
  if (json.length > MAX_VALUE_CHARS) return { _omitted: true, chars: json.length } as OmittedValue
  return normalized
}

/** Bo'sh qiymat (yaratishda bunday maydonlar diff'ga kirmaydi). */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * `before` → `after` farqi. `before` bo'lmasa (yaratish) — `after` dagi bo'sh bo'lmagan maydonlar.
 */
export function computeDiff(before: Doc, after: Doc): AuditDiff {
  const prev = before ?? {}
  const next = after ?? {}
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  const diff: AuditDiff = {}
  for (const key of keys) {
    if (IGNORED_DIFF_FIELDS.has(key)) continue
    const from = prev[key]
    const to = next[key]
    if (!before && isEmpty(to)) continue
    if (isEmpty(from) && isEmpty(to)) continue
    if (stableStringify(from) === stableStringify(to)) continue
    diff[key] = { from: compactValue(from), to: compactValue(to) }
  }
  return diff
}
