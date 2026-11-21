-- WEDFRAME · 21/11/2026 · Aplicado en Supabase (migración wf_email_notifications)
create extension if not exists pg_net with schema extensions;
alter table public.user_notifications
  add column if not exists emailed_at timestamptz,
  add column if not exists email_status text;
create or replace function app_private.wf_email_notification()
 returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  begin
    perform net.http_post(
      url := 'https://mxchyqouddrimkxnebge.supabase.co/functions/v1/wf-email-notify',
      body := jsonb_build_object('id', new.id),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 5000);
  exception when others then null;
  end;
  return new;
end $function$;
drop trigger if exists wf_email_notification on public.user_notifications;
create trigger wf_email_notification after insert on public.user_notifications
  for each row execute function app_private.wf_email_notification();
