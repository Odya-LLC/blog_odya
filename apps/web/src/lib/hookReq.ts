import type { PayloadRequest } from 'payload'

/**
 * Hook ichidagi Local API o'qishi — **joriy tranzaksiyada** (`req` uzatiladi), lekin
 * `req.locale` / `req.fallbackLocale` saqlanib qoladi (ichki Local API ularni qayta yozadi).
 *
 * Nega `req` shart (OBLOG-110): publish tranzaksiyasi pool'dan bitta ulanishni band qilib turadi;
 * `req` siz chaqiruv **ikkinchi** ulanishni kutadi. Runtime pool `max: 3`
 * (`config/database.ts`) — bir vaqtda 2–3 ta publish (masalan, rejalashtirilgan postlar bitta
 * scheduler tick'ida) bir-birining ulanishini kutib qoladi va 10 s dan keyin
 * `Failed query` / `timeout exceeded when trying to connect` bilan yiqiladi.
 *
 * `req` berilmasa (hook'dan tashqarida) — `run` shunchaki chaqiriladi.
 */
export async function keepReqLocale<T>(
  req: PayloadRequest | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (!req) return run()
  const { fallbackLocale, locale } = req
  try {
    return await run()
  } finally {
    req.locale = locale
    req.fallbackLocale = fallbackLocale
  }
}
