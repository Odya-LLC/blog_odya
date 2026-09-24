-- =============================================================================
-- Blog Odya — Payload Jobs scheduler: Supabase pg_cron + pg_net (TZ §3.5, §3.7.1)
-- =============================================================================
--
-- Vercel Hobby'da cron kuniga ko'pi bilan 1 marta ishlaydi, shuning uchun asosiy scheduler —
-- Supabase: har 10 daqiqada `POST https://blog.odya.uz/api/jobs/run`
-- (`Authorization: Bearer <JOBS_SECRET>`). Bu chaqiruv Supabase Free loyihasini "faol" ham
-- saqlaydi (7 kunlik pauzaga qarshi).
--
-- Batafsil yo'riqnoma va tekshiruv: docs/runbooks/jobs-scheduler.md
--
-- QANDAY ISHLATILADI (Supabase Dashboard → SQL Editor, `postgres` roli):
--
--   1-QADAM (bir marta, qiymatlarni SQL Editor'da qo'lda qo'ying — bu faylga YOZMANG):
--      URL va sir Supabase Vault'da shifrlangan holda saqlanadi:
--
--        select vault.create_secret('https://blog.odya.uz/api/jobs/run', 'blog_odya_jobs_url',
--                                   'Blog Odya /api/jobs/run URL');
--        select vault.create_secret('<JOBS_SECRET — Vercel env bilan bir xil>', 'blog_odya_jobs_secret',
--                                   'Blog Odya JOBS_SECRET (Bearer)');
--
--      Sirni almashtirish (rotation):
--        select vault.update_secret(
--          (select id from vault.secrets where name = 'blog_odya_jobs_secret'), '<yangi sir>');
--
--   2-QADAM: shu faylni to'liq ishga tushiring. Fayl idempotent — qayta ishga tushirish xavfsiz
--      (job'lar nomi bo'yicha qayta yaratiladi).
--
--   To'xtatish:  select cron.unschedule('blog-odya-jobs-run');
--   (Contabo worker'ga o'tganda — JOBS_MODE=autorun — pg_cron o'chiriladi, TZ §3.7.3.)
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Vault sirlari mavjudligini tekshirish: 1-qadam bajarilmagan bo'lsa, xato bilan to'xtaydi.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'blog_odya_jobs_url') then
    raise exception 'Vault: blog_odya_jobs_url yo''q — avval 1-qadamni bajaring (fayl boshidagi izoh)';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'blog_odya_jobs_secret') then
    raise exception 'Vault: blog_odya_jobs_secret yo''q — avval 1-qadamni bajaring (fayl boshidagi izoh)';
  end if;
end
$$;

-- Qayta ishga tushirishda eski jadvalni olib tashlaymiz (idempotentlik).
select cron.unschedule(jobname)
from cron.job
where jobname in ('blog-odya-jobs-run', 'blog-odya-cron-cleanup');

-- Har 10 daqiqada: /api/jobs/run. pg_net so'rovi asinxron (cron ishini bloklamaydi);
-- endpoint o'zi ≤ 60 s ichida tugaydi (ichki deadline ≈ 40 s + task grace 10 s).
select cron.schedule(
  'blog-odya-jobs-run',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'blog_odya_jobs_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'blog_odya_jobs_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 65000
  ) as request_id;
  $cron$
);

-- Kuniga bir marta: cron tarixini tozalash (Supabase Free 500 MB — jadval cheksiz o'smasin).
-- pg_net javoblari (`net._http_response`) o'zi ~6 soatda tozalanadi.
select cron.schedule(
  'blog-odya-cron-cleanup',
  '17 3 * * *',
  $cron$
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  $cron$
);

-- Tekshiruv (ixtiyoriy, alohida ishga tushiring):
--   select jobid, jobname, schedule, active from cron.job where jobname like 'blog-odya-%';
--   select status, return_message, start_time from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'blog-odya-jobs-run')
--     order by start_time desc limit 10;
--   select id, status_code, left(content, 300) as body, error_msg, created
--     from net._http_response order by created desc limit 10;
