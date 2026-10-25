-- =====================================================================
-- Védett Család — gyermekutazási push-értesítések: címzettek + egyszeri
-- kiküldés garanciája. NEM fut automatikusan: kézzel, a
-- 20261014_child_travel_status.sql UTÁN, ellenőrzés után alkalmazandó.
-- Újrafuttatható (if not exists / create or replace / drop policy).
--
--   - child_travel_notifications: utazási soronként és eseményenként
--     legfeljebb EGY értesítés (UNIQUE). A sort a service role írja;
--     authenticated/anon semmit nem lát és nem ír (RLS, policy nélkül).
--     A kiküldés kimenetele itt ellenőrizhető.
--   - claim_child_travel_notification(): atomikus INSERT … ON CONFLICT
--     DO NOTHING; csak az első (nyertes) hívó kap címzettlistát.
--     Csak service_role hívhatja.
--   - A címzettek feltétele azonos a child_travel_statuses SELECT
--     policy-jével (admin nélkül): aktív owner, illetve aktív, megtekintési
--     vagy kezelési joggal bíró, aktív guardian-tag gondviselő.
-- =====================================================================

create table if not exists public.child_travel_notifications (
  id                uuid primary key default gen_random_uuid(),
  travel_status_id  uuid not null references public.child_travel_statuses (id) on delete cascade,
  child_id          uuid not null references public.child_profiles (id) on delete cascade,
  event             text not null check (event in ('departed', 'arrived', 'help_requested')),
  claimed_at        timestamptz not null default now(),
  recipient_count   int not null default 0,
  sent_count        int not null default 0,
  failed_count      int not null default 0,
  removed_count     int not null default 0,
  delivery_status   text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'partial', 'failed', 'no_recipients',
                               'no_subscriptions', 'skipped_config', 'error')),
  last_error        text check (last_error is null or char_length(last_error) <= 200),
  completed_at      timestamptz,
  constraint child_travel_notifications_once unique (travel_status_id, event)
);

create index if not exists child_travel_notifications_problem_idx
  on public.child_travel_notifications (claimed_at desc)
  where delivery_status not in ('sent', 'no_subscriptions', 'no_recipients');

alter table public.child_travel_notifications enable row level security;
revoke all on public.child_travel_notifications from public, anon, authenticated;
grant select, insert, update on public.child_travel_notifications to service_role;

create or replace function public._child_travel_notification_recipients(p_child_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct r.user_id
  from (
    select fm.user_id
    from public.family_children fc
    join public.family_members fm on fm.family_id = fc.family_id
    where fc.child_id = p_child_id
      and fm.role = 'owner'
      and fm.status = 'active'
    union
    select gcp.guardian_user_id
    from public.guardian_child_permissions gcp
    where gcp.child_id = p_child_id
      and gcp.status = 'active'
      and (gcp.can_view_schedule or gcp.can_manage_schedule)
      and exists (
        select 1
        from public.family_children fc
        join public.family_members fm on fm.family_id = fc.family_id
        where fc.child_id = p_child_id
          and fm.user_id = gcp.guardian_user_id
          and fm.role = 'guardian'
          and fm.status = 'active'
      )
  ) r
  where r.user_id is not null
    -- a gyermek saját fiókja sosem címzett
    and not exists (
      select 1 from public.child_accounts ca
      where ca.child_id = p_child_id and ca.auth_user_id = r.user_id
    );
$$;

revoke all on function public._child_travel_notification_recipients(uuid) from public, anon, authenticated;

create or replace function public.claim_child_travel_notification(
  p_travel_status_id uuid,
  p_event text
)
returns table (notification_id uuid, recipient_user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.child_travel_statuses%rowtype;
  v_at timestamptz;
  v_id uuid;
  v_n int;
begin
  if p_event is null or p_event not in ('departed', 'arrived', 'help_requested') then
    raise exception 'travel_notify_invalid_event';
  end if;

  select * into v_row from public.child_travel_statuses where id = p_travel_status_id;
  if not found then
    return;
  end if;

  -- Az eseménynek a DB szerint is meg kell történnie, és frissnek kell
  -- lennie: egy órákkal későbbi ismételt gombnyomás nem küld késői értesítést.
  v_at := case p_event
            when 'departed' then v_row.departed_at
            when 'arrived' then case when v_row.status = 'arrived' then v_row.arrived_at end
            else v_row.help_requested_at
          end;
  if v_at is null or v_at < now() - interval '15 minutes' then
    return;
  end if;

  insert into public.child_travel_notifications (travel_status_id, child_id, event)
  values (v_row.id, v_row.child_id, p_event)
  on conflict (travel_status_id, event) do nothing
  returning id into v_id;
  if v_id is null then
    return;  -- már valaki (párhuzamosan vagy korábban) lefoglalta
  end if;

  select count(*) into v_n from public._child_travel_notification_recipients(v_row.child_id);
  update public.child_travel_notifications set recipient_count = v_n where id = v_id;

  -- Címzett nélkül is visszaadunk egy sort (recipient_user_id = null), hogy
  -- a hívó rögzíthesse a no_recipients kimenetelt.
  if v_n = 0 then
    return query select v_id, null::uuid;
    return;
  end if;
  return query select v_id, r.user_id from public._child_travel_notification_recipients(v_row.child_id) r;
end;
$$;

revoke all on function public.claim_child_travel_notification(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_child_travel_notification(uuid, text) to service_role;

-- ROLLBACK (kézzel):
--   drop function if exists public.claim_child_travel_notification(uuid, text);
--   drop function if exists public._child_travel_notification_recipients(uuid);
--   drop table if exists public.child_travel_notifications;
