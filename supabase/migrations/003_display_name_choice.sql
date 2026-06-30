-- 003: Névválasztás (display_name vagy keresztnév)
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists show_first_name boolean not null default false;
