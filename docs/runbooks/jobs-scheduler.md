# Runbook: fon vazifalar scheduler'i (pg_cron → `/api/jobs/run`)

TZ §3.5, §3.7.1, §3.7.2. Kod: `apps/web/src/jobs/`, endpoint: `apps/web/src/app/(payload)/api/jobs/run/route.ts`, SQL: `infra/supabase/cron.sql`, zaxira: `.github/workflows/jobs-fallback.yml`.

## Qanday ishlaydi

```
Supabase pg_cron (*/10) ──pg_net──▶ POST https://blog.odya.uz/api/jobs/run  (Bearer JOBS_SECRET)
                                          │
                                          │  (hamma vaqt chegaralari SO'ROV BOSHIDAN — Payload init/sovuq start ham kiradi)
                                          ├─ processing'da qolib ketgan job'larni bo'shatish (> 5 daqiqa, bitta UPDATE)
                                          ├─ muddati kelgan manbalar uchun feed.poll navbatga (pollIntervalMin)
                                          ├─ maintenance.cleanup — kuniga 1 marta (Toshkent kuni, idempotent)
                                          │    (bu ikkisi deadline allaqachon o'tgan bo'lsa — keyingi tick'ga, `skipped`)
                                          ├─ payload.jobs.run({ limit ≤ 2 }) batch'lari — yangi batch ≤ 35 s gacha
                                          │    navbatlar: default (feed.poll, maintenance.cleanup) →
                                          │    scrape (scrapeItem: item.fetch → item.extract → item.dedupe → item.classify)
                                          │    boshlangan task'lar ≤ 45 s gacha tugaydi (scrapeItem vaqt yetmasa — `resume`)
                                          └─ ogohlantirishlar tekshiruvi (so'rov boshidan ≤ 50 s bo'lsa)
```

- `scrape` navbati (M2-02) faqat `S3_RAW_BUCKET` sozlangan bo'lsa ishga tushadi (raw/clean HTML gzip arxivi —
  DB'ga HTML yozilmaydi). Sozlanmagan bo'lsa `scrapeItem` job'lari kutib turadi, elementlar `Navbatda` holatida qoladi.

- Javob (JSON): `enqueued`, `cleanupEnqueued`, `alerts: { active, sent, logged, failed }`, `batches`, `done: { succeeded, failed }`, `remaining`, `deadlineReached`, `skipped` (vaqt yetmay o'tkazib yuborilgan qadamlar: `feedPolls`, `cleanup`, `alerts`), `limit`, `deadlineSec` (amaldagi), `durationMs`.
- `401` — token noto'g'ri/yo'q; `503` — serverda `JOBS_SECRET` sozlanmagan (endpoint yopiq).
- `?limit=N` (1–50) — batch hajmini vaqtincha o'zgartirish; default — admin → Scraping sozlamalari → `jobsBatchLimit`.
  **Amalda ≤ 2** (`JOBS_CONCURRENCY`): Payload batch'dagi job'larni parallel bajaradi, DB pool esa 3 ulanish
  (bittasi doimiy band) — ko'proq parallel job ulanish kutib `timeout exceeded when trying to connect` beradi.
  `1` — to'liq ketma-ket.
- **Vaqt byudjeti** (`apps/web/src/jobs/constants.ts`, so'rov boshidan): yangi batch ≤ `min(jobsDeadlineSec, 35)` s
  (`jobsDeadlineSec` default 40 → amalda 35); boshlangan task'lar + 10 s grace (≤ 45 s); `countRemainingJobs` +
  ogohlantirishlar ≤ 50 s; qolgan ~10 s — handler'gacha bo'lgan sovuq start va javob uchun zaxira, `maxDuration = 60`.
  `scrapeItem` har bosqich (extract, dedupe, classify) oldidan run deadline'igacha ≥ 5 s qolganini tekshiradi;
  qolmasa — bajarilgan bosqichlar natijasi (`input.resume`) bilan yangi job navbatga qo'yiladi (joriy job
  muvaffaqiyatli tugaydi, retry sarflanmaydi, sahifa qayta yuklanmaydi).
- `JOBS_MODE=autorun` (Contabo worker) — Payload har daqiqada o'zi ishga tushiradi; pg_cron o'chiriladi.

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
   # → {"ok":true,"enqueued":6,...}
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
6. **10–20 daqiqadan keyin tekshiring:**
   ```sql
   select status, return_message, start_time from cron.job_run_details
     where jobid = (select jobid from cron.job where jobname = 'blog-odya-jobs-run')
     order by start_time desc limit 5;
   select status_code, left(content, 300), error_msg, created
     from net._http_response order by created desc limit 5;
   ```
   Vercel → Project → Logs: `POST /api/jobs/run` har 10 daqiqada, `200`. Admin → Scraping → Yig'ilgan elementlar — yangi yozuvlar (`Navbatda` holati).

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
| Vercel Logs: `504`, `FUNCTION_INVOCATION_TIMEOUT` / `Task timed out after 60 seconds` | 1) **Region**: log qatoridagi function region Supabase regioniga mos emas (`iad1` ↔ `ap-south-1`) — har so'rov ~200 ms, sovuq start + pre-step'larning o'zi o'nlab soniya. `apps/web/vercel.json` → `regions: ["bom1"]`, redeploy (yuqoridagi 2-qadam). 2) **Pool**: logda `timeout exceeded when trying to connect` / `cannot begin transaction` — parallel job'lar 3 ulanishli pool'ni to'sgan; batch ≤ 2 (`JOBS_CONCURRENCY`), `RUNTIME_POOL_MAX` ni oshirmang (Supavisor limiti). 3) Byudjet so'rov boshidan hisoblanadi (≤ 35 + 10 + 5 s) — agar baribir 60 s oshsa, javobdagi `durationMs` va logdagi bosqich vaqtlarini solishtiring; `jobsDeadlineSec` ni kamaytirish mumkin |
| Log: `DeprecationWarning: Calling client.query() when the client is already executing a query` | Bitta tranzaksiya ulanishida parallel so'rovlar — Payload'ning bulk `payload.update/delete` (`where` bilan) hujjatlarni `Promise.all` bilan yangilaydi. Jobs kodida bunday chaqiruv yo'q (`releaseStaleJobs` — bitta SQL `UPDATE`); yangi kod bulk update/delete'ni tranzaksiya ichida ishlatmasin |
| Javobda `skipped: ["feedPolls", "cleanup"]`, `batches: 0` | Pre-step'lar (sovuq start, Payload init) ichki deadline'ni (35 s) yeb qo'ygan — navbatga qo'yish keyingi tick'da. Doimiy bo'lsa — region/DB kechikishini tekshiring |
| `scrapeItem` job'i `input.resume` bilan | Normal: oldingi chaqiruvda vaqt yetmay qolgan, keyingi chaqiruvda qolgan bosqichlardan davom etadi (retry emas) |
| `deadlineReached: true`, `remaining` o'sib bormoqda | Navbat to'planmoqda — region/pool muammosini tekshiring (yuqorida); zaxira workflow'ni vaqtincha yoqing. `jobsBatchLimit` ni oshirish yordam bermaydi (parallel ≤ 2) |
| Manba `stats.consecutiveFailures` o'smoqda | Feed xatosi (`feeds[].lastError`, `lastStatus`) — admin → Manbalar; 403/Cloudflare bo'lsa manbani o'chirib turing |
| Hech narsa navbatga qo'yilmaydi (`enqueued: 0`) | Scraping sozlamalari → "Yig'ish yoqilgan" o'chiq, yoki feed'lar `pollIntervalMin` dan erta |

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
  `pg_database_size` va R2 hajmi (media + arxiv bucket, `ListObjectsV2`, ≤ 12 s) → Scraping sozlamalari → Statistika.
- **Ogohlantirishlar** — Telegram: `TELEGRAM_BOT_TOKEN` + chat (`telegram-settings.alertChatId`, bo'lmasa
  `TELEGRAM_ALERT_CHAT_ID`); sozlanmagan bo'lsa faqat log (`ALERT: ...`). Shartlar: manba feed'i ketma-ket ≥ 3 xato;
  manbaning 24 soatlik yig'ish muvaffaqiyati < 80% (≥ 5 element); DB ≥ 350 MB (70%); R2 ≥ 8 GB. Bir shart —
  24 soatda bir marta (holat `stats.alerts` da), hal bo'lsa keyingi safar darhol.
- **Sozlash (egasi):** bot'ni admin guruhiga qo'shing, guruh chat ID'sini (`-100…`) Vercel `TELEGRAM_ALERT_CHAT_ID`
  yoki admin → Telegram sozlamalari → "Admin ogohlantirish guruhi" ga yozing; `TELEGRAM_BOT_TOKEN` — Vercel env.
- **Kunlik tozalashni qayta ishga tushirish:** Scraping sozlamalari statistikasidagi `cleanup.enqueuedDate` bugungi
  sana bo'lsa, ertaga ishlaydi; darhol kerak bo'lsa SQL: `update scraping_settings set stats = stats #- '{cleanup,enqueuedDate}';`
  va `/api/jobs/run` ni chaqiring.

## Zaxira: GitHub Actions

`.github/workflows/jobs-fallback.yml` — `workflow_dispatch` (Actions → Jobs fallback → Run workflow). Repo secrets: `JOBS_RUN_URL`, `JOBS_SECRET`.

Avtomatik (har 30 daqiqa) ishlatish uchun faylda `schedule` blokini izohdan chiqaring. Yopiq repo'da bepul daqiqalar (~2 000/oy) tez tugaydi — faqat pg_cron ishlamay qolgan davrda yoqing.

## To'xtatish

```sql
select cron.unschedule('blog-odya-jobs-run');
```

Yoki admin → Scraping sozlamalari → "Yig'ish yoqilgan" ni o'chiring (endpoint ishlashda davom etadi — scheduled publish kabi boshqa job'lar bajariladi, lekin yangi feed.poll navbatga qo'yilmaydi).
