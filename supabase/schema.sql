-- SNI Iránytű — Supabase séma (5. fázis: térkép, kedvencek, hibajelentés)
-- Futtatás: Supabase projekt > SQL Editor > illeszd be és futtasd le egészben.
-- A fájl idempotens — egy már létező (v3/v4) telepítésen is biztonságosan
-- újrafuttatható, adatvesztés nélkül egészíti ki a sémát.

create extension if not exists pgcrypto;

-- ============================================================
-- TÁBLÁK
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  slug text primary key,
  name text not null,
  icon text not null,
  sort_order int not null default 0
);

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null references public.categories (slug),
  city text not null,
  postal_code text,
  address text not null,
  latitude double precision,
  longitude double precision,
  phone text,
  website text,
  description text not null,
  why_friendly text not null,
  own_experience text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Meglévő (v3/v4) telepítésen ez a két sor adja hozzá a hiányzó oszlopokat —
-- új telepítésnél a fenti create table már tartalmazza őket, itt no-op.
alter table public.places add column if not exists latitude double precision;
alter table public.places add column if not exists longitude double precision;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  title text not null,
  overall_rating int not null check (overall_rating between 1 and 5),
  noise_rating int not null check (noise_rating between 1 and 5),
  crowd_rating int not null check (crowd_rating between 1 and 5),
  staff_empathy_rating int not null check (staff_empathy_rating between 1 and 5),
  safety_rating int not null check (safety_rating between 1 and 5),
  quiet_space_rating int not null check (quiet_space_rating between 1 and 5),
  positive_text text not null,
  warning_text text,
  would_return boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1.1 fázis: kedvencek.
create table if not exists public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

-- 1.1 fázis: hibás adat jelentése.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  review_id uuid references public.reviews (id) on delete cascade,
  reported_by uuid references public.profiles (id) on delete set null,
  report_type text not null default 'egyeb'
    check (report_type in ('hibas_adat', 'nem_mukodik', 'nem_megfelelo_tartalom', 'egyeb')),
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists places_status_idx on public.places (status);
create index if not exists places_category_idx on public.places (category);
create index if not exists places_city_idx on public.places (city);
create index if not exists reviews_place_id_idx on public.reviews (place_id);
create index if not exists reviews_status_idx on public.reviews (status);
create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_place_id_idx on public.reports (place_id);

-- ============================================================
-- SEGÉDFÜGGVÉNYEK ÉS TRIGGEREK
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists places_set_updated_at on public.places;
create trigger places_set_updated_at before update on public.places
  for each row execute function public.set_updated_at();

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

-- Új auth.users sor -> automatikus profiles sor.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'user'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Megakadályozza, hogy egy sima felhasználó saját magát admin-ná léptesse.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() NULL, ha nincs Supabase Auth JWT-kontextus (pl. SQL Editor /
  -- service_role kulcs) - ilyenkor engedjük a változást, hogy az első admin
  -- kézzel kijelölhető legyen. Az alkalmazáson keresztül (van auth.uid())
  -- viszont csak admin módosíthat role-t.
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    new.role = old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.places enable row level security;
alter table public.reviews enable row level security;
alter table public.favorites enable row level security;
alter table public.reports enable row level security;

-- profiles -------------------------------------------------------------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- categories -------------------------------------------------------------
drop policy if exists "categories_select_all" on public.categories;
create policy "categories_select_all" on public.categories
  for select using (true);

-- places -------------------------------------------------------------
drop policy if exists "places_select_approved_or_own_or_admin" on public.places;
create policy "places_select_approved_or_own_or_admin" on public.places
  for select using (
    status = 'approved' or created_by = auth.uid() or public.is_admin()
  );

drop policy if exists "places_insert_authenticated" on public.places;
create policy "places_insert_authenticated" on public.places
  for insert to authenticated
  with check (created_by = auth.uid() and status = 'pending');

drop policy if exists "places_update_admin_only" on public.places;
create policy "places_update_admin_only" on public.places
  for update using (public.is_admin());

-- reviews -------------------------------------------------------------
drop policy if exists "reviews_select_approved_or_own_or_admin" on public.reviews;
create policy "reviews_select_approved_or_own_or_admin" on public.reviews
  for select using (
    status = 'approved' or author_id = auth.uid() or public.is_admin()
  );

drop policy if exists "reviews_insert_authenticated" on public.reviews;
create policy "reviews_insert_authenticated" on public.reviews
  for insert to authenticated
  with check (author_id = auth.uid() and status = 'pending');

drop policy if exists "reviews_update_admin_only" on public.reviews;
create policy "reviews_update_admin_only" on public.reviews
  for update using (public.is_admin());

-- favorites ---------------------------------------------------------------
drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites
  for select using (user_id = auth.uid());

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites
  for delete using (user_id = auth.uid());

-- reports -------------------------------------------------------------
drop policy if exists "reports_select_own_or_admin" on public.reports;
create policy "reports_select_own_or_admin" on public.reports
  for select using (reported_by = auth.uid() or public.is_admin());

drop policy if exists "reports_insert_authenticated" on public.reports;
create policy "reports_insert_authenticated" on public.reports
  for insert to authenticated
  with check (reported_by = auth.uid());

drop policy if exists "reports_update_admin_only" on public.reports;
create policy "reports_update_admin_only" on public.reports
  for update using (public.is_admin());

-- ============================================================
-- ELSŐ ADMIN BEÁLLÍTÁSA (futtasd kézzel, regisztráció UTÁN)
-- ============================================================
-- update public.profiles set role = 'admin' where id =
--   (select id from auth.users where email = 'holvay.csaba@gmail.com');
