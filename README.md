# Blog Odya — Yangiliklar O'zbek tilida

**https://blog.odya.uz** — AI, IT, texnologiya va kibersport yangiliklarini o'zbek tilida, **lotin va kirill** yozuvlarida chop etadigan onlayn nashr (OBLOG loyihasi).

Tizim jahon yetakchi IT-nashrlaridan (The Verge, TechCrunch, Habr, iXBT, Dexerto/HLTV) yangiliklarni har kuni yig'adi va to'liq manba nusxasini saqlaydi. Material o'zbek tilida SEO uchun qayta yoziladi: buni Claude agent MCP server orqali (Claude obunasi bilan) yoki editor qo'lda bajaradi. Admin yoki editor tekshirib chop etadi. Kirill versiyasi lotindan avtomatik tayyorlanadi. Post lotin va kirill Telegram kanallariga avtomatik yuboriladi.

**Stek:** Next.js (App Router) · Payload CMS 3 · PostgreSQL (Supabase) · Cloudflare R2 · Payload Jobs + Supabase `pg_cron` · MCP server · Telegram Bot API · Vercel.
**MVP hosting:** bepul tariflar (Vercel Hobby, Supabase Free, Cloudflare R2), keyin Vercel Pro yoki Contabo.

## Hujjatlar

| Hujjat                                 | Mazmuni                                                                                                                                                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/TZ.md](docs/TZ.md)               | Texnik vazifa (v1.2): maqsad, KPI, manbalar va mualliflik huquqi, arxitektura, lotin/kirill, bepul hosting va limitlar, workflow, MCP, Telegram, SEO, nofunksional talablar, ma'lumotlar modeli, kategoriyalar, dizayn yo'nalishi |
| [docs/PLAN.md](docs/PLAN.md)           | Amalga oshirish rejasi: MVP (M0–M3, ~6 hafta) → o'sish bosqichlari, xavflar                                                                                                                                                       |
| [docs/TASKS.md](docs/TASKS.md)         | MVP'ning 25 ta vazifasi: bog'liqlik tartibida, rol, ijrochi (agent / egasi), qabul qilish mezonlari                                                                                                                               |
| [docs/QUESTIONS.md](docs/QUESTIONS.md) | Barcha savollar bo'yicha qarorlar, kamchiliklar holati, takliflar                                                                                                                                                                 |

## Repozitoriy tuzilmasi

```
apps/web/             Next.js (App Router) + Payload CMS 3: sayt, /admin, REST/GraphQL API
  src/env.ts          Env sxemasi (Zod) — barcha o'zgaruvchilar shu yerda tekshiriladi
  src/payload.config.ts
  src/config/         DB (pooler/direct) va S3 (MinIO/R2) sozlamalari
  src/access/         Rollar va access helper'lar (isAdmin, isAdminOrEditor)
  src/collections/    Kolleksiyalar: posts (workflow — Posts/workflow.ts), pages, categories, tags, authors, media, users
  src/globals/        site-settings, header, footer, telegram-settings, scraping-settings
  src/seed/           `pnpm seed` — kategoriyalar, huquqiy sahifalar, muallif, demo postlar, sozlamalar
  src/app/(frontend)/ Ommaviy sayt: `(latn)/` — lotin (ildiz), `kr/` — kirill; ko'rinishlar — `src/site/views/`
  src/site/           Sayt ma'lumotlari (Local API + ISR teglari), URL sxemasi, Payload → UI mapper'lar
  e2e/                Playwright smoke testlari (`pnpm test:e2e`)
  src/i18n/uz.ts      Admin panel o'zbekcha tarjimasi
  src/migrations/     Payload migratsiyalari (commit qilinadi)
  .env.example        Env namunasi (izohlar bilan)
packages/shared/      Umumiy kod: locale'lar, keyinchalik slugify-uz, translit
packages/guidelines/  Tahririyat ko'rsatmalari (MCP prompt/resource)
infra/docker-compose.dev.yml   Lokal Postgres 16 + MinIO
infra/backup/                  DB backup (pg_dump | gzip | age) va tiklash skriptlari
.github/workflows/ci.yml       CI: lint → typecheck → test → seed → build → e2e
.github/workflows/backup.yml   Kunlik prod DB backup → R2 (docs/runbooks/restore.md)
```

## Lokal ishga tushirish

**Talablar:** Node.js 24 (`.nvmrc`), pnpm 11 (`corepack enable` yoki `npm i -g pnpm@11`), Docker.

1. Bog'liqliklarni o'rnatish:

   ```bash
   pnpm i
   ```

2. Env faylini yaratish (standart qiymatlar lokal Docker bilan ishlaydi, o'zgartirish shart emas):

   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

3. Postgres va MinIO'ni ishga tushirish (init konteyner `media`, `raw`, `backups` bucketlarini yaratadi):

   ```bash
   docker compose -f infra/docker-compose.dev.yml up -d
   ```

   | Servis        | Manzil                                                 |
   | ------------- | ------------------------------------------------------ |
   | Postgres      | `localhost:5442` (postgres / postgres, DB `blog_odya`) |
   | MinIO S3 API  | `http://localhost:9010`                                |
   | MinIO konsoli | `http://localhost:9011` (minioadmin / minioadmin)      |

   Portlar band bo'lsa: `BLOG_ODYA_PG_PORT`, `BLOG_ODYA_MINIO_PORT`, `BLOG_ODYA_MINIO_CONSOLE_PORT` env'lari bilan o'zgartiring va `apps/web/.env` dagi URL'larni moslang.

4. Dev serverni ishga tushirish (avval migratsiyalar avtomatik qo'llanadi):

   ```bash
   pnpm dev
   ```

5. http://localhost:3000/admin ni oching va birinchi foydalanuvchini yarating — u avtomatik **admin** bo'ladi. Keyingi foydalanuvchilarni (admin yoki editor) faqat admin yaratadi. Admin panel tili — o'zbekcha (lotin).

To'xtatish: `Ctrl+C`, keyin `docker compose -f infra/docker-compose.dev.yml down` (ma'lumotlarni ham o'chirish uchun — `down -v`).

### Buyruqlar

| Buyruq                              | Vazifasi                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`                          | Migratsiyalar + Next.js dev server                                        |
| `pnpm build`                        | Production build                                                          |
| `pnpm lint`                         | ESLint (barcha paketlar)                                                  |
| `pnpm typecheck`                    | TypeScript tekshiruvi                                                     |
| `pnpm test`                         | Vitest: unit + integratsion (Postgres va MinIO ishlab turishi kerak)      |
| `pnpm format` / `format:check`      | Prettier                                                                  |
| `pnpm migrate`                      | Payload migratsiyalarini qo'llash (`DATABASE_URL_DIRECT` orqali)          |
| `pnpm migrate:create <nom>`         | Sxema o'zgarganda yangi migratsiya yaratish (faylni commit qiling)        |
| `pnpm seed`                         | Migratsiyalar + boshlang'ich ma'lumotlar (takror ishga tushirish xavfsiz) |
| `pnpm test:e2e`                     | Playwright smoke (avval `pnpm seed` va `pnpm build`; `next start` o'zi)   |
| `pnpm --filter @blog-odya/web lhci` | Lighthouse CI lokal (avval `pnpm seed` va `pnpm build`; port 3100)        |

### Muhim eslatmalar

- **Sxema faqat migratsiyalar orqali o'zgaradi** — dev'da ham Payload `push` o'chiq. Kolleksiya o'zgargach: `pnpm migrate:create <nom>` → `pnpm migrate`.
- **Env:** sxema — `apps/web/src/env.schema.ts`. Runtime'da (`next dev`/`start`, Vercel funksiyalari, testlar) to'liq tekshiriladi, majburiy qiymat bo'lmasa ilova ishga tushmaydi. Migratsiyada (`pnpm migrate*`, `PAYLOAD_MIGRATING=true`) faqat DB majburiy — `PAYLOAD_SECRET` va `S3_*` ixtiyoriy. `next build` paytida DB/sirlar majburiy emas (build ularga ulanmaydi) — `pnpm build` env'siz ham o'tadi; berilgan qiymatlar formati baribir tekshiriladi. Turbo strict env mode: yangi env qo'shsangiz, `turbo.json` → `globalPassThroughEnv` ga ham qo'shing.
- **Sirlar** (`.env`) repo'ga commit qilinmaydi — production qiymatlari Vercel Environment Variables (**faqat Production** scope) va GitHub secrets'da. Staging yo'q; Vercel Preview'da migratsiya taqiqlangan (`apps/web/src/config/database.ts`).
- Lokal MinIO va production Cloudflare R2 o'rtasidagi farq faqat `S3_*` va `MEDIA_PUBLIC_URL` qiymatlarida. Admin'dan rasm yuklash `clientUploads` bilan to'g'ridan-to'g'ri bucket'ga boradi — R2 bucket'da CORS kerak: [docs/runbooks/r2-cors.md](docs/runbooks/r2-cors.md).
- **Postgres:** runtime — `DATABASE_URL` (Supabase: transaction pooler, `pool.max = 3`), migratsiyalar — `DATABASE_URL_DIRECT` (Supabase: **session** pooler, port 5432 — direct host faqat IPv6). Sozlama: `apps/web/src/config/database.ts`.
- **Vercel function region = Supabase region:** Supabase `ap-south-1` (Mumbai) → Vercel `bom1` — `apps/web/vercel.json` (`"regions": ["bom1"]`; Vercel project Root Directory — `apps/web`). Region'lar farq qilsa har SQL so'rovi ~200+ ms: `/api/jobs/run` 60 s limitga sig'may `504` bergan (OBLOG-33). Supabase regioni o'zgarsa, `vercel.json` ni ham yangilang. Batafsil — [`docs/runbooks/jobs-scheduler.md`](docs/runbooks/jobs-scheduler.md).
- **Scheduler kadensi (OBLOG-110):** pg_cron (`infra/supabase/cron.sql`) — har 10 daqiqada `POST /api/jobs/run?mode=publish` (faqat nashr: rejalashtirilgan postlar → Telegram, Make, IndexNow; ketma-ket), har 30 daqiqada (:05, :35) `?mode=scrape` (yangiliklar, tozalash, ogohlantirishlar). `mode` siz — ikkalasi, avval nashr. `cron.sql` o'zgarsa — Supabase SQL Editor'da qayta ishga tushiring (idempotent). Post hook'larida Local API o'qishlari shu tranzaksiyada (`req`, `src/lib/hookReq.ts`) — aks holda parallel publish'lar 3 ulanishli pool'ni to'sib qo'yadi.
- **Rollar:** `admin`, `editor` (TZ §4.2); access helper'lar — `apps/web/src/access`. Sayt locale'lari: `uz-Latn` (asosiy), `uz-Cyrl` (`fallback: true`).
- **Seed:** `pnpm seed` — 9 kategoriya (`packages/shared/seed/categories.json`, ranglar — `design/brand/tokens.json`), 6 huquqiy sahifa (`packages/guidelines/legal/`), muallif, 3 teg, 3 demo post, `site-settings`/`header`/`footer`. Mavjud hujjatlar (slug bo'yicha) o'zgartirilmaydi. Huquqiy sahifalardagi `{{CONTACT_EMAIL}}` kabi o'rinbosarlar `SEED_<KEY>` env'dan olinadi (masalan, `SEED_CONTACT_EMAIL=...`), Telegram havolalari — `TELEGRAM_CHANNEL_LATN/CYRL` dan; berilmaganlari ro'yxati seed logida chiqadi. `SEED_DEMO=false` — demo kontentsiz (teglar, postlar, muqovalar yo'q); prod — `gh workflow run seed-prod` ("Prod seed").
- **Ommaviy sayt** (M1-05, OBLOG-81): lotin — `/`, `/{category}`, `/{category}/page/{n}`, `/{category}/{slug}`; kirill — xuddi shu `/kr` bilan (`<html lang>` mos). Umumiy catch-all marshrutlari (`src/site/route.ts`) `revalidate = 0` bilan har bir so'rovda HTML/RSC yaratadi; `next build` DB'ga ulanmaydi. **Bosh/kategoriya yangiliklari**, bosh sahifa bo'limlari, mavzulari va reytingi hamda kategoriya sahifalashi/yon paneli DB'dan yangi o'qiladi (`src/site/data.ts`); React `cache` faqat bitta renderdagi takroriy o'qishlarni birlashtiradi. Nashr keyingi so'rov yoki oddiy navigatsiyada ko'rinadi; ochiq sahifa uchun qayta yuklash/yangi navigatsiya kerak, back/forward oldingi ko'rinishni tiklashi mumkin. Maqola/teg/muallif/arxiv/statik sahifalarning ham HTML keshi yo'q, lekin ularning ma'lumotlari va menyu/SEO avvalgi `unstable_cache` teglari bilan keshlanadi (`src/site/cache-tags.ts`, `src/site/revalidate.ts`). Payload publish/unpublish/arxivlash hook'lari teglarni yangilaydi; tashqi SQL/CLI o'zgarishi bosh/kategoriya yangiliklarida keyingi so'rovda ko'rinadi, boshqa ma'lumot keshi esa muddatigacha qolishi mumkin (lokal'da keshni tozalash: `rm -rf apps/web/.next` va qayta build). Rasmlar: `next/image` custom loader (`src/lib/image-loader.ts`) — WebP variantlari to'g'ridan-to'g'ri `MEDIA_PUBLIC_URL` dan; `/_next/image` ishlatilmaydi.
- **Post workflow** (TZ §4.1): `draft → in_progress → review → scheduled/published → archived`, `rejected`. Qoidalar `apps/web/src/collections/Posts/workflow.ts` da, tekshiruv — `beforeChange` hook'da. Chop etish faqat `review`/`scheduled` dan admin'dagi **Publish** (API: `_status: 'published'`) orqali; holat avtomatik `published` bo'ladi. `in_progress` ga o'tganda post 2 soatga band qilinadi (boshqa editor o'zgartira olmaydi, admin — mumkin). Arxivlash — faqat admin. `scheduled` holatida `scheduledAt` vaqtiga `schedulePublish` job navbatga qo'yiladi (job'larni ishga tushirish — M2-01).

- **Qo'shimcha sahifalar** (M1-07): `/tag/{slug}`, `/author/{slug}` (`…/page/{n}` sahifalash), statik sahifalar `/{slug}` (`pages`), `/search?q=` (`noindex`), 404 — hammasi `/kr` bilan. Kategoriya va statik sahifa bitta `/{slug}` nomlar fazosida: bir-birining slug'ini va band marshrut nomlarini (`kr`, `tag`, `author`, `search`, `bot`, `page`, `og`, `feeds`… — `ROUTE_RESERVED_SLUGS`, `src/lib/slug.ts`; `app/` dagi har bir ildiz papka testda tekshiriladi) validatsiya rad etadi. Header/footer menyulari — `header`/`footer` globals'dan (kategoriya, sahifa, URL; `newTab`).
- **Qidiruv** (TZ §7, §8.1): Postgres FTS + `pg_trgm`, migratsiya `20260924_123153_m1_07_search` (qo'lda yozilgan SQL): `posts_locales.search_vector` (sarlavha A, lid B, Lexical matn C) va `search_title` (trigram, xato yozilgan so'zlar) — STORED generated ustunlar, GIN indekslar. Lotin va kirill bitta qidiruv kalitiga keltiriladi (`odya_search_normalize()` ↔ `src/site/search/normalize.ts`, test ikkisini solishtiradi): kirill so'rov lotin maqolani topadi va aksincha, `oʻ`/`o'`/`o‘`/`o’` bir xil. So'rov — parametrlar bilan, `tsquery` faqat `[a-z0-9]` so'zlardan; natijalar keshlanmaydi.
- **Lighthouse CI** (TZ §8.4): `apps/web/lighthouserc.cjs` — mobil Performance ≥ 90, SEO = 100, Accessibility ≥ 90, birinchi yuklash JS ≤ 150 KB gzip (bosh sahifa, maqola, kategoriya; 3 o'lchov, mediana). Bloklovchi o'lchov — `ci.yml` ("Lighthouse CI" qadami, shu build'ning `next start` + demo seed); Vercel Preview URL'iga qarshi — `.github/workflows/lighthouse-preview.yml` (`deployment_status`; preview ataylab `noindex`, shuning uchun faqat `is-crawlable` auditi o'tkaziladi). Preview "Vercel Authentication" bilan yopiq bo'lsa — repo secret **`VERCEL_AUTOMATION_BYPASS_SECRET`** (Vercel → Settings → Deployment Protection → Protection Bypass for Automation); u faqat `x-vercel-protection-bypass` sarlavhasi sifatida yuboriladi — `x-vercel-set-bypass-cookie` har sahifa oldidan 307 redirect'lar berib LCP'ni buzardi (OBLOG-113). Windows'da `lhci autorun` Chrome vaqtinchalik papkasini o'chira olmay yiqilishi mumkin — `lighthouserc.cjs` izohiga qarang. JS byudjeti uchinchi tomon skriptlarini ham sanaydi: GA4/Metrica/TopSayt birinchi faollikda yoki 5 s dan keyin yuklanadi (OBLOG-111, `apps/web/src/site/analytics.ts`), aks holda preview'da JS ~440 KB bo'ladi; Next/React freymvorkining o'zi ~145 KB — yangi client kod qo'shishda zaxira kichik.
- **Xavfsizlik va monitoring** (M3-02, OBLOG-23): security headers (CSP sayt/admin uchun alohida, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) — `apps/web/src/config/security-headers.ts`; admin: 5 xato urinish → 15 daqiqa blok, kuchli parol (≥ 12 belgi, katta/kichik harf, raqam). `GET /api/health` — DB `select 1` + versiya (200 / 503), UptimeRobot uchun. Sentry (`@sentry/nextjs`; production'da yoqilgan va tekshirilgan — OBLOG-58) — `SENTRY_DSN` bo'lsa: server, Payload 5xx, job task'lari, brauzer (SDK birinchi xatoda yuklanadi); sinov — `GET /api/health?sentry-test=1` + `Bearer JOBS_SECRET`. GA4 + Yandex Metrica — ID'lar `site-settings` da, har bir tashrifchida bannersiz yuklanadi (cookie banner yo'q — OBLOG-60; birinchi faollikda yoki 5 s dan keyin — OBLOG-111), `content_group` = `latn`/`cyrl`. CI: `pnpm audit --prod --audit-level high`. Qo'llanma — [`docs/runbooks/monitoring.md`](docs/runbooks/monitoring.md).
- **Google News / Discover va IndexNow** (OBLOG-57):
  - Indekslanadigan sahifalarda `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">` (`src/site/seo/metadata.ts` → `INDEXABLE_ROBOTS`); `noindex` sahifalar (qidiruv, < 3 postli teg, `meta.noindex`, preview) — `max-*` siz.
  - **Muallif:** `authors` bo'sh post yaratilganda (MCP `create_draft`, "Qoralamaga olish", admin) va chop etilganda standart muallif — "Blog Odya tahririyati" (`/author/tahririyat`, `src/collections/Posts/defaultAuthor.ts`) qo'yiladi; hujjat seed'da yaratiladi, yo'q bo'lsa hook o'zi yaratadi. Eski muallifsiz postlar saytda va JSON-LD'da runtime'da shu muallifni oladi — JSON-LD `author` doim `Person`.
  - **Rasm nisbatlari:** media variantlari `news16x9` (1200×675), `news4x3` (1200×900), `news1x1` (1200×1200) WebP, focal point bo'yicha — `NewsArticle.image` ga (faqat mavjudlari), OG — 1200×630. Mavjud rasmlar uchun bir martalik: `pnpm --filter @blog-odya/web media:regenerate` (`dry-run`, `limit=N`, `batch=N` argumentlari; idempotent, faqat yetishmayotgan variantlar, asl fayl o'zgarmaydi); prod — `gh workflow run media-regenerate` (R2 + Supabase). Har rasmga ~3 × 50–150 KB qo'shiladi (R2 bepul 10 GB).
  - **IndexNow** (Bing, Yandex, Seznam, Naver; Google qo'llamaydi): publish / unpublish / arxivlash / o'chirish / slug yoki kategoriya o'zgarishida lotin + `/kr` URL'lari `indexnow.submit` job'i bilan (`after()` — darhol) `https://api.indexnow.org/indexnow` ga (`src/indexnow`, `src/collections/Posts/indexnow.ts`). Kalit — env `INDEXNOW_KEY` (8–128 belgi, masalan `openssl rand -hex 16`, faqat Production), kalit fayli — `/{INDEXNOW_KEY}.txt`. Kalit yo'q — faqat warning; 429/5xx — 1/5/15 daqiqada qayta urinish, 400/403/422 — warning log.

- **Ijtimoiy tarmoqlar — Make.com avtopost** (OBLOG-91, `src/social/`): post birinchi marta chop etilganda `make.webhook` job'i (`after()` — darhol) Make "Custom webhook" iga JSON yuboradi — Instagram caption (sarlavha + 1–3 gap + "profildagi havola" + ≤ 15 lotin heshteg), JPEG rasm (`/og/{latn|cyrl}/social/{id}/{square|portrait|landscape}.jpg`), Facebook/Threads/X/LinkedIn matnlari. Idempotent (`social-deliveries`, post+yozuv bo'yicha bir marta), 429/5xx — 1/5/15 daqiqada qayta urinish, oxirida Telegram ogohlantirishi, imzo `X-Odya-Signature` (`MAKE_WEBHOOK_SECRET`). Sozlamalar — admin "Ijtimoiy tarmoqlar (Make)" (standart o'chiq), URL — u yerda yoki env `MAKE_WEBHOOK_URL`. Post panelida holat va "Sinov yuborish". Owner qo'llanmasi: [docs/runbooks/social-autopost-options.md](docs/runbooks/social-autopost-options.md#tanlov-make--ishga-tushirish-rejasi).

- **Kirill transliteratsiyasi: brendlar va nomlar** (OBLOG-67, `packages/shared/src/translit.ts`):
  - Lotinda qoladi: glossariy `doNotTransliterate` atamalari (seed + admin), 2–6 harfli katta harfli qisqartmalar (`GTA`, `ESLning` → `ESLнинг`), lotin nomlar ketma-ketligida ikki lotin soʻz orasidagilar (`Space Launch Complex 40`, `Windows Media Player Legacy`), qavs ichidagi asl yozilish (`Sem Altman (Sam Altman)`), postning `keepLatin` roʻyxati (MCP `save_rewrite(keepLatin)` yoki admin → Tahririyat) va brend teglar (`tags.doNotTransliterate` yoki kirill nomi = lotin nomi). Oʻzbekcha qisqartmalar (`AQSH`, `BMT`, `XKS`, `YaIM`…) — `translit-exceptions` (`whole_word`) orqali kirillga oʻgiriladi; yangi oʻzbekcha qisqartma lotinda qolsa — admin → Transliteratsiya istisnolari ga qoʻshing (kirill shakli katta harfda: `АҚШ`).
  - MCP `save_rewrite`/`preview_cyrillic` — `suspicious`: kirillga oʻgirilgan katta harfli soʻzlar (agent `keepLatin` bilan himoyalaydi).
  - **Mavjud postlar:** `pnpm --filter @blog-odya/web cyrl:resync` — chop etilgan postlar kirillini joriy qoidalar bilan qayta yaratish. Standart — dry-run (hisobot: `Фигуре → Figure`); `apply` — yozish; `ids=220,221`, `filter=ai` (faqat MCP/AI postlari), `limit=N`. Qoʻlda tuzatilgan (`cyrlLocked`) maydonlar va chop etilmagan qoralamasi bor postlar oʻzgarmaydi; Telegram xabarlari tahrirlanmaydi (ommaviy tahrir kanalda "tahrirlangan" belgisi bilan koʻrinadi). CLI'dan keyin bosh/kategoriya yangiliklari keyingi so'rovda yangilanadi; qolgan keshlangan ma'lumotlar kesh muddati (≤ 1 soat) ichida yangilanadi. Ularni ham darhol yangilash kerak boʻlsa — admin sessiyasi bilan `POST /api/posts/resync-cyrl` (`{ "apply": true, "ids": [...] }`, Next.js kontekstida revalidate). Prod — `gh workflow run cyrl-resync --ref main` (avval dry-run, keyin `-f apply=true`).
  - **Prod rollout:** merge → `migrate-prod` (avtomatik, `posts.keep_latin`, `tags.do_not_transliterate`) → deploy. Yangi glossariy/istisnolar seed'dan kodda darhol ishlaydi (seed + DB birlashtiriladi); admin'da koʻrinishi uchun — `gh workflow run seed-prod --ref main` (faqat yetishmayotgan yozuvlarni qoʻshadi, mavjudlariga tegmaydi). Soʻng `cyrl-resync` (dry-run → apply).

### API kalitlar va audit log (M2-05)

- **API kalit** (TZ §6.2): har bir foydalanuvchi o'z profilida (Admin → Foydalanuvchilar → o'zi) kalit yaratadi / bekor qiladi, admin — hammaniki. Kalit faqat yaratilganda ko'rinadi; DB'da shifrlangan, qidiruv — HMAC indeksi; kalit ham, indeks ham API javoblarida qaytmaydi.
  - REST/GraphQL: `Authorization: users API-Key <kalit>` — so'rov kalit egasi huquqlari bilan bajariladi. Noto'g'ri yoki bekor qilingan kalit — **401** (`src/auth/route-guard.ts`, `app/(payload)/api/[...slug]` va `graphql` route'lari).
  - MCP (M2-06): `Authorization: Bearer <kalit>` → `authenticateBearer()` (`src/auth/api-key.ts`); Local API chaqiruvlariga `context: { channel: 'mcp', mcpTool }` uzatiladi.
- **Rate limit:** kalit bo'yicha 60 so'rov/daqiqa (`API_KEY_RATE_LIMIT_PER_MIN`; faqat API kalitli so'rovlar), oshsa **429** + `Retry-After`. **Admin** roli kalitlariga qo'llanmaydi (OBLOG-45; MCP `upload_media` kvotasi — `MCP_MEDIA_UPLOADS_PER_HOUR`, standart soatiga 30 — ham). Noto'g'ri kalitlar: bitta IP'dan daqiqasiga 20 ta muvaffaqiyatsiz urinishdan keyin shu IP'dan kalitli so'rovlar oyna tugaguncha 429 (IP — `x-forwarded-for`; Vercel'da ishonchli, boshqa hostingda proxy sozlamasiga bog'liq). Kalit egasi har so'rovda DB'dan topiladi (rol limitdan oldin kerak). **Cheklov:** hisoblagich in-memory — har bir Vercel funksiya instansiyasida alohida (bir nechta issiq instansiyada amaldagi limit `60 × instansiyalar`, sovuq start nollaydi). MVP uchun yetarli; qat'iy global limit kerak bo'lsa — Postgres/Redis (`src/auth/rate-limit.ts`).
- **Audit log** (`audit-logs`, TZ §6.4): barcha kolleksiya va globallardagi yaratish / o'zgartirish / publish / o'chirish (`src/audit`, `auditLogPlugin`). Yozuvlarni hech kim (admin ham) yarata, o'zgartira yoki o'chira olmaydi; o'qish — admin va editor.
  - `channel`: `req.context.channel` (MCP) → `/api/jobs/run` ichida `job` → GraphQL — `graphql` → API kalit — `rest` → foydalanuvchisiz (seed, job'lar) — `job` (`actorType: system`) → qolgani (admin panel sessiyasi) — `admin`. JWT bilan qo'lda REST so'rov ham `admin` bo'lib yoziladi. `JOBS_MODE=autorun` da Payload'ning `schedulePublish` task'i (rejalashtirgan foydalanuvchi nomidan) `admin` bo'lib yozilishi mumkin.
  - `diff`: faqat o'zgargan yuqori darajadagi maydonlar `{ maydon: { from, to } }`; 1000 belgidan katta qiymatlar (Lexical matn) — `{ _omitted, chars }`; parol/kalit/token maydonlari yozilmaydi. O'zgarishsiz saqlash va admin autosave (10 s) yozilmaydi (to'liq matn tarixi — versiyalar).
  - `sources` va `scraped-items` dagi job (foydalanuvchisiz) yozuvlari audit qilinmaydi — feed/pipeline texnik holati DB hajmini to'ldirmasligi uchun (Supabase Free 500 MB).
  - Saqlash muddati (1 yil) tozalovi hali yo'q; kelajakdagi job `context: { auditRetention: true }` bilan o'chiradi.

### Ko'rishlar hisoblagichi (OBLOG-69, OBLOG-71)

- `POST /api/views` (`src/pageviews/`): maqola ~5 s ko'ringach brauzer post ID'sini yuboradi; javob doim **204** `no-store`. Botlar (UA), prefetch, begona saytlar hisoblanmaydi; cookie `bo_pv` — bir postni 30 daqiqada bir marta. Jadvallar: `post_views_daily` (90 kun) va `post_views_total`.
- **IP himoyasi (OBLOG-71, `src/pageviews/ratelimit.ts`)** — cookie'siz skriptga qarshi, bitta SQL so'rov ichida (beacon uchun DB'ga **1 so'rov**; ~2% beacon'dan keyin yana bitta — muddati o'tgan qatorlarni tozalash):
  - IP + User-Agent + Accept-Language + post — **30 daqiqada bir marta**;
  - bitta IP → bitta post: soatiga `PAGEVIEW_RATE_PER_POST_HOUR` (standart 30, UA'ni aylantirishga qarshi);
  - bitta IP → barcha postlar: soatiga `PAGEVIEW_RATE_PER_HOUR` (300) va sutkada `PAGEVIEW_RATE_PER_DAY` (1500, Toshkent sanasi). Limitlar urinishlarni sanaydi; oshsa — 204, lekin hisoblanmaydi.
  - IPv6 — /64 tarmoq bo'yicha. IP: `x-vercel-forwarded-for` → `x-real-ip` → `x-forwarded-for` (birinchi qiymat). Vercel'dan tashqarida (Contabo) reverse proxy `X-Real-IP $remote_addr` ni o'rnatishi shart — aks holda mijoz XFF'ni soxtalashtirib limitni chetlab o'tadi. IP topilmasa — faqat cookie dedupe.
  - **NAT:** O'zbekistonda mobil operatorlar va ofislar bitta IP'ni ko'p foydalanuvchiga beradi. Shuning uchun takror kaliti UA'ni ham oladi va limitlar saxiy. Narxi: bir NAT ortida bir xil brauzer versiyasidagi ikki o'quvchi bir maqolani 30 daqiqa ichida o'qisa — bitta deb sanaladi (kam sanash tomoniga). Katta NAT'dan soatiga 300+ real o'quvchi kelsa — limitni oshiring.
  - **Maxfiylik:** IP saqlanmaydi. `post_view_limits` (UNLOGGED) da faqat `HMAC(HMAC(PAYLOAD_SECRET, sana), …)` ning 16 bayti, urinishlar soni va muddati (≤ 24 soat). Kunlik kalit tufayli kunlar o'rtasida bog'lab bo'lmaydi; muddati o'tgan qatorlar beacon'lar va `maintenance.cleanup` da o'chiriladi (kechi bilan ~48 soat — maxfiylik siyosatida shunday yozilgan). `PAYLOAD_SECRET` almashtirilsa — faqat joriy oynalar nollanadi.

### MCP server (M2-06)

- **Manzil:** `/api/mcp` (`app/api/mcp/route.ts`, mantiq — `src/mcp/`): `mcp-handler` + `@modelcontextprotocol/sdk`, Streamable HTTP, stateless (SSE o'chiq). Ulanish: `claude mcp add --transport http odya https://blog.odya.uz/api/mcp --header "Authorization: Bearer <API kalit>"`.
- **Auth:** `POST` — `Authorization: Bearer <kalit>` majburiy (yo'q/noto'g'ri — **401**, limit — **429**); toollar Local API'ni kalit egasi nomidan (`overrideAccess: false`, `context.channel = 'mcp'`, `mcpTool`) chaqiradi. `GET` (autentifikatsiyasiz) — health **200** (monitoring); `Accept: text/event-stream` bilan va `DELETE` — 405.
- **O'qish toollari:** `get_guidelines`, `get_glossary`, `list_sources`, `list_scraped`, `get_source`, `list_drafts`, `list_scheduled` (OBLOG-100), `search_posts`, `list_categories`, `list_tags` (Zod sxemalar, `page`/`limit` sahifalash, o'zbekcha xatolar). `get_source` tashqi matnni `<untrusted_source>` teglari ichida beradi (ichidagi teglar zararsizlantiriladi, TZ §9.2).
- **Yozish toollari (M2-07):** `create_draft`, `claim_draft` (2 soatlik lock), `release_draft`, `save_rewrite` (Markdown → Lexical, `src/mcp/markdown.ts` — mdast/GFM, xom HTML va xavfli URL'lar rad etiladi), `set_seo`, `preview_cyrillic`, `submit_for_review`, `withdraw_from_review`, `reschedule_post`, `cancel_schedule`. **Publish tool yo'q** (avtomatik nashr yoqilsa `submit_for_review` darhol chop etadi yoki `publishAt` bilan rejalashtiradi — ISO 8601, zona yozilmasa Toshkent vaqti; post vaqtida pg_cron nashr tsiklida (`?mode=publish`, har 10 daqiqa), ≤ 10 daqiqa kechikish bilan chiqadi — OBLOG-100, OBLOG-110, [`docs/mcp.md`](docs/mcp.md) §4). Faqat `draft`/`in_progress` va kalit egasiga biriktirilgan postlar; server tekshiruvlari (TZ §5.3, `src/mcp/validation.ts`) javobi — `{ ok, errors[], warnings[], seoScore }`. Kirill (uz-Cyrl) har saqlashda lotindan yaratiladi (`packages/shared` translit, `cyrlLocked` hurmat qilinadi). Qo'llanma — [`docs/mcp.md`](docs/mcp.md).
- **Prompts:** `rewrite_article(scrapedItemId)`, `daily_batch(count, minScore)`; **resources:** `odya://guidelines/{style,copyright,seo,output-schema}`, `odya://glossary` — `packages/guidelines` dan (Vercel'da `.md` fayllar `outputFileTracingIncludes` bilan funksiyaga qo'shiladi).

## Prod migratsiya

Prod bazaga (Supabase) migratsiyalar GitHub Actions orqali qo'llanadi — [`.github/workflows/migrate-prod.yml`](.github/workflows/migrate-prod.yml). Vercel build'i migratsiya yurgizmaydi, `ci.yml` dagi `Migrate` qadami esa faqat CI test bazasiga ishlaydi.

- **Qachon:** `main` ga push/merge'da, agar migratsiya yo'liga ta'sir qiladigan fayllar o'zgarsa (`apps/web/src/migrations/**`, `payload.config.ts`, `env.schema.ts`, `src/config/**`, `apps/web/package.json`, `pnpm-lock.yaml`, workflow'ning o'zi) + qo'lda. Vercel deploy'i bilan parallel boshlanadi, lekin migratsiya (~1 daqiqa) build'dan tezroq tugaydi. Yangi sxema talab qiladigan PR'ni merge qilgach, `migrate-prod` yashil bo'lganini tekshiring.
- **Nima qiladi:** `pnpm install --frozen-lockfile` → `pnpm migrate` (`PAYLOAD_MIGRATING=true payload migrate`) → `migrate:status`. Qo'llanmagan migratsiyalargina bajariladi (idempotent). `concurrency: migrate-prod` — bir vaqtda bitta, ishlayotgani bekor qilinmaydi. Job `Production` GitHub Environment'ida (Settings → Environments → Production → Required reviewers bilan approval yoqish mumkin).
- **Qo'lda ishga tushirish:**
  ```bash
  gh workflow run migrate-prod --ref main
  gh run watch "$(gh run list --workflow migrate-prod --limit 1 --json databaseId -q '.[0].databaseId')"
  ```
- **Kerakli sir** (repo yoki `Production` environment secrets): faqat `DATABASE_URL_DIRECT_PROD` — workflow uni `DATABASE_URL` va `DATABASE_URL_DIRECT` sifatida beradi. `PAYLOAD_SECRET` va `S3_*` kerak emas: migratsiya rejimida ixtiyoriy, S3 plagini o'chiq, Payload `secret` o'rniga vaqtinchalik tasodifiy qiymat ishlatiladi (`apps/web/src/config/secret.ts`) — migratsiyalar hech narsani imzolamaydi.
- **Session pooler shart:** Supabase direct host (`db.<ref>.supabase.co`) faqat IPv6 (AAAA) yozuviga ega — GitHub runner'lar va Vercel (IPv4) `ENOTFOUND` oladi. `DATABASE_URL_DIRECT_PROD` — Supavisor **session** pooler (Supabase → Connect → Session pooler):
  ```
  postgresql://postgres.<ref>:<parol>@aws-0-<region>.pooler.supabase.com:5432/postgres
  ```
  Foydalanuvchi — `postgres.<ref>` (faqat `postgres` emas), port — 5432 (6543 — transaction pooler, runtime `DATABASE_URL` uchun). Workflow direct host berilsa aniq xato bilan to'xtaydi.
- **Ruxsat:** `assertMigrationAllowed` faqat Vercel Preview'da (`VERCEL_ENV=preview`) migratsiyani taqiqlaydi; GitHub runner'da `VERCEL*` yo'q — ruxsat etiladi.

### Prod seed

Prod bazaga boshlang'ich ma'lumotlar (9 kategoriya, 8 manba, 6 huquqiy sahifa, muallif, `site-settings`/`header`/`footer`) — [`.github/workflows/seed-prod.yml`](.github/workflows/seed-prod.yml), faqat qo'lda:

```bash
gh workflow run seed-prod --ref main              # demo kontentsiz (SEED_DEMO=false)
gh workflow run seed-prod --ref main -f demo=true # + 3 demo post, teglar, muqovalar (R2 ga)
```

- **Nima qiladi:** `pnpm seed` → avval `pnpm migrate`, keyin `payload run src/seed/run.ts`. Idempotent: mavjud hujjatlar (slug bo'yicha) o'zgartirilmaydi. Natija — run Summary'sida (`Manbalar: +7, mavjud 0` ...). `concurrency: migrate-prod` — `migrate-prod` bilan bir vaqtda ishlamaydi. `Production` environment.
- **Yangi manba** (`sources.json` ga qo'shilgan, masalan OBLOG-54 — Cybersport.ru): merge'dan keyin shu workflow'ni qayta ishga tushiring (demo o'chiq) — faqat bazada yo'q slug'lar yaratiladi (Summary: `Manbalar: +1, mavjud 7`), admin'dagi tahrirlar o'zgarmaydi. Mavjud manbani **o'zgartirish** seed orqali bo'lmaydi — migratsiya yoki admin (masalan OBLOG-53, HLTV). Batafsil: [docs/sources.md](docs/sources.md) §3.5c.
- **Demo o'chiq** (`SEED_DEMO=false`, default): teglar, demo postlar va muqovalar yaratilmaydi, S3 ga hech narsa yuklanmaydi; header/footer faqat kategoriya va huquqiy sahifalarga havola qiladi.
- **Sirlar:** `DATABASE_URL_DIRECT_PROD` (session pooler, `DATABASE_URL` va `DATABASE_URL_DIRECT` sifatida), `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (`S3_*`, bucket `media`). `PAYLOAD_SECRET` — har run'da `openssl rand -hex 32` (seed foydalanuvchi/API kalit yaratmaydi — Vercel'dagi sir kerak emas). `JOBS_MODE=endpoint`; `JOBS_SECRET`, `TELEGRAM_BOT_TOKEN`, `SENTRY_DSN` berilmaydi.
- **Huquqiy sahifa o'rinbosarlari:** repo yoki `Production` environment **Variables** (`SEED_CONTACT_EMAIL`, `SEED_EDITORIAL_EMAIL`, ..., `TELEGRAM_CHANNEL_LATN/CYRL`) — workflow ularni env sifatida beradi. Sahifa faqat bir marta yaratiladi, shuning uchun ularni birinchi run'dan oldin qo'ying; to'ldirilmaganlari Summary'dagi `Diqqat:` qatorida — keyin admin'da tahrirlang.

### Kunlik DB backup

Supabase Free'da yuklab olinadigan backup yo'q (TZ §9.3) — [`.github/workflows/backup.yml`](.github/workflows/backup.yml) har kuni 02:30 UTC da (va qo'lda: `gh workflow run backup --ref main`) prod bazaning `public` sxemasini `pg_dump | gzip | age` bilan shifrlab R2 `blog-odya-backups/db/{yyyy-mm-dd}.sql.gz.age` ga yuklaydi; xato bo'lsa — Telegram ogohlantirish. Sirlar: `DATABASE_URL_DIRECT_PROD`, `BACKUP_AGE_PUBLIC_KEY` (faqat ochiq kalit), `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; ixtiyoriy `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`, variable `BACKUP_BUCKET`. Kalitlar, 14 kunlik lifecycle, tiklash (lokal Docker yoki yangi Supabase loyiha) va tiklash sinovlari jurnali — [docs/runbooks/restore.md](docs/runbooks/restore.md).

## Holat

Hujjatlash tugadi (OBLOG-1). M0-01 (OBLOG-2) — repozitoriy skeleti tayyor: Next.js + Payload 3 + Postgres, MinIO, lint, test, CI. M1-01 (OBLOG-8) — Payload asosiy sozlash. M1-02 (OBLOG-9) — kontent kolleksiyalari, workflow va seed. Keyingi vazifalar — [TASKS.md](docs/TASKS.md).
