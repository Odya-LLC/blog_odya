-- `public` sxemasidagi har bir jadvalning ANIQ qatorlar soni (tiklashni tekshirish uchun).
-- Ikkita bazada ishga tushirib natijani solishtiring (docs/runbooks/restore.md):
--   psql "$DB" -X -At -F ' ' -f infra/backup/row-counts.sql
select c.relname as table_name,
       (xpath('/row/n/text()',
              query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname),
                           false, true, '')))[1]::text::bigint as row_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;
