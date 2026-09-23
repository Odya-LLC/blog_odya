# Runbook: Cloudflare R2 — `media` bucket, CORS va ommaviy domen

**Qachon kerak:** OBLOG-3 (hisoblar) da R2 bucket yaratilgandan keyin, preview/production
ishga tushishidan oldin. Kod tomoni OBLOG-8 da tayyor (`apps/web/src/config/storage.ts`).

## Nima uchun CORS kerak

Admin panelda rasm yuklash `@payloadcms/storage-s3` ning **`clientUploads: true`** rejimida ishlaydi
(Vercel funksiya so'rov tanasi 4.5 MB bilan cheklangan, TZ §3.7.1):

1. Brauzer `POST /api/storage-s3-generate-signed-url` → server (faqat admin/editor uchun)
   imzolangan `PUT` URL qaytaradi (10 daqiqa amal qiladi).
2. Brauzer faylni **to'g'ridan-to'g'ri R2'ga** `PUT` qiladi
   (`https://<account_id>.r2.cloudflarestorage.com/media/<fayl>`). Sarlavhalar: `Content-Type`,
   `If-None-Match: *` (mavjud faylni ustidan yozmaslik uchun).
3. Brauzer hujjatni yaratadi; server faylni R2'dan o'qib, `sharp` bilan WebP variantlarni
   (`thumb`, `card`, `hero`, `og`, `full`) yaratadi va R2'ga yozadi.

2-qadam boshqa origin'ga (R2 S3 API) so'rov — bucket'da sayt domeni uchun CORS ruxsati bo'lmasa,
brauzer yuklashni bloklaydi ("CORS error", admin'da "Faylni yuklashda muammo yuz berdi").

## R2 CORS siyosati (`media` bucket)

Cloudflare Dashboard → R2 → `media` → Settings → CORS Policy → quyidagini qo'ying
(preview domenlarini haqiqiy Vercel loyiha nomiga moslang):

```json
[
  {
    "AllowedOrigins": [
      "https://blog.odya.uz",
      "https://blog-odya-*.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "if-none-match"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

> `blog-odya-*.vercel.app` — S3 uslubidagi bitta `*` wildcard. Agar R2 uni qabul qilmasa
> (yoki preview ishlamasa), preview'ning barqaror alias domenini (masalan,
> `https://blog-odya-git-<branch>-<team>.vercel.app`) aniq yozing.

Yoki Wrangler bilan: `wrangler r2 bucket cors set media --file cors.json`
(fayl formati Wrangler versiyasiga qarab `{"rules": [...]}` bo'lishi mumkin — `wrangler r2 bucket cors --help`).

> `localhost:3000` — faqat lokal dev'dan R2'ga ulanib tekshirish kerak bo'lsa. Odatda lokal dev
> MinIO bilan ishlaydi (`infra/docker-compose.dev.yml`, `MINIO_API_CORS_ALLOW_ORIGIN`).

## Ommaviy domen `media.odya.uz`

- R2 → `media` → Settings → Custom Domains → `media.odya.uz` (Cloudflare proxy, kesh).
- `r2.dev` ommaviy URL'ni **yoqmang** (kesh va cheklovlar yo'q).
- Vercel env: `MEDIA_PUBLIC_URL=https://media.odya.uz` — fayl URL'lari to'g'ridan-to'g'ri shu
  domenga ishora qiladi (Payload orqali proksilanmaydi, Vercel bandwidth sarflanmaydi).

## Vercel env (preview va production)

| O'zgaruvchi            | Qiymat                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `S3_ENDPOINT`          | `https://<account_id>.r2.cloudflarestorage.com`                 |
| `S3_BUCKET`            | `media`                                                         |
| `S3_ACCESS_KEY_ID`     | R2 API token (Object Read & Write, faqat `media`, `raw`, `backups`) |
| `S3_SECRET_ACCESS_KEY` | R2 API token siri                                               |
| `S3_REGION`            | `auto`                                                          |
| `S3_FORCE_PATH_STYLE`  | `true`                                                          |
| `MEDIA_PUBLIC_URL`     | `https://media.odya.uz`                                         |

Lokal (MinIO) va preview (R2) o'rtasidagi farq **faqat shu qiymatlarda** — kod bir xil.

## Postgres (Supabase) — eslatma

| O'zgaruvchi           | Qiymat                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`        | Supavisor **transaction** pooler, port `6543` (runtime, `pool.max = 3`)       |
| `DATABASE_URL_DIRECT` | Direct (`db.<ref>.supabase.co:5432`) yoki session pooler (port `5432`) — migratsiyalar |

Payload/Drizzle nomli prepared statement ishlatmaydi, shuning uchun transaction pooler bilan
qo'shimcha sozlash (`prepare: false` va h.k.) shart emas. Migratsiyalar (`pnpm migrate`)
`PAYLOAD_MIGRATING=true` bilan direct ulanishdan o'tadi (`apps/web/src/config/database.ts`).

## Tekshirish (OBLOG-3 dan keyin, M1-01 qabul mezonlari)

1. Vercel preview'da `/admin` → Media → **5 MB dan katta** JPEG/PNG yuklang.
2. DevTools → Network: `storage-s3-generate-signed-url` → 200, R2'ga `PUT` → 200 (CORS xatosiz).
3. Hujjatda `url` va `sizes.*.url` `https://media.odya.uz/...` bilan boshlanadi; ular brauzerda
   ochiladi, variantlar `Content-Type: image/webp`, kengliklar 320/640/1280/1200×630/1920.
4. Muammo bo'lsa: CORS siyosatidagi origin (preview domeni) va `AllowedHeaders` ni tekshiring.
