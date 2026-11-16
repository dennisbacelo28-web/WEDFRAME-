-- WEDFRAME: perfiles públicos con permisos por propietario.
create table if not exists public.professional_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 100),
  profession text not null check (profession in ('videographer','editor')),
  country text not null default '' check (char_length(country) <= 100),
  city text not null default '' check (char_length(city) <= 100),
  bio text not null default '' check (char_length(bio) <= 1500),
  style text not null default '' check (char_length(style) <= 80),
  portfolio_url text check (portfolio_url is null or (char_length(portfolio_url) <= 500 and portfolio_url ~* '^https://')),
  starting_price numeric(10,2) check (starting_price is null or starting_price >= 0),
  currency text not null default 'EUR' check (currency in ('EUR','USD','GBP')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.professional_profiles enable row level security;
revoke all on public.professional_profiles from anon, authenticated;
grant select, insert, update, delete on public.professional_profiles to authenticated;
grant select on public.professional_profiles to anon;
drop policy if exists "Public can read published profiles" on public.professional_profiles;
create policy "Public can read published profiles" on public.professional_profiles for select to anon, authenticated using (is_published = true);
drop policy if exists "Owners can read their own profile" on public.professional_profiles;
create policy "Owners can read their own profile" on public.professional_profiles for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Owners can create their profile" on public.professional_profiles;
create policy "Owners can create their profile" on public.professional_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Owners can update their profile" on public.professional_profiles;
create policy "Owners can update their profile" on public.professional_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Owners can delete their profile" on public.professional_profiles;
create policy "Owners can delete their profile" on public.professional_profiles for delete to authenticated using ((select auth.uid()) = user_id);
