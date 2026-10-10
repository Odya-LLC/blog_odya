/**
 * Kunlik slotlar jadvali — Toshkent vaqtida (UTC+05:00, yozgi vaqt yo'q), daqiqa aniqligida —
 * sof funksiyalar (unit testlar bilan). Telegram dayjesti (OBLOG-116, `telegram/digestSchedule.ts`)
 * va Instagram dayjesti (OBLOG-118, `social/instagram/digest.ts`) shu yerdan foydalanadi.
 *
 * Slot — kun boshidan daqiqalar (`07:30` → 450). Scheduler tick'i (har 10 daqiqa) `dueSlot` bilan
 * "hozirgi" slotni oladi: oxirgi slot ≤ hozir va kechikish {@link SLOT_MAX_LATE_MS} dan oshmagan.
 * Kechikkan slot yuborilmaydi — uning postlari keyingi slotga qo'shiladi (oyna oxirgi muvaffaqiyatli
 * slotdan). Oxirgi slotdan ertangi birinchisigacha — tun.
 */

/** Toshkent: UTC+05:00, yozgi vaqt yo'q. */
export const TASHKENT_OFFSET_MS = 5 * 60 * 60_000

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const DAY_MINUTES = 24 * 60

/** Slot shu vaqtdan ko'p kechiksa — yuborilmaydi (keyingi slotga qo'shiladi). */
export const SLOT_MAX_LATE_MS = 60 * 60_000

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/

/**
 * `"07:30, 12:30, 18:30"` (vergul, nuqtali vergul yoki bo'shliq bilan) → `[450, 750, 1110]`
 * (o'sish tartibida, takrorsiz). Bo'sh yoki noto'g'ri qiymat — `null`.
 */
export function parseSlotTimes(value: unknown): number[] | null {
  if (typeof value !== 'string') return null
  const parts = value
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const minutes = new Set<number>()
  for (const part of parts) {
    const match = TIME.exec(part)
    if (!match) return null
    minutes.add(Number(match[1]) * 60 + Number(match[2]))
  }
  return [...minutes].sort((a, b) => a - b)
}

/** `450` → `"07:30"`. */
export function formatSlotTime(minutes: number): string {
  const value = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function normalize(minutes: readonly number[]): number[] {
  const list = [
    ...new Set(
      minutes
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.min(DAY_MINUTES - 1, Math.max(0, Math.floor(value)))),
    ),
  ].sort((a, b) => a - b)
  return list.length ? list : [0]
}

/** `now` dan oldingi (yoki teng) eng oxirgi slot (UTC epoch ms). */
export function latestSlot(now: number, minutes: readonly number[]): number {
  const slots = normalize(minutes)
  const local = now + TASHKENT_OFFSET_MS
  const today = Math.floor(local / DAY_MS) * DAY_MS
  for (const day of [today, today - DAY_MS]) {
    for (let i = slots.length - 1; i >= 0; i--) {
      const slot = day + slots[i]! * MINUTE_MS
      if (slot <= local) return slot - TASHKENT_OFFSET_MS
    }
  }
  // Bo'sh ro'yxat bo'lmaydi (`normalize` kamida bitta qaytaradi) — bu yerga yetib kelinmaydi.
  return today - DAY_MS - TASHKENT_OFFSET_MS
}

/** Berilgan slotdan oldingi slot (07:30 → kechagi 18:30). */
export function previousSlot(slot: number, minutes: readonly number[]): number {
  return latestSlot(slot - 1, minutes)
}

/**
 * Hozir yuborilishi kerak bo'lgan slot: oxirgi slot ≤ `now`, kechikish ≤ `maxLateMs`; aks holda
 * `null` (tun yoki kechikkan slot — keyingisini kutish).
 */
export function dueSlot(
  now: number,
  minutes: readonly number[],
  maxLateMs = SLOT_MAX_LATE_MS,
): number | null {
  const slot = latestSlot(now, minutes)
  return now - slot <= maxLateMs ? slot : null
}
