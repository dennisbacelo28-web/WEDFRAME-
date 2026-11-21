-- WEDFRAME · 21/11/2026 · Aplicado en Supabase (migración wf_status_from_client_response_and_revoke_rpcs)
-- 1) Las funciones wf_accept_proposal y wf_client_confirm (SECURITY DEFINER) no las usa la app:
--    el trigger de mensajes ya registra las acciones. Se revoca su ejecución (no se borran).
revoke execute on function public.wf_accept_proposal(uuid, text) from public, anon, authenticated;
revoke execute on function public.wf_client_confirm(uuid, text) from public, anon, authenticated;

-- 2) Permitir la transición declined -> accepted (rechaza una propuesta y luego acepta otra).
create or replace function app_private.wf_guard_quote_status()
 returns trigger language plpgsql set search_path to '' as $function$
begin
 if new.client_id is distinct from old.client_id or new.professional_id is distinct from old.professional_id
 or new.project_title is distinct from old.project_title or new.message is distinct from old.message
 or new.budget is distinct from old.budget or new.currency is distinct from old.currency
 or new.created_at is distinct from old.created_at or new.id is distinct from old.id
 then raise exception 'Only the request status may be updated' using errcode='42501'; end if;
 if not ((old.status = 'pending' and new.status in ('accepted','declined'))
         or (old.status = 'declined' and new.status = 'accepted')) then
 raise exception 'Invalid request status transition' using errcode='23514'; end if;
 return new;
end $function$;

create or replace function public.wf_quote_requests_guard_update()
 returns trigger language plpgsql set search_path to '' as $function$
begin
  if (select auth.uid()) is not null then
    if not (old.status = 'pending' or (old.status = 'declined' and new.status = 'accepted')) then
      raise exception 'Esta solicitud ya fue respondida';
    end if;
    if new.id is distinct from old.id
       or new.client_id is distinct from old.client_id
       or new.professional_id is distinct from old.professional_id
       or new.project_title is distinct from old.project_title
       or new.message is distinct from old.message
       or new.budget is distinct from old.budget
       or new.currency is distinct from old.currency
       or new.created_at is distinct from old.created_at then
      raise exception 'Solo se puede cambiar el estado de la solicitud';
    end if;
  end if;
  return new;
end;
$function$;

-- 3) Cuando la pareja responde a una propuesta, actualizar el estado de la solicitud.
create or replace function app_private.wf_record_client_action_from_message()
 returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if exists (select 1 from public.quote_requests q
             where q.id = new.quote_request_id and q.client_id = new.sender_id) then
    if new.body like 'RESPUESTA A PROPUESTA: ACEPTADA%' then
      insert into public.quote_client_actions (quote_request_id, action)
      values (new.quote_request_id, 'proposal_accepted') on conflict do nothing;
      update public.quote_requests set status = 'accepted'
       where id = new.quote_request_id and status in ('pending','declined');
    elsif new.body like 'RESPUESTA A PROPUESTA: RECHAZADA%' then
      update public.quote_requests set status = 'declined'
       where id = new.quote_request_id and status = 'pending';
    elsif new.body like 'WF_CONFIRMACION_V1 %' then
      insert into public.quote_client_actions (quote_request_id, action)
      values (new.quote_request_id, 'client_confirmed') on conflict do nothing;
    end if;
  end if;
  return new;
end $function$;
