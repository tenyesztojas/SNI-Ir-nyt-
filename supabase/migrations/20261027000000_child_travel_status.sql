-- =====================================================================
-- Védett Család — gyermek utazási állapotok (Elindultam / Megérkeztem /
-- Segítségre van szükségem). NEM fut automatikusan: kézzel, ellenőrzés
-- után alkalmazandó.
--
-- Biztonság:
--   - Egy sor = (napirendi esemény, budapesti dátum). Egy ismétlődő
--     esemény minden napja külön sor.
--   - ÍRÁS kizárólag a set_child_travel_status() SECURITY DEFINER RPC-n
--     át, amely a hívó SAJÁT aktív child_accounts sorából vezeti le a
--     gyermeket — nincs INSERT/UPDATE/DELETE policy, közvetlen írás nincs.
--   - OLVASÁS: ugyanaz a feltétel, mint a child_schedule_items SELECT
--     policy-jén (admin / owner / jogosult aktív guardian / a gyermek
--     saját aktív fiókja). anon: semmi.
--   - Nincs GPS / helyadat tárolás. A segítségkérés NEM segélyhívás és
--     NEM küld értesítést.
-- =====================================================================

create table if not exists public.child_travel_statuses (
  id                 uuid primary key default gen_random_uuid(),
  child_id           uuid not null references public.child_profiles (id) on delete cascade,
  schedule_item_id   uuid not null references public.child_schedule_items (id) on delete cascade,
  travel_date        date not null,
  status             text not null check (status in ('departed', 'arrived', 'help_requested')),
  departed_at        timestamptz,
  arrived_at         timestamptz,
  help_requested_at  timestamptz,
  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  constraint child_travel_statuses_item_date_unique unique (schedule_item_id, travel_date)
);

create index if not exists child_travel_statuses_child_updated_idx
  on public.child_travel_statuses (child_id, updated_at desc);

alter table public.child_travel_statuses enable row level security;

revoke all on public.child_travel_statuses from public;
revoke all on public.child_travel_statuses from anon;
revoke insert, update, delete on public.child_travel_statuses from authenticated;
grant select on public.child_travel_statuses to authenticated;

drop policy if exists "child_travel_statuses_select_via_family" on public.child_travel_statuses;
create policy "child_travel_statuses_select_via_family"
  on public.child_travel_statuses for select
  using (
    public.is_admin()
    or public.is_child_family_owner(child_id)
    or exists (
      select 1 from public.guardian_child_permissions gcp
      where gcp.child_id = child_travel_statuses.child_id
        and gcp.guardian_user_id = auth.uid()
        and gcp.status = 'active'
        and (gcp.can_view_schedule or gcp.can_manage_schedule)
        and exists (
          select 1
          from public.family_children fc
          join public.family_members fm on fm.family_id = fc.family_id
          where fc.child_id = child_travel_statuses.child_id
            and fm.user_id = auth.uid()
            and fm.role = 'guardian'
            and fm.status = 'active'
        )
    )
    or exists (
      select 1 from public.child_accounts ca
      where ca.child_id = child_travel_statuses.child_id
        and ca.auth_user_id = auth.uid()
        and ca.status = 'active'
    )
  );

-- Állapotátmenetek (a lib/family/travelStatus.ts applyTravelAction tükre):
--   nincs sor    : depart -> departed | help -> help_requested | arrive -> HIBA travel_not_departed
--   departed     : depart -> (ismételt, változatlan) | arrive -> arrived | help -> help_requested
--   help_requested: depart -> departed_at beállítva, állapot marad | arrive -> arrived | help -> (ismételt)
--   arrived      : bármi -> HIBA travel_closed (lezárt utazás nem indul újra)
-- A segítségkérés időpontja (help_requested_at) SOHA nem törlődik — a
-- megérkezés után is látható marad a szülői felületen.
--
-- Sorválasztás (audit 2026-10-14):
--   - meglévő sor: a mai, vagy (arrive/help esetén) a TEGNAPI NYITOTT sor —
--     éjfélen átnyúló utazás is lezárható;
--   - meglévő sor folytatásához NEM kell, hogy az esemény ma is aktív/
--     érvényes legyen (napirend-módosítás nem akasztja el a megkezdett
--     utat), de a gyermekhez tartozás MINDIG ellenőrzött;
--   - ÚJ sor csak aktív, mára érvényes eseményhez jöhet létre.
create or replace function public.set_child_travel_status(
  p_schedule_item_id uuid,
  p_action text
)
returns public.child_travel_statuses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_child_id uuid;
  v_item public.child_schedule_items%rowtype;
  v_today date := (now() at time zone 'Europe/Budapest')::date;
  v_dow int := extract(isodow from (now() at time zone 'Europe/Budapest'))::int;
  v_row public.child_travel_statuses%rowtype;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'travel_not_child';
  end if;
  if p_action is null or p_action not in ('depart', 'arrive', 'help') then
    raise exception 'travel_invalid_action';
  end if;

  select ca.child_id into v_child_id
  from public.child_accounts ca
  where ca.auth_user_id = v_uid and ca.status = 'active';
  if v_child_id is null then
    raise exception 'travel_not_child';
  end if;

  select * into v_item
  from public.child_schedule_items
  where id = p_schedule_item_id and child_id = v_child_id;
  if not found then
    raise exception 'travel_item_not_found';
  end if;

  select * into v_row
  from public.child_travel_statuses
  where schedule_item_id = p_schedule_item_id
    and child_id = v_child_id
    and (
      travel_date = v_today
      or (p_action <> 'depart' and travel_date = v_today - 1 and status <> 'arrived')
    )
  order by travel_date desc
  limit 1
  for update;

  if not found then
    if p_action = 'arrive' then
      raise exception 'travel_not_departed';
    end if;
    if not v_item.is_active then
      raise exception 'travel_item_not_found';
    end if;
    if not (
      (v_item.schedule_type = 'one_time' and v_item.start_date = v_today)
      or (
        v_item.schedule_type = 'recurring'
        and (v_item.start_date is null or v_item.start_date <= v_today)
        and (v_item.end_date is null or v_item.end_date >= v_today)
        and v_dow = any (coalesce(v_item.days_of_week, '{}'::smallint[]))
      )
    ) then
      raise exception 'travel_not_today';
    end if;

    insert into public.child_travel_statuses
      (child_id, schedule_item_id, travel_date, status, departed_at, help_requested_at, updated_at)
    values (
      v_child_id, p_schedule_item_id, v_today,
      case when p_action = 'help' then 'help_requested' else 'departed' end,
      case when p_action = 'depart' then v_now end,
      case when p_action = 'help' then v_now end,
      v_now
    )
    on conflict (schedule_item_id, travel_date) do nothing
    returning * into v_row;
    if found then
      return v_row;
    end if;

    -- Párhuzamos első kérés (dupla kattintás): a már beszúrt sorral folytatjuk.
    select * into v_row
    from public.child_travel_statuses
    where schedule_item_id = p_schedule_item_id and travel_date = v_today
    for update;
  end if;

  if v_row.status = 'arrived' then
    raise exception 'travel_closed';
  end if;

  if p_action = 'depart' then
    if v_row.departed_at is null then
      update public.child_travel_statuses
        set departed_at = v_now, updated_at = v_now
        where id = v_row.id returning * into v_row;
    end if;
  elsif p_action = 'arrive' then
    update public.child_travel_statuses
      set status = 'arrived', arrived_at = v_now, updated_at = v_now
      where id = v_row.id returning * into v_row;
  elsif v_row.status <> 'help_requested' then
    update public.child_travel_statuses
      set status = 'help_requested', help_requested_at = v_now, updated_at = v_now
      where id = v_row.id returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.set_child_travel_status(uuid, text) from public, anon;
grant execute on function public.set_child_travel_status(uuid, text) to authenticated;

-- ROLLBACK (kézzel):
--   drop function if exists public.set_child_travel_status(uuid, text);
--   drop table if exists public.child_travel_statuses;
