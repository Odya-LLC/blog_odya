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
  src/migrations/     Payload migratsiyalari (commit qilinadi)
  .env.example        Env namunasi (izohlar bilan)
packages/shared/      Umumiy kod: locale'lar, keyinchalik slugify-uz, translit
packages/guidelines/  Tahririyat ko'rsatmalari (MCP prompt/resource)
infra/docker-compose.dev.yml   Lokal Postgres 16 + MinIO
.github/workflows/ci.yml       CI: lint → typecheck → test → build
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

5. http://localhost:3000/admin ni oching va birinchi admin foydalanuvchini yarating.

To'xtatish: `Ctrl+C`, keyin `docker compose -f infra/docker-compose.dev.yml down` (ma'lumotlarni ham o'chirish uchun — `down -v`).

### Buyruqlar

| Buyruq                         | Vazifasi                                                             |
| ------------------------------ | -------------------------------------------------------------------- |
| `pnpm dev`                     | Migratsiyalar + Next.js dev server                                   |
| `pnpm build`                   | Production build                                                     |
| `pnpm lint`                    | ESLint (barcha paketlar)                                             |
| `pnpm typecheck`               | TypeScript tekshiruvi                                                |
| `pnpm test`                    | Vitest: unit + integratsion (Postgres va MinIO ishlab turishi kerak) |
| `pnpm format` / `format:check` | Prettier                                                             |
| `pnpm migrate`                 | Payload migratsiyalarini qo'llash (`DATABASE_URL_DIRECT` orqali)     |
| `pnpm migrate:create <nom>`    | Sxema o'zgarganda yangi migratsiya yaratish (faylni commit qiling)   |

### Muhim eslatmalar

- **Sxema faqat migratsiyalar orqali o'zgaradi** — dev'da ham Payload `push` o'chiq. Kolleksiya o'zgargach: `pnpm migrate:create <nom>` → `pnpm migrate`.
- **Env:** barcha o'zgaruvchilar `apps/web/src/env.ts` da tekshiriladi, noto'g'ri bo'lsa ilova ishga tushmaydi. Sirlar yo'q muhitda build uchun: `SKIP_ENV_VALIDATION=1 pnpm build`.
- **Sirlar** (`.env`) repo'ga commit qilinmaydi — production qiymatlari Vercel Environment Variables va GitHub secrets'da.
- Lokal MinIO va production Cloudflare R2 o'rtasidagi farq faqat `S3_*` va `MEDIA_PUBLIC_URL` qiymatlarida.

## Holat

Hujjatlash tugadi (OBLOG-1). M0-01 (OBLOG-2) — repozitoriy skeleti tayyor: Next.js + Payload 3 + Postgres, MinIO, lint, test, CI. Keyingi vazifalar — [TASKS.md](docs/TASKS.md).
