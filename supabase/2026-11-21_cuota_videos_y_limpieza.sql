-- WEDFRAME · 21/11/2026 · Aplicado en Supabase (migración wf_video_quota_and_daily_cleanup)
update storage.buckets set file_size_limit = 52428800 where id = 'wedframe-videos';
create or replace function app_private.wf_video_count(p_uid uuid)
 returns integer language sql stable security definer set search_path to '' as $$
  select count(*)::int from storage.objects o
  where o.bucket_id = 'wedframe-videos' and (storage.foldername(o.name))[1] = p_uid::text
$$;
revoke all on function app_private.wf_video_count(uuid) from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.wf_video_count(uuid) to authenticated;
drop policy if exists wf_videos_insert_own on storage.objects;
create policy wf_videos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'wedframe-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and app_private.wf_video_count((select auth.uid())) < 3);
create extension if not exists pg_cron;
select cron.schedule('wf-storage-cleanup', '17 4 * * *', $cron$
  select net.http_post(url := 'https://mxchyqouddrimkxnebge.supabase.co/functions/v1/wf-storage-cleanup',
    body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 60000);
$cron$);
