# Runbook: fon vazifalar scheduler'i (pg_cron → `/api/jobs/run`)

TZ §3.5, §3.7.1, §3.7.2. Kod: `apps/web/src/jobs/`, endpoint: `apps/web/src/app/(payload)/api/jobs/run/route.ts`, SQL: `infra/supabase/cron.sql`, zaxira: `.github/workflows/jobs-fallback.yml`.

## Qanday ishlaydi

```
Supabase pg_cron (*/10) ──pg_net──▶ POST https://blog.odya.uz/api/jobs/run  (Bearer JOBS_SECRET)
                                          │
                                          ├─ processing'da qolib ketgan job'larni bo'shatish (> 5 daqiqa)
                                          ├─ muddati kelgan manbalar uchun feed.poll navbatga (pollIntervalMin)
                                          ├─ maintenance.cleanup — kuniga 1 marta (Toshkent kuni, idempotent)
                                          ├─ payload.jobs.run({ limit }) batch'lari — ichki deadline ≈ 40 s gacha
                                          │    navbatlar: default (feed.poll, maintenance.cleanup) →
                                          │    scrape (scrapeItem: item.fetch → item.extract → item.dedupe → item.classify)
                                          └─ ogohlantirishlar tekshiruvi (chaqiruv boshidan ≤ 55 s bo'lsa)
```

- `scrape` navbati (M2-02) faqat `S3_RAW_BUCKET` sozlangan bo'lsa ishga tushadi (raw/clean HTML gzip arxivi —
  DB'ga HTML yozilmaydi). Sozlanmagan bo'lsa `scrapeItem` job'lari kutib turadi, elementlar `Navbatda` holatida qoladi.

- Javob (JSON): `enqueued`, `cleanupEnqueued`, `alerts: { active, sent, logged, failed }`, `batches`, `done: { succeeded, failed }`, `remaining`, `deadlineReached`, `durationMs`.
- `401` — token noto'g'ri/yo'q; `503` — serverda `JOBS_SECRET` sozlanmagan (endpoint yopiq).
- `?limit=N` (1–50) — batch hajmini vaqtincha o'zgartirish; default — admin → Scraping sozlamalari → `jobsBatchLimit`.
- Vaqt: yangi batch faqat `jobsDeadlineSec` (default 40, max 45 s) gacha boshlanadi, boshlangan task'lar +10 s ichida tugaydi, `maxDuration = 60`.
- `JOBS_MODE=autorun` (Contabo worker) — Payload har daqiqada o'zi ishga tushiradi; pg_cron o'chiriladi.

## Birinchi sozlash (egasi, production)

1. **Sir yaratish:** `openssl rand -hex 32`.
2. **Vercel** → Project → Settings → Environment Variables → **Production**: `JOBS_SECRET=<sir>` (`JOBS_MODE` — `endpoint` yoki bo'sh), `S3_RAW_BUCKET=blog-odya-raw` (yopiq R2 bucket, ommaviy domensiz; Lifecycle rule — 30 kundan keyin o'chirish; R2 tokeni shu bucket'ga yozish/o'qish huquqi bilan). Preview scope'ga qo'ymang. Redeploy.
3. **Tekshiruv (qo'lda):**
   ```bash
   curl -sS -X POST -H "Authorization: Bearer <sir>" https://blog.odya.uz/api/jobs/run
   # → {"ok":true,"enqueued":6,...}
   curl -sS -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer wrong" https://blog.odya.uz/api/jobs/run
   # → 401
   ```
   Manbalar bazada bo'lishi kerak: `pnpm seed` (production'da — lokal mashinadan `DATABASE_URL_DIRECT` bilan, yoki admin'dan qo'lda).
4. **Supabase** → SQL Editor:
   1. `infra/supabase/cron.sql` boshidagi **1-qadam** — Vault'ga URL va sirni qo'shing (qiymatlarni faqat SQL Editor'da yozing, repo'ga emas).
   2. `infra/supabase/cron.sql` ni to'liq ishga tushiring (Database → Extensions'da `pg_cron` va `pg_net` avtomatik yoqiladi).
5. **10–20 daqiqadan keyin tekshiring:**
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
| `status_code` bo'sh, `error_msg` = timeout | Endpoint 65 s da javob bermadi — Vercel Logs'da function timeout'ni tekshiring; `jobsDeadlineSec` ni kamaytiring |
| `deadlineReached: true`, `remaining` o'sib bormoqda | Navbat to'planmoqda — `jobsBatchLimit` ni oshiring yoki zaxira workflow'ni vaqtincha yoqing |
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
