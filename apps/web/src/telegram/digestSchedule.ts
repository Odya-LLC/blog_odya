/**
 * Telegram dayjest jadvali (OBLOG-116) — sof funksiyalar (unit testlar bilan).
 *
 * Slotlar — Toshkent vaqtida (UTC+05:00, yozgi vaqt yo'q): `startHour` dan `endHour` gacha har
 * `intervalHours` soatda (standart 7, 10, 13, 16, 19, 22). Oxirgi slotdan keyingi birinchi slotgacha
 * (22:00 → 07:00) — tun, xabar yuborilmaydi; 07:00 dayjesti tunda chiqqan postlarni ham oladi.
 *
 * Scheduler tick'i (har 10 daqiqa) `dueDigestSlot` bilan "hozirgi" slotni oladi: oxirgi slot ≤ hozir
 * va kechikish {@link DIGEST_MAX_LATE_MS} dan oshmagan. Kechikkan (masalan, uzilishdan keyin) slot
 * yuborilmaydi — uning postlari keyingi slotga qo'shiladi (oyna oxirgi muvaffaqiyatli slotdan).
 */

import { dueSlot, latestSlot, previousSlot, SLOT_MAX_LATE_MS } from '@/jobs/slots'

/** Toshkent: UTC+05:00, yozgi vaqt yo'q (umumiy jadval — `@/jobs/slots`, OBLOG-118). */
export { TASHKENT_OFFSET_MS } from '@/jobs/slots'

/** Slot shu vaqtdan ko'p kechiksa — yuborilmaydi (keyingi slotga qo'shiladi). */
export const DIGEST_MAX_LATE_MS = SLOT_MAX_LATE_MS

export interface DigestSchedule {
  /** Slotlar orasidagi soat (1–12). */
  intervalHours: number
  /** Birinchi slot (Toshkent soati, 0–23). */
  startHour: number
  /** Oxirgi slot shu soatdan kech emas (0–23, ≥ startHour). */
  endHour: number
}

/** Slot soatlari: `startHour, startHour + interval, …` (≤ `endHour`). */
export function digestSlotHours(schedule: DigestSchedule): number[] {
  const interval = Math.max(1, Math.floor(schedule.intervalHours))
  const start = Math.min(23, Math.max(0, Math.floor(schedule.startHour)))
  const end = Math.min(23, Math.max(start, Math.floor(schedule.endHour)))
  const hours: number[] = []
  for (let hour = start; hour <= end; hour += interval) hours.push(hour)
  return hours
}

/** Slotlar — kun boshidan daqiqalar (`@/jobs/slots`). */
const slotMinutes = (schedule: DigestSchedule) => digestSlotHours(schedule).map((hour) => hour * 60)

/** `now` dan oldingi (yoki teng) eng oxirgi slot (UTC epoch ms). */
export function latestDigestSlot(now: number, schedule: DigestSchedule): number {
  return latestSlot(now, slotMinutes(schedule))
}

/** Berilgan slotdan oldingi slot (07:00 → kechagi 22:00). */
export function previousDigestSlot(slot: number, schedule: DigestSchedule): number {
  return previousSlot(slot, slotMinutes(schedule))
}

/**
 * Hozir yuborilishi kerak bo'lgan slot: oxirgi slot ≤ `now`, kechikish ≤ `maxLateMs`; aks holda
 * `null` (tun yoki kechikkan slot — keyingisini kutish).
 */
export function dueDigestSlot(
  now: number,
  schedule: DigestSchedule,
  maxLateMs = DIGEST_MAX_LATE_MS,
): number | null {
  return dueSlot(now, slotMinutes(schedule), maxLateMs)
}
