-- WEDFRAME · 21/11/2026 · Aplicado en Supabase (migración wf_event_types)
alter table public.professional_profiles
  add column if not exists event_types text[] not null default array['wedding']::text[];
alter table public.professional_profiles add constraint professional_profiles_event_types_check
  check (cardinality(event_types) between 1 and 6
         and event_types <@ array['wedding','preboda','communion','baptism','newborn','other']::text[]);
alter table public.quote_requests add column if not exists event_type text not null default 'wedding';
alter table public.quote_requests add constraint quote_requests_event_type_check
  check (event_type in ('wedding','preboda','communion','baptism','newborn','other'));
