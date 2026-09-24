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
export const ITEM_FETCH_TASK = 'item.fetch'
export const ITEM_EXTRACT_TASK = 'item.extract'
export const ITEM_DEDUPE_TASK = 'item.dedupe'
export const ITEM_CLASSIFY_TASK = 'item.classify'
export const MAINTENANCE_CLEANUP_TASK = 'maintenance.cleanup'
export const SCRAPE_ITEM_WORKFLOW = 'scrapeItem'

/** `feed.poll` va `maintenance.cleanup` navbati — endpoint shu navbatni ishlatadi. */
export const DEFAULT_QUEUE = 'default'

/**
 * `scrapeItem` workflow navbati (`item.fetch` → `item.extract`, M2-02). Arxiv bucket'i
 * (`S3_RAW_BUCKET`) sozlanmagan bo'lsa bu navbat **ishga tushirilmaydi** (`activeRunQueues`) —
 * job'lar o'z input'i (RSS matni) bilan kutib turadi, hech narsa yo'qolmaydi.
 */
export const SCRAPE_QUEUE = 'scrape'

/** `/api/jobs/run` (va `autorun`) ishga tushiradigan navbatlar, tartib bo'yicha. */
export const RUN_QUEUES: readonly string[] = [DEFAULT_QUEUE, SCRAPE_QUEUE]

/** `item.fetch` / `item.extract`: 3 retry, eksponensial backoff (30 s, 60 s, 120 s). */
export const SCRAPE_TASK_RETRIES = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 30_000 },
}

/** `item.extract` (R2 o'qish/yozish + parse) uchun `item.fetch` qoldiradigan vaqt. */
export const EXTRACT_RESERVE_MS = 5_000
/** Sahifa so'rovi uchun kamida shuncha vaqt qolmasa — slot band qilinmaydi (job keyinga qoladi). */
export const MIN_PAGE_FETCH_WINDOW_MS = 5_000

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

// --- M2-03: dedupe, klassifikatsiya, tozalash, ogohlantirishlar ---

/**
 * `item.dedupe`: SimHash Hamming masofasi shu qiymatgacha — bitta klaster (TZ §3.5 #4).
 * Nomzodlar faqat oxirgi `DEDUPE_WINDOW_HOURS` ichida yig'ilgan elementlar orasidan
 * (`scraped_items_created_at_idx`) — butun jadval bilan solishtirilmaydi: kuniga ~150 element,
 * 72 soatda ≈ 450 ta 16 belgili hash — bitta so'rov va JS'da XOR/popcount (< 5 ms).
 * 72 soat = `maxItemAgeHours` default'i: feed'dan bundan eski yangiliklar olinmaydi.
 */
export const DEDUPE_MAX_DISTANCE = 3
export const DEDUPE_WINDOW_HOURS = 72

/** `maintenance.cleanup` (kuniga 1 marta, TZ §3.5 #7, §3.7.2). */
export const REJECTED_RETENTION_DAYS = 30
export const VERSION_TRIM_AFTER_DAYS = 30
export const VERSIONS_TO_KEEP = 3
/** Bir chaqiruvda o'chiriladigan rad etilgan elementlar chegarasi (qolgani ertaga). */
export const CLEANUP_DELETE_LIMIT = 500
/** R2 hajmini hisoblash (ListObjectsV2) uchun vaqt: task byudjeti (25 s) ichida. */
export const R2_LIST_BUDGET_MS = 12_000

/** Ogohlantirish chegaralari (TZ §3.5 "Ishonchlilik", §3.7.2). */
export const ALERT_THRESHOLDS = {
  /** Manba feed'i ketma-ket shuncha marta xato — ogohlantirish. */
  consecutiveFailures: 3,
  /** 24 soatlik yig'ish muvaffaqiyati shundan past — ogohlantirish. */
  minSuccessRate: 0.8,
  /** Muvaffaqiyat foizi faqat kamida shuncha yakunlangan element bo'lsa hisoblanadi. */
  minSampleSize: 5,
  /** Supabase Free: 500 MB, ogohlantirish — 70% (350 MB). */
  dbLimitBytes: 500 * 1024 * 1024,
  dbWarnRatio: 0.7,
  /** R2 bepul kvota 10 GB, ogohlantirish — 8 GB. */
  r2WarnBytes: 8 * 1024 * 1024 * 1024,
} as const

/** Bir xil ogohlantirish shu vaqt ichida qayta yuborilmaydi (holat saqlanib qolsa — eslatma). */
export const ALERT_THROTTLE_MS = 24 * 60 * 60_000
