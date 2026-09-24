/**
 * Payload Jobs (TZ §3.5, §10.14) — slug'lar, navbatlar va vaqt byudjetlari.
 *
 * Vaqt modeli (TZ §3.7.2, Vercel function limiti 60 s):
 * - `/api/jobs/run` yangi batch'ni faqat ichki deadline (`jobsDeadlineSec`, default 40 s, max 45 s)
 *   gacha boshlaydi;
 * - boshlangan task'lar deadline + `TASK_GRACE_MS` (10 s) ichida tugashi shart — `feed.poll`
 *   HTTP timeout'larini shu chegaraga moslaydi;
 * - bitta task ≤ `TASK_BUDGET_MS` (25 s) — "1 feed yoki 1 maqola" (TZ §3.7.2: har task ≤ 30 s).
 * Natija: bitta chaqiruv ≤ 45 + 10 + DB yozuvlari < 60 s.
 */

export const FEED_POLL_TASK = 'feed.poll'
export const SCRAPE_ITEM_WORKFLOW = 'scrapeItem'

/** `feed.poll` navbati — endpoint shu navbatni ishlatadi. */
export const DEFAULT_QUEUE = 'default'

/**
 * `scrapeItem` workflow navbati. `item.fetch` / `item.extract` M2-02 (OBLOG-16) da yoziladi;
 * shu vaqtgacha bu navbat **ishga tushirilmaydi** (`RUN_QUEUES` da yo'q) — job'lar o'z input'i
 * (RSS matni) bilan navbatda kutadi va M2-02 yoqilganda qayta ishlanadi (hech narsa yo'qolmaydi).
 */
export const SCRAPE_QUEUE = 'scrape'

/** `/api/jobs/run` (va `autorun`) ishga tushiradigan navbatlar, tartib bo'yicha. */
export const RUN_QUEUES: readonly string[] = [DEFAULT_QUEUE]

export const DEFAULT_DEADLINE_SEC = 40
export const MAX_DEADLINE_SEC = 45
export const TASK_GRACE_MS = 10_000
export const TASK_BUDGET_MS = 25_000

/** Bitta feed so'rovi uchun maksimal timeout. */
export const FEED_FETCH_TIMEOUT_MS = 10_000
/** Qolgan vaqt bundan kam bo'lsa yangi feed so'rovi boshlanmaydi. */
export const MIN_FETCH_WINDOW_MS = 3_000

/** Scheduler har 10 daqiqada — interval chegarasidagi feed'lar bir tick'ga kechikmasligi uchun. */
export const DUE_SLACK_MS = 60_000

/** `processing` holatida shuncha vaqtdan ortiq qolgan job — uzilgan (function timeout) deb qaytariladi. */
export const STALE_JOB_MS = 5 * 60_000

export const DEFAULT_BATCH_LIMIT = 10
export const MAX_BATCH_LIMIT = 50
