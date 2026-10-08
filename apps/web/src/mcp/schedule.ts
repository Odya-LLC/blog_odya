import { McpToolError } from './result'

/**
 * MCP rejalashtirilgan nashr (OBLOG-100): `publishAt` vaqtini o'qish va tekshirish.
 *
 * Qoida (agent uchun aniq, noaniqliksiz):
 * - Format — ISO 8601 sana va vaqt: `2026-10-09T09:00`, `2026-10-09T09:00:00+05:00`,
 *   `2026-10-09T04:00:00Z` (`T` o'rniga bo'sh joy ham mumkin). Faqat sana (`2026-10-09`) — xato.
 * - Vaqt zonasi ko'rsatilmasa — **Toshkent vaqti** (Asia/Tashkent, UTC+05:00; yozgi vaqt yo'q).
 * - Kamida {@link PUBLISH_AT_MIN_LEAD_MS} keyin va ko'pi bilan {@link PUBLISH_AT_MAX_DAYS} kun ichida.
 *
 * Haqiqiy chop etish — scheduler tsiklida: production'da (`JOBS_MODE=endpoint`) pg_cron har
 * {@link SCHEDULER_INTERVAL_MIN} daqiqada `/api/jobs/run` ni chaqiradi, shuning uchun post
 * belgilangan vaqtdan keyin ~{@link SCHEDULER_INTERVAL_MIN} daqiqagacha kechikib chiqishi mumkin.
 */

/** Toshkent: UTC+05:00, yozgi vaqt yo'q. */
export const TASHKENT_OFFSET = '+05:00'
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000

/** Eng yaqin vaqt: hozirdan kamida 1 daqiqa keyin (aks holda — darhol chop eting). */
export const PUBLISH_AT_MIN_LEAD_MS = 60_000

/** Eng uzoq rejalashtirish ufqi (kun). */
export const PUBLISH_AT_MAX_DAYS = 30

/** Production scheduler oralig'i (pg_cron, `infra/supabase/cron.sql`) — kutiladigan kechikish. */
export const SCHEDULER_INTERVAL_MIN = 10

const PUBLISH_AT_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/i

const EXAMPLE = '2026-10-09T09:00 (Toshkent vaqti) yoki 2026-10-09T09:00:00+05:00'

function offsetMs(offset: string | undefined): number {
  if (!offset) return TASHKENT_OFFSET_MS
  if (offset.toUpperCase() === 'Z') return 0
  const sign = offset.startsWith('-') ? -1 : 1
  const digits = offset.slice(1).replace(':', '')
  const hours = Number(digits.slice(0, 2))
  const minutes = Number(digits.slice(2, 4))
  if (hours > 14 || minutes > 59) return Number.NaN
  return sign * (hours * 60 + minutes) * 60_000
}

/**
 * `publishAt` → `Date`. Xato — agent uchun tushunarli `McpToolError` (o'zbekcha).
 * `now` — testlar uchun.
 */
export function parsePublishAt(value: string, now: number = Date.now()): Date {
  const raw = value.trim()
  const match = PUBLISH_AT_RE.exec(raw)
  if (!match) {
    throw new McpToolError(
      `publishAt: "${raw.slice(0, 40)}" — noto'g'ri format. ISO 8601 sana va vaqt kerak, ` +
        `masalan ${EXAMPLE}.`,
    )
  }
  const [, y, mo, d, h, mi, s, offset] = match
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  const hour = Number(h)
  const minute = Number(mi)
  const second = Number(s ?? 0)
  const local = Date.UTC(year, month - 1, day, hour, minute, second)
  const check = new Date(local)
  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new McpToolError(`publishAt: "${raw}" — bunday sana/vaqt yo'q.`)
  }
  const shift = offsetMs(offset)
  if (Number.isNaN(shift)) {
    throw new McpToolError(`publishAt: "${raw}" — vaqt zonasi noto'g'ri (masalan +05:00 yoki Z).`)
  }
  const date = new Date(local - shift)
  if (date.getTime() < now + PUBLISH_AT_MIN_LEAD_MS) {
    throw new McpToolError(
      `publishAt: ${formatTashkent(date)} — o'tgan yoki juda yaqin vaqt. Kamida 1 daqiqa ` +
        `keyingi vaqtni bering (hozir ${formatTashkent(new Date(now))}). Darhol chop etish ` +
        'kerak bo‘lsa — publishAt bermang.',
    )
  }
  if (date.getTime() > now + PUBLISH_AT_MAX_DAYS * 24 * 60 * 60 * 1000) {
    throw new McpToolError(
      `publishAt: ${formatTashkent(date)} — juda uzoq. Ko'pi bilan ${PUBLISH_AT_MAX_DAYS} kun ` +
        'oldinga rejalashtirish mumkin.',
    )
  }
  return date
}

const pad = (value: number) => String(value).padStart(2, '0')

/** `2026-10-09 09:00 (Toshkent, UTC+05:00)` — agent va muharrir uchun o'qiladigan vaqt. */
export function formatTashkent(date: Date): string {
  const local = new Date(date.getTime() + TASHKENT_OFFSET_MS)
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ` +
    `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())} (Toshkent, UTC${TASHKENT_OFFSET})`
  )
}

/** Javoblardagi rejalashtirish ma'lumoti (UTC ISO + Toshkent vaqti). */
export function scheduleView(scheduledAt: string | Date | null | undefined) {
  if (!scheduledAt) return { scheduledAt: null, scheduledAtLocal: null }
  const date = new Date(scheduledAt)
  return { scheduledAt: date.toISOString(), scheduledAtLocal: formatTashkent(date) }
}

export const SCHEDULE_DELAY_NOTE =
  `Post belgilangan vaqtdan keyingi scheduler tsiklida chop etiladi (har ${SCHEDULER_INTERVAL_MIN} ` +
  `daqiqada — ${SCHEDULER_INTERVAL_MIN} daqiqagacha kechikish mumkin); o'shanda Telegram, ` +
  'Make, IndexNow va sayt keshi admin\'dagi "Publish" bilan bir xil ishlaydi.'
