# Runbook: xavfsizlik, monitoring va analitika (OBLOG-23)

TZ §9.2, §9.4, §9.5, §3.7.2. Kod: `apps/web/src/config/security-headers.ts`, `apps/web/src/lib/health.ts`
(`/api/health`), `apps/web/src/lib/sentry.ts` + `src/instrumentation*.ts` (Sentry),
`apps/web/src/site/analytics.ts` + `src/components/analytics/` (GA4, Metrica).

## 1. `/api/health` va UptimeRobot

`GET /api/health` (va `HEAD`) — DB'ga `select 1` (Payload pool orqali, umumiy timeout 8 s) + versiya:

```json
{ "status": "ok", "db": "ok", "dbLatencyMs": 3, "version": "0.1.0+abc1234", "time": "2026-09-27T10:00:00.000Z" }
```

- `200` — ilova va DB ishlayapti; `503` — DB javob bermayapti (Supabase pauza, uzilish, timeout):
  `{"status":"error","db":"error","error":"ECONNREFUSED" | "timeout" | …}` (xato kodi, sirlar/host yo'q).
- `version` — `apps/web/package.json` versiyasi + `VERCEL_GIT_COMMIT_SHA` (7 belgi); `Cache-Control: no-store`.
- Har so'rov DB'ga tegadi — Supabase Free loyihasi "faol" qoladi (7 kunlik pauza, TZ §3.7.2).

**UptimeRobot (bepul) sozlash** (egasi):

| Monitor | Turi | URL | Interval | Izoh |
|---|---|---|---|---|
| Sayt | HTTP(s) | `https://blog.odya.uz/` | 5 daq | |
| Health | HTTP(s) | `https://blog.odya.uz/api/health` | 5 daq | `503` → DOWN. Ixtiyoriy: *Keyword* monitori, kalit so'z `"db":"ok"` |
| MCP | HTTP(s) | `https://blog.odya.uz/api/mcp` | 5 daq | `GET` — 200 (TZ §9.4) |

Alert contacts: email + Telegram (UptimeRobot → *Integrations* → Telegram). Health DOWN bo'lsa:
Supabase Dashboard'da loyiha holati (Paused → *Restore*), keyin Vercel Logs.

## 2. Sentry

Production'da yoqilgan va tekshirilgan — [Production holati](#production-holati-2026-10-05-oblog-58).
Yoqish — Vercel Environment Variables (Production; xohlasangiz Preview):

| O'zgaruvchi | Qayerda | Nima uchun |
|---|---|---|
| `SENTRY_DSN` | runtime + build | server xatolari; brauzer ham shuni oladi (build vaqtida bundle'ga) |
| `NEXT_PUBLIC_SENTRY_DSN` | build (ixtiyoriy) | brauzer uchun alohida DSN kerak bo'lsa |
| `SENTRY_AUTH_TOKEN` | build | source map'larni yuklash (token scope: `project:releases`, `org:read`) |
| `SENTRY_ORG`, `SENTRY_PROJECT` | build | source map yuklash uchun slug'lar |

DSN bo'lmasa Sentry butunlay o'chiq (SDK ishga tushmaydi, `withSentryConfig` ulanmaydi — build avvalgidek).
DSN o'zgarsa — **qayta deploy** (brauzer DSN'i va CSP build vaqtida yoziladi).

Nima yuboriladi (faqat xatolar, tracing o'chiq, `sendDefaultPii: false`):

- **server:** Server Component / route handler / Server Action xatolari (`onRequestError`), Payload REST/GraphQL
  **5xx** xatolari (`hooks.afterError`; 4xx — yo'q), `/api/jobs/run` ichki xatosi;
- **jobs:** har bir task xatosi (`feed.poll`, `item.*`, `maintenance.cleanup`, `telegram.post`) — teg
  `job_task`, `job_queue`; retry'lar saqlanadi (xato qayta otiladi);
- **brauzer:** SDK faqat birinchi xato yuz berganda yuklanadi (oddiy sahifa ko'rishda Sentry kodi
  yuklanmaydi — JS byudjeti). Cheklov: xatodan oldingi breadcrumb'lar yo'q; `error.tsx` ushlagan
  render xatolari server tomonida yoziladi.

Source map'lar: `SENTRY_AUTH_TOKEN` bo'lsa build oxirida Sentry'ga yuklanadi (release = commit SHA) va
build papkasidan o'chiriladi.

**Qabul sinovi (sun'iy xato):**

```bash
curl -H "Authorization: Bearer $JOBS_SECRET" "https://blog.odya.uz/api/health?sentry-test=1"
# → {"ok":true,"sentry":"sent","eventId":"…"}  — Sentry → Issues'da
#   "Sentry sinov xatosi (OBLOG-23): GET /api/health?sentry-test=1" (teg source=health-sentry-test)
```

`401` — token noto'g'ri; `503` — `JOBS_SECRET` yoki `SENTRY_DSN` sozlanmagan.
Brauzer sinovi: sayt konsolida `setTimeout(() => { throw new Error('test') })` → bir necha soniyada Issues'da.

### Production holati (2026-10-05, OBLOG-58)

Sozlash (egasi): Sentry loyihasi yaratildi, region — DE (ingest `o4508244671463424.ingest.de.sentry.io`,
CSP `connect-src` da). Vercel Environment Variables — **Production + Preview**: `SENTRY_DSN`,
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (qiymatlar faqat Vercel'da). O'zgaruvchilardan keyin
qayta deploy qilindi (CSP va brauzer DSN'i build vaqtida hisoblanadi).

| # | Tekshiruv | Natija | Kim |
|---|---|---|---|
| 1 | Server xatosi: `GET /api/health?sentry-test=1` + `Authorization: Bearer $JOBS_SECRET` | event Sentry → Issues'da; kalitsiz — `401` | egasi |
| 2 | Brauzer xatosi: jonli saytda sun'iy xato (headless Chromium) | ingest'ga envelope — `200`, event id `ee7f7830a6e64ac88e2deb0da8c3b822`, CSP buzilishlari — 0 | agent |
| 3 | Source map'lar | stack trace'da asl `.ts`/`.tsx` fayllar | egasi |
| 4 | Alert rule "A new issue is created" | email + Telegram | egasi |
| 5 | Job xatolari (teglar `job_task`, `job_queue`) | OBLOG-23 unit/integration testlari bilan qoplangan; prod'da ataylab chaqirilmadi | — |

- **Sampling:** server va brauzerda `tracesSampleRate: 0` — faqat xatolar, performance trace'lar yo'q
  (Free plan kvotasiga mos); `sendDefaultPii: false`.
- **JS byudjeti:** brauzer SDK birinchi xatoda lazy yuklanadi — first-load JS'ga ta'sir yo'q (146 KB,
  OBLOG-69/68 da DSN'siz o'lchangan; DSN bilan ham SDK faqat xatoda yuklanadi).
- **Qayta sinash:** yuqoridagi "Qabul sinovi" (server — `curl`, brauzer — konsolda `throw`).
- **Source map'lar ishlamay qolsa** (stack trace'da minifikatsiyalangan `chunks/*.js`): Vercel build
  log'ida Sentry source map yuklash qadamini tekshiring (xato/ogohlantirish); `SENTRY_AUTH_TOKEN`
  muddati va scope'lari — `project:releases`, `org:read`; `SENTRY_ORG`/`SENTRY_PROJECT` slug'lari
  Sentry'dagi bilan bir xilmi. Tuzatgandan keyin — qayta deploy.

## 3. Security headers

`next.config.ts` → `headers()` (`src/config/security-headers.ts`), barcha javoblarga:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains` (preload — egasi alohida qaror qiladi);
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` — kamera, mikrofon, geolokatsiya, to'lov, USB va h.k. o'chiq
  (akselerometr/giroskop — faqat YouTube pleyeriga);
- `X-Powered-By` yo'q.

| | Sayt (barcha yo'llar) | Admin (`/admin`, `/api/graphql-playground`) |
|---|---|---|
| `X-Frame-Options` | `DENY` | `SAMEORIGIN` |
| `frame-ancestors` | `'none'` | `'self'` |
| `script-src` | `'self' 'unsafe-inline'` + GA4, Metrica, X, Telegram widget | `'self' 'unsafe-inline' 'unsafe-eval' blob:` + jsDelivr (Monaco) |
| `img-src` | `'self' data: blob:` + media domen, analitika pikselleri, YouTube/X/Telegram | `'self' data: blob: https:` |
| `connect-src` | `'self'` + media, GA4, Metrica, X syndication, Sentry | `'self'` + media, `S3_ENDPOINT`, `*.r2.cloudflarestorage.com` (clientUploads), Sentry |
| `frame-src` | YouTube (nocookie), X, `t.me`, Telegram, Metrica | `'self'` |

`'unsafe-inline'` skriptlar uchun kerak: Next.js RSC payload va tema skripti nonce'siz (nonce sahifalarni
dinamik qilib ISR keshini buzadi). Preview'da (`VERCEL_ENV=preview`) `vercel.live` qo'shiladi; HTTPS
saytda `upgrade-insecure-requests`. Qiymatlar **build vaqtida** hisoblanadi (`MEDIA_PUBLIC_URL`,
`S3_ENDPOINT`, `SENTRY_DSN`) — o'zgarsa qayta deploy.

**Yangi tashqi manba** (embed, skript, rasm domeni) qo'shilsa — `security-headers.ts` dagi ro'yxatga
qo'shing, aks holda brauzer bloklaydi (konsolda `Refused to …`). Tekshiruv: `tests/security-headers.test.ts`,
`e2e/security.spec.ts` (CSP buzilishlari), <https://securityheaders.com> (maqsad — kamida **A**).

## 4. Admin kirish xavfsizligi

- 5 ta noto'g'ri paroldan keyin akkaunt **15 daqiqa** bloklanadi (`maxLoginAttempts: 5`, `lockTime`).
  Admin'da: Foydalanuvchilar → foydalanuvchi → *Qulfni ochish* (faqat admin).
- Parol: kamida 12 belgi, kichik va katta harf, raqam; email yoki uning `@` gacha qismi bo'lmasin
  (`apps/web/src/auth/password-policy.ts`, yaratish/yangilashda). Eski parollar kirishda tekshirilmaydi —
  keyingi o'zgartirishda qoidaga tushadi.

## 5. Analitika (GA4, Yandex Metrica)

- ID'lar: admin → **Sayt sozlamalari** → *Analitika va veb-master*: `GA4 Measurement ID` (`G-XXXXXXX`),
  `Yandex Metrica ID` (raqam). Noto'g'ri formatdagi qiymat e'tiborsiz qoldiriladi (analitika o'chiq).
  Ikkalasi ham bo'sh — hech narsa chizilmaydi va analitika JS chunk'i yuklanmaydi.
- **Cookie banner yo'q** (egasi qarori, OBLOG-60): GA4 va Metrica har bir tashrifchida, rozilik
  so'ralmasdan yuklanadi (banner bor paytda rozilik bermaganlar statistikaga tushmasdi). Maxfiylik
  siyosatida (`packages/guidelines/legal/maxfiylik-siyosati.md`, 2-bo'lim) buni va qanday o'chirish
  mumkinligini yozganmiz. GA4 consent mode (`denied` default'lar) ishlatilmaydi — oddiy `config`.
- Skriptlar `<script async>` bilan, `load` hodisasidan keyin brauzer bo'sh vaqtida
  (`requestIdleCallback`) yuklanadi — LCP/TBT'ga ta'sir qilmaydi (`next/script` emas — uning runtime'i
  JS byudjetiga sig'masdi). Qayta render/remount'da ikki marta init/yuklash yo'q.
- Metrica: `clickmap`, `trackLinks`, `accurateTrackBounce` (webvisor yoqilmagan).
- Segmentatsiya: GA4 `content_group` va Metrica `params.content_group` = `latn` (`/…`) yoki `cyrl` (`/kr/…`).
  GA4: *Explore* → dimension *Content group*; Metrica: *Parametry vizitov* → `content_group`.
- Client navigatsiya: GA4 — *Enhanced measurement → Page changes based on browser history events* (yoqilgan
  bo'lishi kerak, standart), Metrica — `hit` kod orqali.

## 6. Bog'liqliklar auditi

CI (`.github/workflows/ci.yml`, "Audit" qadami): `pnpm audit --prod --audit-level high` — production
bog'liqliklarida **high/critical** zaiflik bo'lsa CI yiqiladi (low/moderate — faqat hisobotda).
Lokal: `pnpm audit --prod`. Tuzatish: paketni yangilash; tranzitiv bo'lsa — `pnpm.overrides`
(sababi bilan izoh).
