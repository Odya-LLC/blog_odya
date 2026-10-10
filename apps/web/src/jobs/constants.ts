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

/**
 * Payload'ning o'z rejalashtirilgan nashr task'i (`versions.drafts.schedulePublish`), `default`
 * navbatida. Retry'siz — bitta xato job'ni yakunlaydi; post `scheduled` da qolib ketmasligi
 * uchun scheduler uni qayta navbatga qo'yadi (`ensureScheduledPublishJobs`, OBLOG-100).
 */
export const SCHEDULE_PUBLISH_TASK = 'schedulePublish'
/** Bitta rejalashtirilgan post uchun ko'pi bilan shuncha xatoli urinish (keyin — Sentry, qo'lda). */
export const SCHEDULE_PUBLISH_MAX_ATTEMPTS = 3

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

/**
 * `/api/jobs/run?mode=` (OBLOG-110) — scheduler kadensi:
 * - `publish` — har 10 daqiqada: faqat **nashr** job'lari ({@link PUBLISH_TASKS});
 * - `scrape` — har 30 daqiqada: yangiliklar (feed.poll, `scrapeItem`), kunlik tozalash,
 *   ogohlantirishlar, "yangi yangiliklar" xabari;
 * - `all` (default, parametr yo'q) — avval nashr, keyin scraping (eski cron, GitHub zaxira).
 */
export const JOBS_RUN_MODES = ['publish', 'scrape', 'all'] as const
export type JobsRunMode = (typeof JOBS_RUN_MODES)[number]

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

/**
 * Scraping tick'i har 30 daqiqada (`mode=scrape`, OBLOG-110) — interval chegarasidagi feed'lar
 * bir tick'ga kechikmasligi uchun.
 */
export const DUE_SLACK_MS = 60_000

/**
 * Standart poll oralig'i (daqiqa, OBLOG-112) — scraping tick'iga (har 30 daqiqa) teng: kichikroq
 * qiymat foyda bermaydi (manba baribir har tick'da o'qiladi), kattarog'i amalda 30 ga karrali
 * qilib yuqoriga yaxlitlanadi (45 → har 2-tick, ya'ni 60 daqiqa).
 */
export const DEFAULT_POLL_INTERVAL_MIN = 30

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
/**
 * Manba xatosi (`source-failing`, OBLOG-53): feed allaqachon backoff'da (so'rovlar siyraklashgan),
 * shuning uchun eslatma — haftada 1 marta (har kuni o'sib boruvchi hisoblagich bilan emas).
 */
export const SOURCE_FAILING_REMINDER_MS = 7 * 24 * 60 * 60_000

// --- M3-01: Telegram avtopost ---

/** `telegram.post` — bitta (post, yozuv) juftligi uchun yuborish/tahrirlash (TZ §7.1). */
export const TELEGRAM_POST_TASK = 'telegram.post'
/** Telegram xatosida qayta urinishlar soni (birinchi urinishdan keyin), keyin — ogohlantirish. */
export const TELEGRAM_MAX_RETRIES = 3
/** 429 bo'lmagan xatolarda qayta urinishlar orasidagi pauza: 5 s, 30 s, 120 s. */
export const TELEGRAM_RETRY_BACKOFF_MS = [5_000, 30_000, 120_000] as const
/**
 * Shu vaqtgacha bo'lgan pauza (`retry_after` yoki backoff) task ichida kutiladi (run deadline'i
 * yetsa); uzunrog'i — job `waitUntil` bilan qayta navbatga qo'yiladi (keyingi scheduler tsikli).
 */
export const TELEGRAM_INLINE_WAIT_MAX_MS = 10_000
/** Bitta Bot API so'rovi timeout'i. */
export const TELEGRAM_API_TIMEOUT_MS = 10_000

// --- OBLOG-116: Telegram dayjesti ---

/** `telegram.digestEdit` — dayjestdagi post sarlavhasi o'zgarganda caption'ni tahrirlash. */
export const TELEGRAM_DIGEST_EDIT_TASK = 'telegram.digestEdit'
/** Dayjest yuborishga urinishlar (har biri — alohida tick), keyin — `failed` + ogohlantirish. */
export const TELEGRAM_DIGEST_MAX_ATTEMPTS = 3
/**
 * `pending` (band qilingan) qator shuncha vaqt yangilanmasa — tick uzilgan deb hisoblanadi va
 * qayta band qilinadi (function limiti 60 s dan ancha uzun — ishlayotgan tick bilan to'qnashmaydi).
 */
export const TELEGRAM_DIGEST_PENDING_STALE_MS = 10 * 60_000
/** Dayjest oynasi ko'pi bilan shuncha orqaga (oxirgi muvaffaqiyatli slotdan; birinchi ishga tushishda). */
export const TELEGRAM_DIGEST_LOOKBACK_MAX_MS = 24 * 60 * 60_000

// --- OBLOG-57: IndexNow ---

/** `indexnow.submit` — maqola URL'larini IndexNow'ga yuborish (`src/indexnow`). */
export const INDEXNOW_SUBMIT_TASK = 'indexnow.submit'
/** 429/5xx/tarmoq xatosida qayta urinishlar orasidagi pauza (job `waitUntil`): 1, 5, 15 daqiqa. */
export const INDEXNOW_RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const

// --- OBLOG-91: Make.com avtopost ---

/** `make.webhook` — chop etilgan post (bitta yozuv) haqida Make webhook'iga JSON yuborish. */
export const MAKE_WEBHOOK_TASK = 'make.webhook'
/** Bitta webhook so'rovi timeout'i. */
export const MAKE_WEBHOOK_TIMEOUT_MS = 15_000
/**
 * 429/5xx/tarmoq xatosida qayta urinishlar orasidagi pauza (job `waitUntil`): 1, 5, 15 daqiqa.
 * Hammasi tugagach — `alertChatId` ga ogohlantirish.
 */
export const MAKE_RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const

// --- OBLOG-110: nashr bosqichi ---

/**
 * Nashr va undan keyingi ishlar (`default` navbati): `/api/jobs/run` ularni scraping'dan **oldin**
 * va ketma-ket bajaradi (`mode=publish|all`); `mode=scrape` ularga tegmaydi.
 */
export const PUBLISH_TASKS: readonly string[] = [
  SCHEDULE_PUBLISH_TASK,
  TELEGRAM_POST_TASK,
  TELEGRAM_DIGEST_EDIT_TASK,
  MAKE_WEBHOOK_TASK,
  INDEXNOW_SUBMIT_TASK,
]

/**
 * Nashr bosqichi batch'i: **ketma-ket** (`sequential`), bir batch'da ko'pi bilan shuncha job.
 * Har publish — bitta tranzaksiya (pool ulanishi, `RUNTIME_POOL_MAX` = 3): `jobsBatchLimit` (10)
 * ta parallel publish pool'ni to'ldirib, bir-birini kutib `Failed query` bilan yiqilardi. Batch
 * kichik — deadline har batch oldidan tekshiriladi, boshlangan batch ko'pi bilan 3 ta job.
 */
export const PUBLISH_BATCH_LIMIT = 3
