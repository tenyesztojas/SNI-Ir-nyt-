-- ELDOBHATÓ (scratch) Postgres teszt-bootstrap: Supabase auth/profiles stub a Family-migrációk teszteléséhez. NEM production.
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth; create schema extensions;
create extension pgcrypto schema extensions;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true),'') $$;
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, display_name text not null default 'x', role text not null default 'user', pilot_access text[] not null default '{}');
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create function public.is_admin() returns boolean language sql stable as $$ select false $$;
grant usage on schema public, auth, extensions to anon, authenticated;
