-- Programs (Programajánló) tábla
create table if not exists public.programs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  location    text not null,
  event_date  text not null,
  description text not null,
  url         text,
  contact     text,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now()
);

-- RLS
alter table public.programs enable row level security;

-- Jóváhagyott programok mindenki láthatja
create policy "approved programs visible to all"
  on public.programs for select
  using (status = 'approved');

-- Bárki beküldhet (nem kell bejelentkezés)
create policy "anyone can submit program"
  on public.programs for insert
  with check (true);

-- Admin mindent lát és módosíthat (service role)
