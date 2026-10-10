# Runbook: fon vazifalar scheduler'i (pg_cron → `/api/jobs/run`)

TZ §3.5, §3.7.1, §3.7.2. Kod: `apps/web/src/jobs/`, endpoint: `apps/web/src/app/(payload)/api/jobs/run/route.ts`, SQL: `infra/supabase/cron.sql`, zaxira: `.github/workflows/jobs-fallback.yml`.

## Qanday ishlaydi

Ikki kadens (OBLOG-110) — nashr va yangiliklar bir-biriga xalaqit bermaydi:

| pg_cron job | Jadval | Chaqiruv | Nima qiladi |
| --- | --- | --- | --- |
| `blog-odya-jobs-publish` | `*/10 * * * *` (har 10 daqiqa) | `POST /api/jobs/run?mode=publish` | Faqat **nashr**: vaqti kelgan rejalashtirilgan postlar (`schedulePublish`) va ulardan keyingi `telegram.post`, `telegram.digestEdit`, `make.webhook`, `indexnow.submit`; slot vaqti kelgan bo'lsa — **Telegram dayjesti** (OBLOG-116) va **Instagram dayjest karuseli** (OBLOG-118, Make) |
| `blog-odya-jobs-scrape` | `5,35 * * * *` (har 30 daqiqa) | `POST /api/jobs/run?mode=scrape` | **Yangiliklar**: `feed.poll` → `scrapeItem`, kunlik `maintenance.cleanup`, ogohlantirishlar, "yangi yangiliklar" xabari |

`mode` siz chaqiruv (`all` — eski yagona jadval, GitHub zaxirasi, qo'lda `curl`) ikkalasini bajaradi: **avval nashr,
keyin scraping**. Scraping :05 va :35 da — nashr chaqiruvlari (:00, :10, …) bilan ustma-ust tushmaydi.

```
POST /api/jobs/run?mode=publish|scrape|all  (Bearer JOBS_SECRET)
   │  (hamma vaqt chegaralari SO'ROV BOSHIDAN — Payload init/sovuq start ham kiradi)
   ├─ processing'da qolib ketgan job'larni bo'shatish (> 5 daqiqa, bitta UPDATE)        — har doim
   ├─ 1-BOSQICH, NASHR (publish | all):
   │    ├─ job'i yo'qolgan/xato bergan rejalashtirilgan postlar uchun schedulePublish (OBLOG-100)
   │    └─ default navbatidagi nashr task'lari — KETMA-KET, 3 tadan batch (`PUBLISH_BATCH_LIMIT`):
   │       schedulePublish → (hook qo'ygan) telegram.post / make.webhook / indexnow.submit
   │    └─ Telegram dayjesti (OBLOG-116): rejim digest/hybrid va slot ≤ hozir (≤ 60 daqiqa kechikkan) —
   │       har kanal uchun telegram-digests qatorini atomar band qilib, bitta galereya/xabar
   │    └─ Instagram dayjesti (OBLOG-118): Make rejimi story+digest va slot (07:30/12:30/18:30) —
   │       instagram-digests qatorini atomar band qilib, bitta `type: digest` webhook (karusel)
   ├─ 2-BOSQICH, SCRAPING (scrape | all):
   │    ├─ muddati kelgan manbalar uchun feed.poll navbatga (pollIntervalMin)
   │    ├─ maintenance.cleanup — kuniga 1 marta (Toshkent kuni, idempotent)
   │    │    (bu ikkisi deadline allaqachon o'tgan bo'lsa — keyingi tick'ga, `skipped`)
   │    └─ payload.jobs.run({ limit }) batch'lari (`jobsBatchLimit` ta PARALLEL), nashr task'larisiz:
   │       default (feed.poll, maintenance.cleanup) →
   │       scrape (scrapeItem: item.fetch → item.extract → item.dedupe → item.classify)
   │  yangi batch ≤ 35 s gacha; boshlangan task'lar ≤ 45 s gacha tugaydi (scrapeItem vaqt yetmasa — `resume`)
   └─ ogohlantirishlar + "yangi yangiliklar" (scrape | all; so'rov boshidan ≤ 50 s bo'lsa)
```

Nega nashr alohida va ketma-ket: har publish — bitta DB tranzaksiyasi (pool ulanishi), runtime pool esa 3 ulanish.
OBLOG-110 gacha nashr job'lari scraping bilan bitta navbatda `jobsBatchLimit` (10) ta parallel bajarilardi; publish
hook'lari (IndexNow kategoriya slug'i, Telegram/Make sozlamalari) tranzaksiyadan **tashqarida** ikkinchi ulanish
kutardi — 2–3 ta parallel publish pool'ni to'ldirib, 10 s dan keyin `Failed query: select "id", "slug" from
"categories" …` bilan yiqilardi (2026-10-08, MCP orqali har 5 daqiqaga rejalashtirilgan 9 post). Endi hook'lardagi
barcha o'qishlar shu tranzaksiyada (`req`, `apps/web/src/lib/hookReq.ts`), nashr esa ketma-ket.

- `scrape` navbati (M2-02) faqat `S3_RAW_BUCKET` sozlangan bo'lsa ishga tushadi (raw/clean HTML gzip arxivi —
  DB'ga HTML yozilmaydi). Sozlanmagan bo'lsa `scrapeItem` job'lari kutib turadi, elementlar `Navbatda` holatida qoladi.

- **Poll oralig'i** (OBLOG-112): manba `pollIntervalMin` (bo'sh bo'lsa — admin → Scraping sozlamalari →
  `defaultPollIntervalMin`), ikkalasining standarti **30 daqiqa** — scraping tick'iga (`blog-odya-jobs-scrape`, har
  30 daqiqa) teng. Feed faqat tick'da tekshiriladi (1 daqiqalik slack bilan), shuning uchun oraliq amalda 30 ga
  karrali qilib yuqoriga yaxlitlanadi: ≤ 30 (masalan seed'dagi 15/20) — har tick'da o'qiladi, 45 → har 2-tick
  (60 daqiqa), 60 → har 2-tick, 90 → har 3-tick. 30 dan kichik qiymat feed'ni tezroq o'qimaydi.

- Javob (JSON): `mode`, `enqueued`, `cleanupEnqueued`, `scheduledPublish: { queued, failed }` (`mode=scrape` da `null`), `telegramDigest` (OBLOG-116; `mode=scrape` da `null`), `instagramDigest` (OBLOG-118; `{ mode, slotAt, status, posts, skipped }`, `mode=scrape` da `null`), `alerts: { active, sent, logged, failed }` va `newItems` (`mode=publish` da `null`), `batches`, `done: { succeeded, failed }` (ikkala bosqich yig'indisi), `phases: { publish, scrape }` (har bosqich: `batches`, `succeeded`, `failed`, `deadlineReached`; rejimga kirmagani — `null`), `remaining` (shu rejim job'lari), `deadlineReached`, `skipped` (vaqt yetmay o'tkazib yuborilgan qadamlar: `scheduledPublish`, `telegramDigest`, `instagramDigest`, `feedPolls`, `cleanup`, `alerts`, `newItems`), `limit`, `deadlineSec` (amaldagi), `durationMs`.
- `401` — token noto'g'ri/yo'q; `503` — serverda `JOBS_SECRET` sozlanmagan (endpoint yopiq); `400` — `mode` noto'g'ri
  (`publish` | `scrape` | `all`).
- `?limit=N` (1–50) — **scraping** batch hajmini vaqtincha o'zgartirish; default — admin → Scraping sozlamalari →
  `jobsBatchLimit`. Scraping batch'idagi job'lar **parallel** (default 10), DB pool esa 3 ulanish. Function region DB
  bilan bir xil bo'lsa (`bom1` ↔ `ap-south-1`) 10 yetarli; pool xatolari chiqsa — pastdagi "Muammolar" jadvali.
  Nashr bosqichiga ta'sir qilmaydi — u doim ketma-ket (3 tadan batch).
- **Vaqt byudjeti** (`apps/web/src/jobs/constants.ts`, so'rov boshidan): yangi batch ≤ `min(jobsDeadlineSec, 35)` s
  (`jobsDeadlineSec` default 40 → amalda 35); boshlangan task'lar + 10 s grace (≤ 45 s); `countRemainingJobs` +
  ogohlantirishlar ≤ 50 s; qolgan ~10 s — handler'gacha bo'lgan sovuq start va javob uchun zaxira, `maxDuration = 60`.
  `scrapeItem` har bosqich (extract, dedupe, classify) oldidan run deadline'igacha ≥ 5 s qolganini tekshiradi;
  qolmasa — bajarilgan bosqichlar natijasi (`input.resume`) bilan yangi job navbatga qo'yiladi (joriy job
  muvaffaqiyatli tugaydi, retry sarflanmaydi, sahifa qayta yuklanmaydi).
- `JOBS_MODE=autorun` (Contabo worker) — Payload har daqiqada o'zi ishga tushiradi (har tick oldidan nashr
  job'lari ketma-ket bajariladi); pg_cron o'chiriladi.

## Birinchi sozlash (egasi, production)

1. **Sir yaratish:** `openssl rand -hex 32`.
2. **Function region = DB region.** Supabase loyihasi `ap-south-1` (Mumbai) da — Vercel funksiyalari `bom1` (Mumbai)
   da ishlashi shart: `apps/web/vercel.json` → `"regions": ["bom1"]` (Vercel project Root Directory — `apps/web`).
   Tekshiruv: Vercel → Project → Settings → Functions → Function Region = `bom1`; deploy log'idagi funksiyalar va
   Vercel Logs'dagi `POST /api/jobs/run` qatorida region `bom1`. Default `iad1` (Washington) ↔ Mumbai — har SQL
   so'rovi ~200+ ms: sovuq start + pre-step'larning o'zi ~16 s, chaqiruv 60 s da `504` bilan uzilgan (OBLOG-33).
   Supabase regioni o'zgarsa — `vercel.json` ni ham yangilang (mos region: Supabase → Settings → General, Vercel
   region ro'yxati — vercel.com/docs/regions).
3. **Vercel** → Project → Settings → Environment Variables → **Production**: `JOBS_SECRET=<sir>` (`JOBS_MODE` — `endpoint` yoki bo'sh), `S3_RAW_BUCKET=blog-odya-raw` (yopiq R2 bucket, ommaviy domensiz; Lifecycle rule — 30 kundan keyin o'chirish; R2 tokeni shu bucket'ga yozish/o'qish huquqi bilan). Preview scope'ga qo'ymang. Redeploy.
4. **Tekshiruv (qo'lda):**
   ```bash
   curl -sS -X POST -H "Authorization: Bearer <sir>" https://blog.odya.uz/api/jobs/run
   # → {"ok":true,"mode":"all","enqueued":6,...}
   curl -sS -X POST -H "Authorization: Bearer <sir>" 'https://blog.odya.uz/api/jobs/run?mode=publish'
   # → {"ok":true,"mode":"publish","phases":{"publish":{...},"scrape":null},...}
   curl -sS -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer wrong" https://blog.odya.uz/api/jobs/run
   # → 401
   ```
   Manbalar bazada bo'lishi kerak — prod seed GitHub Actions orqali (demo kontentsiz, idempotent):
   ```bash
   gh workflow run seed-prod --ref main            # SEED_DEMO=false (default)
   gh run watch "$(gh run list --workflow seed-prod --limit 1 --json databaseId -q '.[0].databaseId')"
   ```
   Run'ning Summary'sida: `Manbalar: +7, mavjud 0` (qayta ishga tushirilsa — `+0, mavjud 7`), `Demo kontent o'tkazib yuborildi`.
   Batafsil (sirlar, huquqiy sahifa o'rinbosarlari) — README → "Prod seed".
5. **Supabase** → SQL Editor:
   1. `infra/supabase/cron.sql` boshidagi **1-qadam** — Vault'ga URL va sirni qo'shing (qiymatlarni faqat SQL Editor'da yozing, repo'ga emas).
   2. `infra/supabase/cron.sql` ni to'liq ishga tushiring (Database → Extensions'da `pg_cron` va `pg_net` avtomatik yoqiladi).
6. **30–40 daqiqadan keyin tekshiring:**
   ```sql
   select jobname, schedule, active from cron.job where jobname like 'blog-odya-%';
   -- blog-odya-jobs-publish | */10 * * * *  ; blog-odya-jobs-scrape | 5,35 * * * *  ; blog-odya-cron-cleanup
   select j.jobname, d.status, d.return_message, d.start_time
     from cron.job_run_details d join cron.job j using (jobid)
     where j.jobname in ('blog-odya-jobs-publish', 'blog-odya-jobs-scrape')
     order by d.start_time desc limit 10;
   select status_code, left(content, 300), error_msg, created
     from net._http_response order by created desc limit 10;
   ```
   Vercel → Project → Logs: `POST /api/jobs/run?mode=publish` har 10 daqiqada, `?mode=scrape` — :05 va :35 da,
   `200`. Admin → Scraping → Yig'ilgan elementlar — yangi yozuvlar (`Navbatda` holati).

### OBLOG-110 gacha o'rnatilgan scheduler'ni yangilash

Eski `cron.sql` bitta `blog-odya-jobs-run` (`*/10`, rejimsiz) yaratgan. Deploy'dan keyin (yangi kod `?mode=` ni
tushunadi) Supabase → SQL Editor'da **yangi `infra/supabase/cron.sql` ni to'liq** ishga tushiring — Vault sirlari
o'zgarmaydi (1-qadam qayta kerak emas), eski job o'chiriladi, ikkita yangisi yaratiladi. Deploy'dan oldin
ishga tushirilsa ham xavfsiz: eski kod `?mode=` ni e'tiborsiz qoldiradi (har chaqiruv — hammasi, avvalgidek).
Agar nosozlik paytida admin → Scraping sozlamalari → `jobsBatchLimit` vaqtincha kamaytirilgan bo'lsa (masalan 1) —
qaytaring (default **10**): endi u faqat scraping'ga ta'sir qiladi, nashr baribir ketma-ket.

## Sirni almashtirish (rotation)

1. Yangi sir → Vercel `JOBS_SECRET` (Production) → redeploy.
2. Supabase SQL Editor: `select vault.update_secret((select id from vault.secrets where name = 'blog_odya_jobs_secret'), '<yangi sir>');`
3. GitHub zaxira ishlatilsa — repo secret `JOBS_SECRET` ni ham yangilang.

Oraliqda (1–2 qadam orasida) chaqiruvlar `401` oladi — keyingi tick'da tiklanadi.

## Muammolar

| Belgi | Sabab / yechim |
| --- | --- |
| `net._http_response.status_code = 401` | Vault'dagi sir Vercel'dagidan farq qiladi — rotation bo'limi |
| `503` | Vercel Production'da `JOBS_SECRET` yo'q |
| `status_code` bo'sh, `error_msg` = timeout | Endpoint 65 s da javob bermadi — Vercel Logs'da function timeout'ni tekshiring (keyingi qator) |
| Vercel Logs: `504`, `FUNCTION_INVOCATION_TIMEOUT` / `Task timed out after 60 seconds` | 1) **Region**: log qatoridagi function region Supabase regioniga mos emas (`iad1` ↔ `ap-south-1`) — har so'rov ~200 ms, sovuq start + pre-step'larning o'zi o'nlab soniya. `apps/web/vercel.json` → `regions: ["bom1"]`, redeploy (yuqoridagi 2-qadam). 2) **Pool**: logda `timeout exceeded when trying to connect` / `cannot begin transaction` — parallel job'lar 3 ulanishli pool'ni to'sgan (keyingi qator). 3) Byudjet so'rov boshidan hisoblanadi (≤ 35 + 10 + 5 s) — agar baribir 60 s oshsa, javobdagi `durationMs` va logdagi bosqich vaqtlarini solishtiring; `jobsDeadlineSec` ni kamaytirish mumkin |
| Logda `timeout exceeded when trying to connect` / `cannot begin transaction` (DB pool), job'lar `failed` | Bitta batch'dagi parallel job'lar 3 ulanishli pool'ga sig'magan. Admin → Scraping sozlamalari → `jobsBatchLimit` ni kamaytiring (masalan 10 → 5, kerak bo'lsa 2–3) — keyingi tick'dan amal qiladi, deploy shart emas; vaqtincha sinash uchun `?limit=N`. `RUNTIME_POOL_MAX` ni oshirmang (Supavisor limiti). Avval region mosligini tekshiring (yuqoridagi qator, 1-band) |
| `schedulePublish` job'i `Failed query: select … from "categories"` (yoki boshqa jadval) bilan xato, post `scheduled` da qoldi | OBLOG-110 da tuzatilgan: publish hook'i tranzaksiyadan tashqarida ikkinchi ulanish kutgan. Yangi hook'da Local API o'qishiga `req` bering (`keepReqLocale`, `apps/web/src/lib/hookReq.ts`). Qolib ketgan postlar — keyingi `mode=publish` tick'ida `ensureScheduledPublishJobs` qayta qo'yadi (javobda `scheduledPublish.queued`), 3 urinishgacha |
| Rejalashtirilgan post vaqtida chiqmadi, `cron.job` da `blog-odya-jobs-publish` yo'q | Yangi `cron.sql` ishga tushirilmagan (yuqoridagi "yangilash" bo'limi). Eski `blog-odya-jobs-run` ham bo'lmasa — scheduler umuman o'chiq |
| Log: `DeprecationWarning: Calling client.query() when the client is already executing a query` | Bitta tranzaksiya ulanishida parallel so'rovlar — Payload'ning bulk `payload.update/delete` (`where` bilan) hujjatlarni `Promise.all` bilan yangilaydi. Jobs kodida bunday chaqiruv yo'q (`releaseStaleJobs` — bitta SQL `UPDATE`); yangi kod bulk update/delete'ni tranzaksiya ichida ishlatmasin |
| Javobda `skipped: ["feedPolls", "cleanup"]`, `batches: 0` | Pre-step'lar (sovuq start, Payload init) ichki deadline'ni (35 s) yeb qo'ygan — navbatga qo'yish keyingi tick'da. Doimiy bo'lsa — region/DB kechikishini tekshiring |
| `scrapeItem` job'i `input.resume` bilan | Normal: oldingi chaqiruvda vaqt yetmay qolgan, keyingi chaqiruvda qolgan bosqichlardan davom etadi (retry emas) |
| `deadlineReached: true`, `remaining` o'sib bormoqda (`mode=scrape`) | Yangiliklar navbati to'planmoqda — `jobsBatchLimit` ni oshiring (pool xatolari chiqmasa, yuqoridagi qator) yoki zaxira workflow'ni vaqtincha yoqing (`mode=scrape`); region mosligini ham tekshiring. Nashrga ta'sir qilmaydi — u alohida chaqiruvda |
| Manba `stats.consecutiveFailures` o'smoqda | Feed xatosi (`feeds[].lastError`, `lastStatus`) — admin → Manbalar; 403/Cloudflare bo'lsa manbani o'chirib turing |
| Hech narsa navbatga qo'yilmaydi (`enqueued: 0`) | Scraping sozlamalari → "Yig'ish yoqilgan" o'chiq, yoki feed'lar `pollIntervalMin` dan erta (masalan oraliq 45/60 — har 2-tick'da o'qiladi, yuqoridagi "Poll oralig'i") |

## Dedupe, klassifikatsiya, tozalash va ogohlantirishlar (M2-03)

- **`item.dedupe`** — sarlavha + matndan 64-bit SimHash (`contentHash`); oxirgi 72 soatdagi elementlar bilan
  Hamming ≤ 3 (yoki bir xil canonical URL) — umumiy `clusterId`; o'sha manbadagi aynan bir xil matn —
  `status = duplicate`. Tahririyat navbati klasterlarni guruhlab ko'rsatadi. Boshqacha yozilgan yoki boshqa
  tildagi maqolalar SimHash bilan birlashmaydi (LLM'siz chegara).
- **`item.classify`** — `suggestedCategory` = feed mapping (`feeds[].mappingWeight`: bo'lim feedi 10, keng bo'lim 5,
  umumiy feed 1) + `keywordRules` (kategoriya bo'yicha ≤ 10 ball); `score` 0–100 = `priority` + yangilik (48 soatda
  0 ga tushadi, ≤ 25) + klaster (+5 har qo'shimcha manba, ≤ 15) + kalit so'z boost (≤ 10). Hisob tafsiloti —
  element `fetchMeta.classify` da. Aniqlik testi: `apps/web/tests/classify-accuracy.test.ts` (60 ta real namuna).
- **`maintenance.cleanup`** (kuniga 1 marta): 30 kundan eski, qoralamaga aylanmagan elementlarning `extractedText` i;
  30 kun oldin rad etilgan elementlar (≤ 500/kun); chop etilganiga 30 kun bo'lgan postlarning versiyalari 3 tagacha;
  90 kundan eski kunlik ko'rishlar (`post_views_daily`, OBLOG-69; jami `post_views_total` saqlanadi);
  `pg_database_size` va R2 hajmi (media + arxiv bucket, `ListObjectsV2`, ≤ 12 s) → Scraping sozlamalari → Statistika.
- **Ogohlantirishlar** — Telegram: `TELEGRAM_BOT_TOKEN` + chat (`telegram-settings.alertChatId`, bo'lmasa
  `TELEGRAM_ALERT_CHAT_ID`); sozlanmagan bo'lsa faqat log (`ALERT: ...`). Shartlar: manba feed'i ketma-ket ≥ 3 xato;
  manbaning 24 soatlik yig'ish muvaffaqiyati < 80% (≥ 5 element); DB ≥ 350 MB (70%); R2 ≥ 8 GB. Bir shart —
  24 soatda bir marta (holat `stats.alerts` da), hal bo'lsa keyingi safar darhol.
- **Feed backoff (OBLOG-53)** — holat `sources.feeds[]` da (admin → Manba → Feed → "Poll holati"):
  `failureCount`, `lastErrorKind`, `nextPollAt` (shu vaqtgacha feed so'ralmaydi).
  - **Cloudflare challenge** (`cf-mitigated: challenge` yoki 403/503 + `server: cloudflare` + "Just a moment..."
    sahifasi) — chetlab o'tilmaydi; feed darhol **kuniga 1 marta** tekshiriladi. Ogohlantirish
    `source-blocked:<id>` — **bitta** xabar ("Cloudflare himoyasi — fid yopiq, kuniga 1 marta tekshiriladi"),
    eslatma yo'q.
  - **Boshqa xatolar** (HTTP, timeout, tarmoq, parse) — 2 ta xatogacha oddiy interval, keyin har safar 2×:
    30 daq → 1 → 2 → 4 → 8 → 16 → 24 soat (cap). Ogohlantirish `source-failing:<id>` (≥ 3 xato) — eslatma
    **haftada** 1 marta (avval har 24 soatda o'sib boruvchi hisoblagich bilan edi).
  - Feed yana o'qilsa — holat tozalanadi va Telegram'ga **"tiklandi"** xabari. Manba o'chirilsa — ogohlantirish jim
    yopiladi.
  - **Darhol qayta tekshirish:** feed URL'ini o'zgartiring yoki manbani o'chirib-yoqing («Faol») — backoff tozalanadi,
    feed keyingi `/api/jobs/run?mode=scrape` da (≤ 30 daqiqa) so'raladi.
  - Doimiy yopiq manba (masalan, HLTV.org, 2026-09-27) — admin → Manbalar → manba → «Faol» ni o'chiring.
- **Yangi yangiliklar xabari (OBLOG-55)** — har scraping tick'ida (`/api/jobs/run?mode=scrape`, har 30 daqiqa:
  barcha job'lardan keyin;
  `autorun`: har tick oldidan) shu chatga **bitta** qisqa xabar: `🆕 Yangi yangiliklar: N ta`, manbalar bo'yicha
  (≤ 8 qator, qolgani "+N boshqa"), top-3 rubrika (`suggestedCategory`) va admin → "Yangiliklar navbati" havolasi
  (`NEXT_PUBLIC_SITE_URL/admin/news-queue`). "Yangi" — oxirgi xabardan beri yaratilgan `scraped-items`
  (`duplicate`/`rejected` emas; dedupe shu tick'da ulgurmagan `pending` lar ham kiradi). `feed.poll` har manba uchun
  alohida job bo'lsa ham xabar tick'da bitta (oyna chegarasi `scraping-settings.stats.newItems.watermark`, parallel
  chaqiruvlar — atomar CAS). 0 ta — xabar yo'q. Admin → Telegram sozlamalari: "Yangi yangiliklar haqida xabar
  berish" (o'chirish) va "Xabar uchun minimal soni" (kam bo'lsa keyingi tick'larda yig'iladi; oyna ≤ 3 soat orqaga).
  Token/chat yo'q — jim o'tkaziladi; Telegram xatosi job'ni yiqitmaydi (log, xabar qayta yuborilmaydi).
- **Sozlash (egasi):** bot'ni admin guruhiga qo'shing, guruh chat ID'sini (`-100…`) Vercel `TELEGRAM_ALERT_CHAT_ID`
  yoki admin → Telegram sozlamalari → "Admin ogohlantirish guruhi" ga yozing; `TELEGRAM_BOT_TOKEN` — Vercel env.
- **Kunlik tozalashni qayta ishga tushirish:** Scraping sozlamalari statistikasidagi `cleanup.enqueuedDate` bugungi
  sana bo'lsa, ertaga ishlaydi; darhol kerak bo'lsa SQL: `update scraping_settings set stats = stats #- '{cleanup,enqueuedDate}';`
  va `/api/jobs/run?mode=scrape` ni chaqiring.

## Telegram avtopost — `telegram.post` (M3-01)

- **Trigger:** post chop etilganda (Publish, MCP, `schedulePublish`) `posts` `afterChange` har faol kanal uchun
  `telegram.post` job'ini `default` navbatiga qo'yadi va javobdan keyin (`after()` → Vercel `waitUntil`) darhol
  bajaradi — odatda bir necha soniyada. `after()` ishlamasa (yoki scheduled publish'da) — `/api/jobs/run` nashr
  bosqichining o'sha/keyingi chaqiruvida (≤ 10 daqiqa). Qoralama/autosave, arxivlash va "Telegram'ga yubormaslik" —
  trigger emas.
- **Kanallar:** admin → Telegram sozlamalari → Kanallar (`script` bo'yicha qator ustun; "Yoqilgan" o'chirilsa —
  o'sha kanal o'chiq), qator bo'lmasa — env `TELEGRAM_CHANNEL_LATN` / `TELEGRAM_CHANNEL_CYRL`. Bot ikkala kanalda
  admin ("xabar yuborish" + "tahrirlash"). Token yoki kanal yo'q — xato emas, log'da `warn` ("... sozlanmagan").
- **Xabar:** muqova bo'lsa `sendPhoto` (`og` → `hero` variant URL'i, `MEDIA_PUBLIC_URL`) + HTML caption ≤ 1024
  (oshsa lid qisqartiriladi), rasmsiz — `sendMessage` (havola preview). Lotin kanal — `uz-Latn` matni va `/…`,
  kirill — `uz-Cyrl` va `/kr/…`; UTM `utm_source=telegram&utm_medium=channel&utm_campaign=latn|cyrl`; heshteglar —
  teglar, keyin kategoriya ("Heshteglar soni", default 3). Telegram rasmni rad etsa (400) — `sendMessage` bilan.
- **Idempotentlik:** holat `posts.telegram[]` da (`messageId`, `chatId`, `kind`, matn `hash`, `sentAt`, `error`) —
  admin'da post yon panelidagi "Telegram" bloki. `messageId` bor bo'lsa qayta yuborilmaydi: qayta publish'da matn
  xeshi o'zgargan bo'lsa (sarlavha/lid/havola) — `editMessageCaption`/`editMessageText`, bo'lmasa hech narsa.
  Arxivlashda xabar o'chirilmaydi. Allaqachon chop etilgan eski postlar (M3-01 dan oldingi) qayta publish'da
  yuborilmaydi — faqat birinchi chop etish yuboradi.
- **Xatolar:** 429 — `retry_after` hurmat qilinadi; 429/5xx/tarmoq — 3 marta qayta urinish (≤ 10 s pauza task
  ichida, uzunrog'i — job `waitUntil` bilan keyingi tsiklda), keyin (yoki 400/403 kabi qayta urinib bo'lmaydigan
  xatoda) — `alertChatId` (bo'lmasa `TELEGRAM_ALERT_CHAT_ID`) ga ogohlantirish va `telegram[].error`. Xato bergan
  kanal postni keyingi publish qilishda qayta uriniladi.
- **Rejim (OBLOG-116):** yuqoridagilar — `telegram-settings.mode = post` yoki `hybrid` da "Telegram'ga darhol
  (alohida)" belgili post uchun. Standart rejim — `digest` (quyida): birinchi chop etish `telegram.post` qo'ymaydi.

## Telegram dayjesti (OBLOG-116)

- **Qachon:** alohida pg_cron yo'q — `/api/jobs/run?mode=publish|all` (va `autorun` tick'i) nashr job'laridan keyin
  `runTelegramDigests` (`apps/web/src/telegram/digest.ts`). Slotlar — Toshkent vaqti, admin → Telegram sozlamalari →
  Dayjest: birinchi soat (7), har N soat (3), oxirgi soat (22) → 07, 10, 13, 16, 19, 22. Tick oxirgi slot ≤ hozirni
  oladi; slot 60 daqiqadan ko'p kechikkan bo'lsa (tun, uzilish) — yuborilmaydi, postlari keyingi slotga qo'shiladi.
  Kechikish — 0–10 daqiqa (pg_cron `*/10`). Javobda: `telegramDigest: { mode, slotAt, scripts: [{ script, status,
  posts, skipped }] }` (`status`: `sent` | `single` | `empty` | `busy` (boshqa tick yubordi/yuboryapti) | `retry` |
  `failed` | `skipped`), vaqt yetmasa — `skipped: ["telegramDigest"]`.
- **Idempotentlik / poyga:** admin → Tizim → Telegram dayjestlar (`telegram-digests`), `key =
  digest:{script}:{slot ISO}` UNIQUE. Tick qatorni Telegram'ga yuborishdan **oldin** bitta SQL bilan band qiladi
  (`INSERT … ON CONFLICT ("key") DO UPDATE … WHERE status = 'retry' OR (pending AND 10 daqiqadan eski) … RETURNING`):
  ikki parallel tick'dan faqat bittasi qatorni oladi, ikkinchisi — `busy`. Muvaffaqiyatda — `sent`, `posts` (ro'yxat
  tartibida), `skippedPosts`, `messageIds`, caption `hash`. Telegram xatosida — `retry` (keyingi tick, jami 3
  urinish), keyin `failed` + `alertChatId` ga ogohlantirish (postlari keyingi slotga tushadi). Function tick o'rtasida
  uzilsa (`pending` qolsa) — 10 daqiqadan keyin qayta band qilinadi: Telegram xabarni qabul qilib bo'lgan, lekin
  holat yozilmagan bo'lsa — dublikat bo'lishi mumkin (juda kam holat).
- **Qaysi postlar:** kanal yozuvida chop etilgan, "Telegram'ga yubormaslik" siz, oxirgi `sent`/`empty` slotdan
  (ko'pi bilan 24 soat; birinchi ishga tushishda — oldingi slotdan) shu slotgacha `publishedAt` bilan, shu kanalga
  alohida yuborilmagan (`telegram[].messageId`) va hech bir dayjestda (`posts`/`skippedPosts`) bo'lmagan; `hybrid` da
  "Tezkor"lar — yo'q. Tartib — "Dayjestda muhimlik" (0–3), keyin yangiligi; `maxItems` (10) dan ortig'i va caption'ga
  sig'maganlari — `skippedPosts`, Telegram'ga **yuborilmaydi**.
- **Xabar:** ≥ 2 muqova — `sendMediaGroup` (birinchi 5 band muqovasi, caption birinchi rasmda), 1 — `sendPhoto`,
  0 — `sendMessage`; rasm rad etilsa (400) — matn. 1 post — odatdagi `telegram.post` formati (`format: single`,
  holat `posts.telegram[]` da), 0 — hech narsa (`empty`).
- **Tahrirlash:** dayjestdagi post qayta chop etilsa — `telegram.digestEdit` job'i (dayjest uchun bittadan) caption'ni
  qayta yig'adi, xesh o'zgargan bo'lsa `editMessageCaption` / `editMessageText`. Postlar to'plami va rasmlar
  o'zgarmaydi.
- **Qayta yuborish (qo'lda):** `telegram-digests` qatorini o'chiring (admin) — slot hali 60 daqiqa ichida bo'lsa,
  keyingi tick yangidan yig'adi va yuboradi. Rejimni vaqtincha `post` ga o'tkazish — dayjestni to'xtatadi.

## Instagram dayjest karuseli (OBLOG-118)

- **Qachon:** alohida pg_cron yo'q — nashr tick'ida (`mode=publish|all`) Telegram dayjestidan keyin
  `runInstagramDigests` (`apps/web/src/social/instagram/digest.ts`). Faqat Make yoqilgan, admin → Ijtimoiy tarmoqlar
  (Make) → «Instagram rejimi» = story + dayjest, webhook URL bor va lotin yozuvi tanlangan bo'lsa. Slotlar — «Dayjest
  vaqtlari» (standart `07:30, 12:30, 18:30`, Toshkent; umumiy jadval — `src/jobs/slots.ts`, Telegram ham shundan
  foydalanadi); slot 60 daqiqadan ko'p kechiksa — postlari keyingisiga. Javobda: `instagramDigest: { mode, slotAt,
  status, posts, skipped }` (`status`: `off` | `sent` | `single` | `empty` | `busy` | `retry` | `failed` | `skipped`),
  vaqt yetmasa — `skipped: ["instagramDigest"]`.
- **Idempotentlik:** admin → Tizim → Instagram dayjestlar (`instagram-digests`), `key = ig-digest:{slot ISO}` UNIQUE,
  Telegram dayjesti bilan bir xil atomar band qilish (`claimInstagramDigest`). Make xatosi (429/5xx/4xx/tarmoq) —
  `retry` (keyingi tick, jami 3 urinish, `X-Odya-Delivery` o'zgarmaydi), keyin `failed` + Telegram `alertChatId` ga
  ogohlantirish; xatoda postlar band qilinmaydi (keyingi slotga tushadi).
- **Postlar va format:** oldingi `sent`/`empty` slotdan (≤ 24 soat), `socialSkip` siz, boshqa Instagram dayjestida
  yoki alohida `post.published` (lotin) bo'lib chiqmaganlar; tartib — «Dayjestda muhimlik», keyin yangiligi; ≤ 9
  (muqova bilan ≤ 10 slayd), ortig'i — `skippedPosts`. 0 — `empty`, 1 — odatdagi `post.published` (`format: single`),
  2+ — `type: "digest"` JSON (`format: carousel`, muqova slaydi URL'i — `coverUrl`).
- **Qayta yuborish (qo'lda):** `instagram-digests` qatorini o'chiring — slot hali 60 daqiqa ichida bo'lsa, keyingi
  tick yangidan yig'adi. Rejimni `post` ga qaytarish — dayjestni (va story'larni) to'xtatadi.

## Rejalashtirilgan nashr — `schedulePublish` (OBLOG-100)

- **Qanday rejalashtiriladi:** admin'da post holati **Rejalashtirilgan** + **Rejalashtirilgan vaqt** (`review` dan),
  yoki MCP `submit_for_review(publishAt)` (avtomatik nashr yoqilgan bo'lsa; [docs/mcp.md](../mcp.md) §4). Ikkalasida
  ham `syncScheduledPublish` hook'i Payload'ning `schedulePublish` job'ini **`default`** navbatiga `waitUntil =
  scheduledAt` bilan qo'yadi; vaqt o'zgarsa — ko'chiradi, holatdan chiqilsa (`→ review`/`in_progress`, qo'lda
  Publish) — o'chiradi.
- **Kim bajaradi:** `/api/jobs/run?mode=publish` (har 10 daqiqa; `mode` siz chaqiruvda ham — birinchi bosqich) yoki
  `autorun` tick'i: faqat nashr task'lari, **ketma-ket** (3 tadan batch), scraping job'lari bu bosqichda olinmaydi.
  Job postni rejalashtirgan foydalanuvchi nomidan chop etadi (`scheduled → published`, `publishedAt` — haqiqiy
  vaqt); keyin Telegram/IndexNow/Make job'lari o'sha chaqiruvning keyingi batch'ida bajariladi, sayt keshi
  (`revalidateTag`) — darhol. Audit: `publish`, `channel = job`.
- **Telegram / Make / IndexNow — bir martadan:** job'larni post hook'lari publish **tranzaksiyasida** qo'yadi
  (publish yiqilsa — job'lar ham qaytariladi). Make: (post, yozuv) uchun `social-deliveries` da `sent` bo'lsa yoki
  tugallanmagan `make.webhook` bo'lsa — yangisi qo'yilmaydi, faqat **birinchi** chop etishda; Telegram: kanal
  bo'yicha `posts.telegram[]` holati va tugallanmagan job tekshiruvi; IndexNow: ommaviy URL o'zgargandagina. MCP
  orqali rejalashtirilgan postlar ham xuddi shu yo'ldan o'tadi (`req.user` siz qayta qo'yilgan job ham).
- **Kechikish:** pg_cron `*/10` (`blog-odya-jobs-publish`) — post belgilangan vaqtdan **0–10 daqiqa** keyin chiqadi.
  Bir vaqtda ko'p post (masalan, 9 ta) — bitta tick'da ketma-ket chiqadi (har biri ~1–2 s); deadline (35 s) yetmasa —
  qolgani keyingi tick'da. Aniqroq kerak bo'lsa — `cron.sql` dagi nashr jadvalini `*/5` ga o'zgartirib, SQL'ni
  Supabase'da qayta bajaring (bo'sh nashr chaqiruvi arzon: bir necha so'rov; scraping'ga ta'sir qilmaydi).
- **Xavfsizlik to'ri:** Payload task'ida retry yo'q — har chaqiruv boshida (`ensureScheduledPublishJobs`,
  `apps/web/src/jobs/scheduledPublish.ts`) `scheduled` holatidagi, lekin bajarilishi mumkin bo'lgan job'i yo'q
  (xato bilan tugagan yoki "Schedule publish" oynasida o'chirilgan) postlar uchun job qayta qo'yiladi (vaqti o'tgan
  bo'lsa — shu chaqiruvda bajariladi; tizim nomidan). Javobda `scheduledPublish: { queued, failed }`. 3 ta xatoli
  urinishdan keyin qayta qo'yilmaydi: log'da `error` va Sentry (bir marta) — admin'da post'ni oching, xatoni
  `payload-jobs` da ko'ring (`taskSlug = schedulePublish`), vaqtni o'zgartiring (eski xatoli job'lar o'chadi) yoki
  qo'lda **Publish** qiling.
- **Bekor qilish:** holatni **Tekshiruvda** ga qaytaring (MCP — `cancel_schedule`). Faqat "Schedule publish"
  oynasidagi job'ni o'chirish yetarli emas — post `scheduled` da qolsa, scheduler job'ni qayta qo'yadi.
- **Payload'ning "Schedule publish" oynasi** (Publish tugmasi menyusi) holatni o'zgartirmaydi: `review` dagi post
  uchun ishlaydi (vaqtida `published`), `draft`/`in_progress` dagisi uchun job vaqtida workflow xatosi bilan tugaydi.
  Tavsiya — holat + vaqt maydonlari.

## Zaxira: GitHub Actions

`.github/workflows/jobs-fallback.yml` — `workflow_dispatch` (Actions → Jobs fallback → Run workflow; `mode`:
`all` | `publish` | `scrape`). Repo secrets: `JOBS_RUN_URL` (`?mode=` siz), `JOBS_SECRET`.

Avtomatik (har 30 daqiqa) ishlatish uchun faylda `schedule` blokini izohdan chiqaring (`mode=all` — avval nashr, keyin scraping). Yopiq repo'da bepul daqiqalar (~2 000/oy) tez tugaydi — faqat pg_cron ishlamay qolgan davrda yoqing.

## To'xtatish

```sql
select cron.unschedule(jobname) from cron.job
  where jobname in ('blog-odya-jobs-publish', 'blog-odya-jobs-scrape');
```

Faqat yangiliklarni to'xtatish: `select cron.unschedule('blog-odya-jobs-scrape');` yoki admin → Scraping sozlamalari → "Yig'ish yoqilgan" ni o'chiring (yangi feed.poll navbatga qo'yilmaydi). Nashr (`blog-odya-jobs-publish`) ishlashda davom etadi.
