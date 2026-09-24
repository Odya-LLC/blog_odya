/**
 * Payload Jobs (TZ §3.5, §10.14) — slug'lar, navbatlar va vaqt byudjetlari.
 *
 * Vaqt modeli (TZ §3.7.2, Vercel function limiti `maxDuration` = 60 s). Hamma chegaralar
 * **so'rov boshidan** (`handleJobsRunRequest` → `startedAt`) hisoblanadi: Payload init, sovuq
 * start'dagi ulanish va pre-step'lar (settings, stale job'lar, feed.poll/cleanup navbati) ham
 * shu byudjetga kiradi (OBLOG-33: deadline pre-step'lardan keyin hisoblangani uchun chaqiruv
 * 60 s dan oshib, 504 bo'lgan):
 *
 * - yangi batch faqat `startedAt + min(jobsDeadlineSec, BATCH_START_LIMIT_MS)` gacha boshlanadi
 *   (`jobsDeadlineSec` default 40, amalda ≤ 35 s);
 * - boshlangan task'lar `+ TASK_GRACE_MS` (10 s) ichida tugashi shart (`getRunDeadline`):
 *   `feed.poll` HTTP timeout'larini moslaydi, `scrapeItem` har bosqich oldidan qolgan vaqtni
 *   tekshiradi (yetmasa — `resume` bilan keyingi chaqiruvga);
 * - keyin `countRemainingJobs` + ogohlantirishlar — faqat `RESPONSE_BUDGET_MS` (50 s) gacha;
 * - bitta task ≤ `TASK_BUDGET_MS` (25 s) — "1 feed yoki 1 maqola" (TZ §3.7.2: har task ≤ 30 s).
 *
 * Natija: 35 (oxirgi batch boshlanishi) + 10 (grace) + 5 (Payload job holati, hisob) = 50 s
 * javobgacha; qolgan ≤ 10 s — handler'gacha bo'lgan sovuq start (modul yuklash) va javobni
 * yuborish uchun zaxira: < 60 s.
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

/** `scraping-settings.jobsDeadlineSec` default'i va chegarasi (DB default'i ham 40). */
export const DEFAULT_DEADLINE_SEC = 40
export const MAX_DEADLINE_SEC = 45
export const TASK_GRACE_MS = 10_000
export const TASK_BUDGET_MS = 25_000

/** `/api/jobs/run`: so'rov boshidan javobgacha (60 s gacha ~10 s — sovuq start va javob uchun). */
export const RESPONSE_BUDGET_MS = 50_000
/** Oxirgi task'dan keyingi ish (Payload job holati, `countRemainingJobs`) uchun zaxira. */
export const FINALIZE_RESERVE_MS = 5_000
/**
 * Yangi batch boshlashning qat'iy chegarasi (so'rov boshidan): `jobsDeadlineSec` bundan katta
 * bo'lsa ham shu ishlatiladi — 50 − 10 − 5 = 35 s.
 */
export const BATCH_START_LIMIT_MS = RESPONSE_BUDGET_MS - TASK_GRACE_MS - FINALIZE_RESERVE_MS

/**
 * `scrapeItem` keyingi bosqichni (`item.extract` / `item.dedupe` / `item.classify`) faqat
 * run deadline'igacha kamida shuncha vaqt qolsa boshlaydi; aks holda workflow bajarilgan
 * bosqichlar natijasi bilan qayta navbatga qo'yiladi (`resume`, retry sarflanmaydi).
 */
export const SCRAPE_STEP_MIN_WINDOW_MS = 5_000

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

/**
 * Bir vaqtda (parallel) bajariladigan job'lar soni — DB pool'idan oshmasligi kerak.
 * Payload bitta `jobs.run` batch'idagi job'larni parallel bajaradi va har job task log'ini
 * o'z tranzaksiyasida yozadi (`updateJob` → `beginTransaction`); `writeScrapeResult` va
 * `item.dedupe` ham tranzaksiya ushlab turadi. Runtime pool — 3 ulanish, bittasini
 * `@payloadcms/db-postgres` doimiy band qiladi (`RUNTIME_POOL_MAX`): 2 ta ishchi ulanish.
 * OBLOG-33: batch'da 10 ta `scrapeItem` parallel ishlab, ulanish kutish 10 s dan oshgan
 * (`timeout exceeded when trying to connect`). Shuning uchun har `jobs.run` batch'i —
 * `min(jobsBatchLimit, JOBS_CONCURRENCY)` job: har job bir vaqtda ≤ 1 ulanish ishlatadi,
 * deadline esa har ≤ 2 job'dan keyin tekshiriladi.
 */
export const JOBS_CONCURRENCY = 2

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
