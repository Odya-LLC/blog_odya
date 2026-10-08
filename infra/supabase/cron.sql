-- =============================================================================
-- Blog Odya — Payload Jobs scheduler: Supabase pg_cron + pg_net (TZ §3.5, §3.7.1)
-- =============================================================================
--
-- Vercel Hobby'da cron kuniga ko'pi bilan 1 marta ishlaydi, shuning uchun asosiy scheduler —
-- Supabase pg_cron. Ikki xil kadens (OBLOG-110):
--
--   blog-odya-jobs-publish  */10 * * * *   POST /api/jobs/run?mode=publish
--       Har 10 daqiqada: faqat NASHR — vaqti kelgan rejalashtirilgan postlar (`schedulePublish`)
--       va ulardan keyingi Telegram / Make / IndexNow job'lari. Ketma-ket, scraping'siz —
--       yangiliklar navbati nashrni hech qachon kechiktirmaydi.
--   blog-odya-jobs-scrape   5,35 * * * *   POST /api/jobs/run?mode=scrape
--       Har 30 daqiqada (:05 va :35 — nashr chaqiruvlari bilan ustma-ust tushmaydi): yangiliklar
--       (feed.poll → scrapeItem), kunlik tozalash, ogohlantirishlar, "yangi yangiliklar" xabari.
--
-- Ikkala chaqiruv ham `Authorization: Bearer <JOBS_SECRET>` bilan; Supabase Free loyihasini
-- "faol" ham saqlaydi (7 kunlik pauzaga qarshi). `mode` siz chaqiruv (eski jadval, GitHub
-- zaxirasi) — ikkalasi: avval nashr, keyin scraping.
--
-- Batafsil yo'riqnoma va tekshiruv: docs/runbooks/jobs-scheduler.md
--
-- QANDAY ISHLATILADI (Supabase Dashboard → SQL Editor, `postgres` roli):
--
--   1-QADAM (bir marta, qiymatlarni SQL Editor'da qo'lda qo'ying — bu faylga YOZMANG):
--      URL va sir Supabase Vault'da shifrlangan holda saqlanadi. URL — `?mode=` SIZ (rejim
--      quyidagi jadvalda qo'shiladi):
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
--      (job'lar nomi bo'yicha qayta yaratiladi; eski yagona `blog-odya-jobs-run` (*/10, rejimsiz)
--      ham o'chiriladi — OBLOG-110 dan oldingi o'rnatishni yangilash uchun ham shu fayl).
--
--   To'xtatish:
--     select cron.unschedule(jobname) from cron.job
--       where jobname in ('blog-odya-jobs-publish', 'blog-odya-jobs-scrape');
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

-- Qayta ishga tushirishda eski jadvalni olib tashlaymiz (idempotentlik). `blog-odya-jobs-run` —
-- OBLOG-110 dan oldingi yagona */10 chaqiruv (nashr va scraping birga).
select cron.unschedule(jobname)
from cron.job
where jobname in (
  'blog-odya-jobs-run',
  'blog-odya-jobs-publish',
  'blog-odya-jobs-scrape',
  'blog-odya-cron-cleanup'
);

-- Har 10 daqiqada: nashr (`?mode=publish`). pg_net so'rovi asinxron (cron ishini bloklamaydi);
-- endpoint o'zi ≤ 60 s ichida tugaydi (ichki deadline ≈ 35 s + task grace 10 s).
select cron.schedule(
  'blog-odya-jobs-publish',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'blog_odya_jobs_url')
      || '?mode=publish',
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

-- Har 30 daqiqada (:05, :35): yangiliklar va xizmat ishlari (`?mode=scrape`).
-- Manbaning `pollIntervalMin` i (standart 30, OBLOG-112) shu kadensga karrali qilib yuqoriga yaxlitlanadi.
select cron.schedule(
  'blog-odya-jobs-scrape',
  '5,35 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'blog_odya_jobs_url')
      || '?mode=scrape',
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
--     -- kutiladi: blog-odya-jobs-publish (*/10), blog-odya-jobs-scrape (5,35), blog-odya-cron-cleanup
--   select j.jobname, d.status, d.return_message, d.start_time
--     from cron.job_run_details d join cron.job j using (jobid)
--     where j.jobname in ('blog-odya-jobs-publish', 'blog-odya-jobs-scrape')
--     order by d.start_time desc limit 10;
--   select id, status_code, left(content, 300) as body, error_msg, created
--     from net._http_response order by created desc limit 10;
--     -- javobda "mode":"publish" / "mode":"scrape", "phases":{"publish":{...},"scrape":{...}}
