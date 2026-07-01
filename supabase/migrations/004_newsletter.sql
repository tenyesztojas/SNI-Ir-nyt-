-- 004: Hírlevél-feliratkozás mező a profiles táblához
alter table public.profiles
  add column if not exists newsletter_subscribed boolean not null default true;
