-- WEDFRAME: límites de frecuencia para solicitudes y mensajes.
-- Revisar y probar antes de aplicar a producción.
-- Máximo 5 solicitudes por usuario en 1 hora; 1 solicitud al mismo profesional cada 10 minutos.
-- Máximo 20 mensajes por usuario en 1 minuto y 3 mensajes en 10 segundos.
create or replace function public.wf_limit_quote_requests()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.client_id::text, 101));
  if new.client_id = new.professional_id then
    raise exception 'No puedes solicitar un presupuesto a tu propio perfil';
  end if;
  if (select count(*) from public.quote_requests
      where client_id = new.client_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Has alcanzado el límite de solicitudes. Inténtalo más tarde';
  end if;
  if exists (select 1 from public.quote_requests
      where client_id = new.client_id and professional_id = new.professional_id
        and created_at > now() - interval '10 minutes') then
    raise exception 'Espera unos minutos antes de volver a contactar con este profesional';
  end if;
  new.created_at := now();
  return new;
end; $;
drop trigger if exists wf_limit_quote_requests_insert on public.quote_requests;
create trigger wf_limit_quote_requests_insert before insert on public.quote_requests
for each row execute function public.wf_limit_quote_requests();

create or replace function public.wf_limit_quote_messages()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.sender_id::text, 102));
  if (select count(*) from public.quote_messages
      where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.quote_messages
      where sender_id = new.sender_id and created_at > now() - interval '10 seconds') >= 3 then
    raise exception 'Estás enviando mensajes demasiado rápido. Inténtalo más tarde';
  end if;
  new.created_at := now();
  return new;
end; $;
drop trigger if exists wf_limit_quote_messages_insert on public.quote_messages;
create trigger wf_limit_quote_messages_insert before insert on public.quote_messages
for each row execute function public.wf_limit_quote_messages();
