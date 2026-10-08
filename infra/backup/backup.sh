#!/usr/bin/env bash
# Postgres backup: pg_dump (plain SQL) | gzip | age → shifrlangan fayl (TZ §9.3, OBLOG-24).
# Ochiq SQL diskka YOZILMAYDI — oqim to'g'ridan-to'g'ri shifrlanadi. R2 ga yuklash —
# .github/workflows/backup.yml (bu skript faqat faylni tayyorlaydi; lokal sinov ham shu skript).
#
#   DATABASE_URL=postgresql://... BACKUP_AGE_PUBLIC_KEY=age1... \
#     infra/backup/backup.sh /tmp/2026-10-08.sql.gz.age
#
# Env:
#   DATABASE_URL           [majburiy] manba (prod: DATABASE_URL_DIRECT_PROD — session pooler 5432)
#   BACKUP_AGE_PUBLIC_KEY  [majburiy] age ochiq kaliti(lari), `age1...`; bir nechta — bo'shliq bilan
#   BACKUP_SCHEMAS         [ixtiyoriy, default: public] dump qilinadigan sxemalar (bo'shliq bilan)
#   BACKUP_EXTENSIONS      [ixtiyoriy, default: pg_trgm] ilova sxemasi bog'liq bo'lgan kengaytmalar
#                          (dump'da `CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA <manbadagi>`)
#
# Stdout: `key=value` qatorlari (server_version, pg_dump_version, bytes, sha256) — sir yo'q.
# Hech qachon `set -x` qo'ymang: ulanish satri parol bilan logga tushadi.
set -euo pipefail

out="${1:?Foydalanish: backup.sh <chiqish-fayli.sql.gz.age>}"
: "${DATABASE_URL:?DATABASE_URL berilmagan}"
: "${BACKUP_AGE_PUBLIC_KEY:?BACKUP_AGE_PUBLIC_KEY berilmagan}"
schemas="${BACKUP_SCHEMAS:-public}"
extensions="${BACKUP_EXTENSIONS-pg_trgm}"

for bin in pg_dump psql gzip age; do
  command -v "$bin" >/dev/null || { echo "xato: '$bin' topilmadi" >&2; exit 1; }
done

# age ochiq kalitlari: faqat `age1...` (yopiq kalit `AGE-SECRET-KEY-...` bu yerga tushmasin).
recipients=()
for key in $BACKUP_AGE_PUBLIC_KEY; do
  case "$key" in
    age1*) recipients+=(-r "$key") ;;
    *) echo "xato: BACKUP_AGE_PUBLIC_KEY 'age1...' ochiq kalit bo'lishi kerak (yopiq kalit emas!)" >&2; exit 1 ;;
  esac
done
[ "${#recipients[@]}" -gt 0 ] || { echo "xato: BACKUP_AGE_PUBLIC_KEY bo'sh" >&2; exit 1; }

q() { psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"; }

server_num="$(q 'show server_version_num')"
server_major=$((server_num / 10000))
dump_major="$(pg_dump --version | sed -E 's/^[^0-9]*([0-9]+).*/\1/')"
if [ "$dump_major" -lt "$server_major" ]; then
  echo "xato: pg_dump $dump_major < server $server_major — postgresql-client-$server_major o'rnating" >&2
  exit 1
fi

schema_args=()
for s in $schemas; do schema_args+=(--schema="$s"); done

# `--schema` bilan pg_dump kengaytmalarni tashlab ketadi, lekin indekslar ularga bog'liq
# (posts_locales_search_title_trgm_idx → gin_trgm_ops). `--extension` bilan qo'shamiz: pg_dump
# `CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA <manbadagi>` ni to'g'ri joyga yozadi. Kengaytma
# dump qilinmaydigan sxemada bo'lsa (Supabase: `extensions`), o'sha sxema boshida yaratiladi.
ext_args=()
preamble=""
for ext in $extensions; do
  ext_schema="$(q "select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = '$ext'")"
  [ -n "$ext_schema" ] || continue
  ext_args+=(--extension="$ext")
  case " $schemas " in
    *" $ext_schema "*) ;;
    *) preamble+="CREATE SCHEMA IF NOT EXISTS \"$ext_schema\";"$'\n' ;;
  esac
done

mkdir -p "$(dirname "$out")"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

{
  printf -- '-- blog-odya backup (infra/backup/backup.sh), %s UTC\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf -- '-- server_version_num=%s, pg_dump=%s, schemas=%s\n' "$server_num" "$dump_major" "$schemas"
  printf '%s' "$preamble"
  pg_dump --dbname="$DATABASE_URL" --format=plain --no-owner --no-privileges \
    "${schema_args[@]}" "${ext_args[@]}"
} | gzip -6 | age "${recipients[@]}" -o "$tmp"

mv "$tmp" "$out"
trap - EXIT

bytes="$(wc -c <"$out" | tr -d ' ')"
[ "$bytes" -gt 0 ] || { echo "xato: chiqish fayli bo'sh" >&2; exit 1; }
sha="$(sha256sum "$out" | cut -d' ' -f1)"

echo "server_version_num=$server_num"
echo "pg_dump_version=$dump_major"
echo "bytes=$bytes"
echo "sha256=$sha"
