#!/usr/bin/env bash
# Backup'ni tiklash: age -d | gunzip | psql (bitta tranzaksiya) → jadvallar bo'yicha qatorlar soni.
# Faqat BO'SH bazaga (lokal Docker Postgres yoki yangi Supabase loyiha). Yo'riqnoma:
# docs/runbooks/restore.md.
#
#   TARGET_DATABASE_URL=postgresql://postgres:postgres@localhost:5443/postgres \
#     infra/backup/restore.sh 2026-10-08.sql.gz.age ~/secure/blog-odya-backup.key
#
# Env:
#   TARGET_DATABASE_URL  [majburiy] tiklanadigan baza (PROD EMAS!). `public` sxemasida jadval,
#                        ko'rinish yoki ketma-ketlik bo'lsa skript to'xtaydi.
# psql versiyasi dump'ni olgan pg_dump'dan past bo'lmasin (dump boshidagi `-- ... pg_dump=NN`).
set -euo pipefail

file="${1:?Foydalanish: restore.sh <backup.sql.gz.age> <age-yopiq-kalit-fayli>}"
identity="${2:?Foydalanish: restore.sh <backup.sql.gz.age> <age-yopiq-kalit-fayli>}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL berilmagan}"
here="$(cd "$(dirname "$0")" && pwd)"

for bin in psql gunzip age; do
  command -v "$bin" >/dev/null || { echo "xato: '$bin' topilmadi" >&2; exit 1; }
done
[ -s "$file" ] || { echo "xato: $file topilmadi yoki bo'sh" >&2; exit 1; }
[ -r "$identity" ] || { echo "xato: kalit fayli $identity o'qilmaydi" >&2; exit 1; }

# 1) Bazaga tegmasdan: shifr ochiladimi (to'g'ri kalit) va gzip butunmi.
age -d -i "$identity" "$file" | gunzip -t
echo "Shifr va gzip butunligi: OK"

# 2) Maqsad baza bo'sh bo'lishi shart — tasodifan ishlayotgan bazaga yozmaslik uchun.
objects="$(psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c \
  "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')")"
if [ "$objects" != "0" ]; then
  echo "xato: maqsad bazaning public sxemasida $objects ta obyekt bor — faqat bo'sh bazaga tiklanadi" >&2
  exit 1
fi

# 3) Tiklash. Dump `--schema=public` bilan olingan — unda `CREATE SCHEMA public;` bor, shuning uchun
# bo'sh standart public sxema avval olib tashlanadi. Hammasi BITTA tranzaksiyada + ON_ERROR_STOP:
# xato bo'lsa baza o'zgarmay qoladi (yarim tiklangan holat yo'q).
start=$(date +%s)
{
  echo 'DROP SCHEMA IF EXISTS public CASCADE;'
  age -d -i "$identity" "$file" | gunzip
} | psql "$TARGET_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction >/dev/null
echo "Tiklandi: $(( $(date +%s) - start )) s"

# 4) Tekshiruv: har jadvalning aniq qatorlar soni.
psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c 'analyze' >/dev/null
echo "Jadvallar (qatorlar soni):"
psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -F ' ' -f "$here/row-counts.sql"
