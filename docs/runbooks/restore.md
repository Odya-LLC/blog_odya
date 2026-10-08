# Runbook: kunlik DB backup va tiklash

TZ §9.3, §3.7.2 (OBLOG-24). Supabase Free'da yuklab olinadigan backup/PITR yo'q — o'zimizning kunlik
`pg_dump` bilan qoplanadi. **RPO ≤ 24 soat, RTO ≤ 4 soat**, tiklash sinovi — oyiga bir marta
(natija pastdagi [jurnal](#tiklash-sinovi-jurnali)ga yoziladi).

| Narsa | Qayerda |
|---|---|
| Workflow | [`.github/workflows/backup.yml`](../../.github/workflows/backup.yml) — har kuni 02:30 UTC (07:30 Toshkent) + qo'lda |
| Dump/shifrlash skripti | [`infra/backup/backup.sh`](../../infra/backup/backup.sh) |
| Tiklash skripti | [`infra/backup/restore.sh`](../../infra/backup/restore.sh), tekshiruv — [`row-counts.sql`](../../infra/backup/row-counts.sql) |
| Backup fayllari | R2 `blog-odya-backups/db/{yyyy-mm-dd}.sql.gz.age` (sana — UTC) |
| Saqlash muddati | 14 kun (R2 Lifecycle rule) |

## Qanday ishlaydi

```
GitHub Actions (02:30 UTC)
  pg_dump --schema=public --no-owner --no-privileges   (DATABASE_URL_DIRECT_PROD, session pooler)
    | gzip | age -r <BACKUP_AGE_PUBLIC_KEY>               → $RUNNER_TEMP/<sana>.sql.gz.age (faqat shifrlangan)
  aws s3 cp → R2 blog-odya-backups/db/<sana>.sql.gz.age   (metadata: sha256, server-version-num)
  head-object: R2'dagi hajm == lokal hajm
  xato bo'lsa → Telegram (TELEGRAM_ALERT_CHAT_ID), havola — run log'iga
```

- **Ochiq SQL diskka yozilmaydi**: dump oqimi to'g'ridan-to'g'ri `gzip` va `age` ga boradi. R2'ga faqat
  tayyor shifrlangan fayl yuklanadi — dump yarim yo'lda uzilsa, chala fayl tushmaydi.
- **Shifrlash — `age` ochiq kaliti bilan.** GitHub'da faqat ochiq kalit (`age1...`) turadi: GitHub,
  R2 yoki runner buzilsa ham backup'ni ochib bo'lmaydi. Yopiq kalit faqat egasida (offline).
- **Postgres klienti server bilan mos:** workflow server versiyasini aniqlab, aynan o'sha major'ning
  `postgresql-client` ini PGDG apt repo'dan o'rnatadi (`backup.sh` yana tekshiradi: pg_dump ≥ server).
  Supabase yangi loyihalari — Postgres 17.
- **Nima kiradi:** `public` sxemasi to'liq (Payload'ning barcha jadvallari, ketma-ketliklar, funksiyalar
  — `odya_search_normalize` va h.k., indekslar, ma'lumot, `payload_migrations`) + `pg_trgm` kengaytmasi
  (manbadagi sxemasida: `CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA ...`).
- **Nima kirmaydi (ataylab):** Supabase ichki sxemalari — `auth`, `storage`, `realtime`, `vault`,
  `extensions`, `graphql`, `cron`, `net` va h.k. Ilova ularni ishlatmaydi (Payload foydalanuvchilari —
  `public.users`, Supabase Auth emas; media — R2'da). `pg_cron` job'i va Vault siri yangi loyihada
  [`infra/supabase/cron.sql`](../../infra/supabase/cron.sql) bilan qayta yaratiladi. Rollar va
  `GRANT` lar ham kirmaydi (`--no-owner --no-privileges`) — tiklangan obyektlar tiklayotgan
  foydalanuvchiniki bo'ladi.
- **Media fayllar** (R2 `media`) bu backup'ga kirmaydi — TZ §9.3: alohida haftalik `rclone` nusxa
  (keyingi vazifa).
- Bir kunda qayta ishga tushirilsa, shu kungi fayl almashtiriladi. Run ≈ 1 daqiqa (o'rnatish ~30 s,
  dump soniyalar); hajm hozir ~100 KB–bir necha MB.

## Birinchi sozlash (egasi)

### 1. `age` kalit juftligi

`age` ni o'rnating (Windows: `winget install FiloSottile.age`; macOS: `brew install age`; Linux:
`apt install age` yoki [relizlar](https://github.com/FiloSottile/age/releases)). Ishonchli kompyuterda:

```bash
age-keygen -o blog-odya-backup.key
# Public key: age1q...   ← bu ochiq kalit (faylning 2-qatorida ham bor)
```

- **Yopiq kalit** (`AGE-SECRET-KEY-1...` qatori, butun fayl) — **faqat egasida, offline**:
  1. parol menejerida (masalan, Bitwarden/1Password "Secure note" — fayl mazmuni to'liq);
  2. + offline nusxa: shifrlangan USB yoki qog'ozga chop etilgan, seyfda.
  Keyin kompyuterdagi `blog-odya-backup.key` ni o'chiring.
- Yopiq kalitni **hech qachon** GitHub, Vercel, Supabase, R2, chat yoki repo'ga qo'ymang.
  Kalit yo'qolsa — barcha backup'lar o'qib bo'lmaydigan bo'ladi (tiklash imkonsiz).
- **Ochiq kalit** (`age1...`) → GitHub → Settings → Secrets and variables → Actions →
  `BACKUP_AGE_PUBLIC_KEY`. Bir nechta oluvchi mumkin (bo'shliq bilan): masalan, egasi + zaxira
  kalit — ikkalasidan biri bilan ochiladi. Workflow `AGE-SECRET-KEY-` ni ko'rsa to'xtaydi.

### 2. R2 bucket, lifecycle va token

1. Cloudflare → R2 → **Create bucket**: `blog-odya-backups` (ommaviy domensiz, `r2.dev` o'chiq).
   Boshqa nom ishlatilsa — GitHub repo **variable** `BACKUP_BUCKET` (Settings → Variables).
2. `blog-odya-backups` → Settings → **Object lifecycle rules** → Add rule: prefix `db/`,
   "Delete objects" — **14 kun** (TZ §9.3). Workflow o'zi eski fayllarni o'chirmaydi.
3. R2 API tokeni (`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`) `blog-odya-backups` ga **Object Read &
   Write** huquqiga ega bo'lishi kerak (R2 → Manage API tokens → tokenni tahrirlash → bucket qo'shish).
   Mavjud token boshqa bucketlar bilan cheklangan bo'lsa, `403 AccessDenied` bo'ladi.

### 3. GitHub secrets

| Secret | Qiymat | Holat (2026-10-08) |
|---|---|---|
| `DATABASE_URL_DIRECT_PROD` | Supavisor **session** pooler: `postgresql://postgres.<ref>:<parol>@aws-0-<region>.pooler.supabase.com:5432/postgres` | bor |
| `R2_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` | bor |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 token (yuqoridagi 2.3) | bor |
| `BACKUP_AGE_PUBLIC_KEY` | `age1...` | **yo'q — qo'shish kerak** |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID` | Vercel'dagi bilan bir xil (ogohlantirish guruhi) | **yo'q** — bo'lmasa alert o'rniga faqat GitHub email |

Direct host (`db.<ref>.supabase.co`) faqat IPv6 — GitHub runner'da ishlamaydi, workflow aniq xato beradi.

### 4. Birinchi ishga tushirish

Workflow `main` ga merge bo'lgandan keyin:

```bash
gh workflow run backup --ref main
gh run watch "$(gh run list --workflow backup --limit 1 --json databaseId -q '.[0].databaseId')"
```

Run **Summary**'sida: obyekt (`blog-odya-backups/db/<sana>.sql.gz.age`), hajm, SHA-256, server/pg_dump
versiyasi. Keyin pastdagi tiklash sinovini haqiqiy backup bilan bajaring va jurnalga yozing.

## Tiklash

> **Hech qachon ishlayotgan prod bazaga tiklamang.** `restore.sh` faqat bo'sh bazaga yozadi
> (`public` da jadval bo'lsa to'xtaydi) va hammasini bitta tranzaksiyada bajaradi.

### 1. Backup'ni yuklab olish

R2 token (o'qish huquqi yetarli) bilan, `aws-cli` orqali:

```bash
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_DEFAULT_REGION=auto
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
R2=https://<account_id>.r2.cloudflarestorage.com

aws s3 ls s3://blog-odya-backups/db/ --endpoint-url "$R2"                 # mavjud sanalar
aws s3 cp s3://blog-odya-backups/db/2026-10-08.sql.gz.age ./restore/ --endpoint-url "$R2"
aws s3api head-object --bucket blog-odya-backups --key db/2026-10-08.sql.gz.age \
  --endpoint-url "$R2" --query Metadata.sha256 --output text
sha256sum restore/2026-10-08.sql.gz.age                                    # ikkalasi bir xil bo'lsin
```

`rclone` bilan: `rclone copy r2:blog-odya-backups/db/2026-10-08.sql.gz.age ./restore/` (remote `r2` —
`type = s3`, `provider = Cloudflare`, `endpoint = $R2`). Yoki Cloudflare Dashboard → R2 →
`blog-odya-backups` → fayl → Download.

### 2. Yopiq kalitni vaqtincha joylash

Parol menejeridan kalit mazmunini `restore/key.txt` ga saqlang (faqat tiklash vaqtida, keyin o'chiriladi).
`restore/` papkasi repo ichida bo'lmasin.

### 3a. Lokal Postgres'ga tiklash (Docker) — sinov va tekshiruv uchun

Kerak: Docker (`docker compose` dev bazasi emas — u Postgres 16 va bo'sh emas; alohida konteyner).
Postgres, `psql` va `age` lokal o'rnatilishi shart emas — hammasi konteynerda.
Dump Postgres 17 `pg_dump` bilan olingan: maqsad server va `psql` **17** bo'lsin (16 da
`transaction_timeout` va `\restrict` xatolari).

```bash
# repo ildizida; RESTORE — repo TASHQARISIDAGI papka: <sana>.sql.gz.age va key.txt
RESTORE="$PWD/../restore"
docker run -d --name blog-odya-restore -e POSTGRES_PASSWORD=postgres -p 5443:5432 \
  -v "$PWD/infra/backup:/backup:ro" -v "$RESTORE:/restore" postgres:17-alpine
docker exec blog-odya-restore apk add --no-cache bash age
docker exec -e TARGET_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  blog-odya-restore bash /backup/restore.sh /restore/2026-10-08.sql.gz.age /restore/key.txt
rm "$RESTORE/key.txt"                                                       # kalitni darhol o'chiring
```

Konteyner endigina ishga tushgan bo'lsa, `restore.sh` "connection refused" berishi mumkin — bir necha
soniyadan keyin qayta ishga tushiring.

`restore.sh` tartibi: (1) bazaga tegmasdan shifr ochilishi va gzip butunligi tekshiriladi (noto'g'ri
kalit — shu yerda to'xtaydi); (2) maqsad bo'shligi; (3) `DROP SCHEMA public` (bo'sh standart sxema) +
dump — bitta tranzaksiyada, `ON_ERROR_STOP`; (4) har jadvalning aniq qatorlar soni.

Saytni tiklangan baza bilan ko'rish (ixtiyoriy): `apps/web/.env` da `DATABASE_URL` va
`DATABASE_URL_DIRECT` = `postgresql://postgres:postgres@localhost:5443/postgres`,
`MEDIA_PUBLIC_URL=https://media.odya.uz`, keyin `pnpm dev` → http://localhost:3000 va `/admin`
(prod foydalanuvchilari bilan kirish — parol xeshlari bazada).

Tugagach: `docker rm -f blog-odya-restore`.

### 3b. Avariya: yangi Supabase loyihaga tiklash

Prod loyiha yo'qolgan/buzilgan bo'lsa (RTO ≤ 4 soat):

1. Supabase → yangi loyiha (o'sha region — Vercel `bom1` ↔ `ap-south-1`, `apps/web/vercel.json`).
   Database → Extensions: `pg_cron`, `pg_net`.
2. Yuqoridagi 3a buyrug'i, faqat `TARGET_DATABASE_URL` = yangi loyihaning **session pooler** URL'i
   (konteynerdan internetga chiqadi). `restore.sh` yangi loyihaning bo'sh `public` sxemasini
   almashtiradi.
3. Vercel → Production env: `DATABASE_URL` (transaction pooler, 6543), `DATABASE_URL_DIRECT`
   (session pooler); GitHub secret `DATABASE_URL_DIRECT_PROD` → yangi URL. `PAYLOAD_SECRET` o'zgarmaydi
   (aks holda sessiyalar va shifrlangan maydonlar yaroqsiz). Redeploy.
4. `gh workflow run migrate-prod --ref main` — "No migrations to run" bo'lishi kerak (sxema backup'dan).
5. [`infra/supabase/cron.sql`](../../infra/supabase/cron.sql) — `pg_cron` job va Vault siri
   ([jobs-scheduler.md](jobs-scheduler.md)).
6. Tekshiruv (pastda), keyin `gh workflow run backup --ref main` — yangi bazadan birinchi backup.

> Yangi Supabase loyihaga tiklash hali sinalmagan (staging yo'q) — birinchi avariyada qadamlarni shu
> yerga aniqlashtirib yozing.

### 4. Tekshirish

- `restore.sh` chiqargan qatorlar soni — asosiy jadvallar: `posts`, `posts_locales`, `users`, `media`,
  `categories`, `tags`, `pages`, `sources`, `scraped_items`, `payload_migrations`. Bo'sh bo'lmasligi va
  prod admin'dagi sonlarga (backup sanasidagi) mos kelishi kerak. Qayta hisoblash:
  ```bash
  docker exec blog-odya-restore psql -U postgres -At -F ' ' -f /backup/row-counts.sql
  ```
- Oxirgi migratsiya prod bilan bir xil:
  `select name from payload_migrations order by id desc limit 1;`
- Eng so'nggi post sanasi backup sanasiga yaqin: `select max(updated_at) from posts;`
- Sayt/admin ochiladi (3a yoki 3b), qidiruv ishlaydi (`pg_trgm` indeksi bilan).

## Muammolar

| Belgi | Sabab / yechim |
|---|---|
| `Secret(lar) berilmagan: ...` | Ko'rsatilgan secret'ni qo'shing (yuqoridagi jadval). |
| `direct host'ga ishora qiladi` / `ENOTFOUND` | `DATABASE_URL_DIRECT_PROD` — session pooler (5432) bo'lsin. |
| `pg_dump NN < server MM` | Supabase major yangilangan — workflow odatda o'zi moslaydi; bo'lmasa `PG_MAJOR_FALLBACK` ni yangilang. |
| R2 `AccessDenied` (403) | Token `blog-odya-backups` ga yozish huquqisiz yoki bucket nomi boshqa (`BACKUP_BUCKET`). |
| R2 `NoSuchBucket` | Bucket yaratilmagan yoki nomi farq qiladi. |
| `no identity matched any of the recipients` | Boshqa kalit — backup qaysi ochiq kalit bilan yaratilgan bo'lsa, o'shaning yopiq kaliti kerak. |
| `unrecognized configuration parameter "transaction_timeout"`, `invalid command \restrict` | Maqsad server/psql eski — `postgres:17-alpine` ishlating. |
| `public sxemasida N ta obyekt bor` | Maqsad bo'sh emas — yangi baza/konteyner yarating. |
| Telegram alert kelmadi | `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ALERT_CHAT_ID` secret'lari yo'q (run'da warning) yoki bot guruhda emas. |

## Kalitni almashtirish

Yangi juftlik yarating → `BACKUP_AGE_PUBLIC_KEY` ni yangilang. **Eski yopiq kalitni 14 kun saqlang** —
undan oldingi backup'lar faqat u bilan ochiladi. Yopiq kalit oshkor bo'lsa: darhol almashtiring va
(ixtiyoriy) eski backup'larni R2'dan o'chiring.

## Tiklash sinovi jurnali

TZ §9.3: oyiga bir marta — oxirgi backup lokal Postgres'ga (3a) tiklanadi, natija shu yerga.

| Sana | Kim | Backup | Muhit | Natija |
|---|---|---|---|---|
| 2026-10-08 | agent (OBLOG-24) | Lokal sintetik baza (prod emas) | Docker `postgres:17-alpine` (17.11), age v1.3.2, aws-cli 2.37 + MinIO (R2 o'rnida) | **Muvaffaqiyatli** — pastda |
| _workflow birinchi run'idan keyin_ | egasi | R2 `db/<sana>.sql.gz.age` (prod) | 3a | _kutilmoqda_ |

**2026-10-08 sinovi (lokal, end-to-end).** Prod sirlari agentda yo'q, staging yo'q — shuning uchun
prod o'rniga lokal Postgres 17 da ilovaning to'liq sxemasi va ma'lumoti tayyorlandi va aynan
workflow ishlatadigan skriptlar sinaldi:

1. Manba: `postgres:17-alpine` (17.11); `payload migrate` (26 migratsiya) + `payload run src/seed/run.ts`
   (`SEED_DEMO=true`: 9 kategoriya, 6 sahifa, 8 manba, 3 post, 3 media, 3 teg, 389 translit istisno,
   356 glossariy) + 2 ta foydalanuvchi — **79 jadval, 2 196 qator**, `pg_trgm` `public` da.
2. `age-keygen` → `BACKUP_AGE_PUBLIC_KEY=age1...`; `infra/backup/backup.sh` → `2026-10-08.sql.gz.age`
   (106 093 bayt, < 1 s). Fayl boshi `age-encryption.org/v1` — ochiq SQL yo'q.
3. Workflow'ning "Upload to R2" buyruqlari MinIO'ga: `aws s3 cp` + metadata, `head-object` hajmi mos;
   yuklab olingan nusxaning SHA-256 metadata'dagi bilan bir xil.
4. `infra/backup/restore.sh` → yangi bo'sh baza `restore_test`: shifr/gzip tekshiruvi OK, tiklash ~1 s.
5. Natija: **79/79 jadvalda qatorlar soni bir xil** (masalan `posts` 3, `posts_locales` 6, `users` 2,
   `media` 3, `categories` 9, `sources` 8, `payload_migrations` 26, `glossary` 356); manba va tiklangan
   bazaning `pg_dump -n public` chiqishi **to'liq bir xil** (10 211 qator — sxema, funksiyalar,
   indekslar, ma'lumot).
6. Salbiy holatlar: noto'g'ri kalit — bazaga tegmasdan to'xtadi; bo'sh bo'lmagan maqsad — rad etildi;
   `BACKUP_AGE_PUBLIC_KEY` ga yopiq kalit berilsa — rad etildi (kalit logga chiqmadi).
7. Supabase taqlidi: `pg_trgm` `extensions` sxemasida, `auth`/`storage` sxemalari bor — dump'da faqat
   `public` + `CREATE SCHEMA IF NOT EXISTS "extensions"` + `CREATE EXTENSION pg_trgm WITH SCHEMA
   extensions`; tiklashdan keyin trigram indeks va `%` operatori ishladi.
8. Workflow'ning o'rnatish qadami toza `ubuntu:24.04` da: PGDG'dan `postgresql-client-17` (17.11) va
   age v1.3.2 (SHA-256 tekshiruvi bilan) ~27 s. `actionlint` (shellcheck bilan) — xatosiz.

**Qolgani (egasi):** workflow merge bo'lib birinchi marta ishlagach, haqiqiy prod backup'ni 3a bo'yicha
tiklab, natijani jadvalga yozing.
