-- =====================================================================
-- Védett Család — prémium létszámkorlátok kikényszerítése (2026-10-30)
-- =====================================================================
-- Döntések (jóváhagyva):
--   * Ingyenes: 1 gyermek, összesen 2 felnőtt (owner + 1 meghívott gondviselő).
--   * Plusz (vagy hatályos próbaidő): legfeljebb 10 gyermek, 10 felnőtt.
--   * A migráció ELŐTT létező családok lejárat nélküli, családszintű
--     pilot_grandfather jogosultságot kapnak (= Plusz-szintű korlátok).
--   * Lejáratkor semmi nem törlődik és meglévő hozzáférés nem szűnik meg:
--     csak ÚJ gyermek / felnőtt felvétele korlátozott ("puha" korlát).
--   * Felnőtt-helyek: aktív vagy függő (pending) family_members sor
--     (owner ÉS guardian) + függő, még le nem járt meghívó (helyfoglalás).
--     Gyermekfiók, guardian_child_permissions, admin NEM számít.
--   * Most csak a létszámkorlát; a haladó napirend/értesítés későbbi.
--   * A family_members / family_children közvetlen INSERT/UPDATE útja
--     lezárva: írni csak a meglévő SECURITY DEFINER függvények tudnak.
--   * A gyermek utazási státusza, segítségkérése, napirendje és az
--     alapértesítések minden csomagban változatlanul elérhetők (ez a
--     migráció ezeket nem érinti).
-- Párhuzamosság: minden kapacitás-ellenőrzés családonkénti
-- pg_advisory_xact_lock('family_capacity:<family_id>') mögött fut.
-- =====================================================================

-- 1. Családszintű jogosultság-kiadások --------------------------------
create table if not exists public.family_feature_grants (
  family_id    uuid not null references public.families (id) on delete cascade,
  feature_key  text not null check (feature_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  source       text not null check (source ~ '^[a-z][a-z0-9_]{1,31}$'),
  granted_at   timestamptz not null default now(),
  expires_at   timestamptz,
  primary key (family_id, feature_key)
);
alter table public.family_feature_grants enable row level security;
revoke all on public.family_feature_grants from public, anon, authenticated;
grant select, insert, update, delete on public.family_feature_grants to service_role;
-- Nincs authenticated policy: a családtagok a get_family_subscription_state()
-- / get_family_capacity() függvényen át látják az eredményt.

-- 2. Pilot-megőrzés: minden, a migráció futásakor létező család ----------
insert into public.family_feature_grants (family_id, feature_key, source)
select f.id, k.feature_key, 'pilot_grandfather'
from public.families f
cross join (values
  ('family.children.multiple'),
  ('family.guardians.multiple'),
  ('family.schedule.advanced'),
  ('family.notification.advanced')
) as k(feature_key)
on conflict (family_id, feature_key) do nothing;

-- 3. Hatályos állapot: a kiadott jogosultságok is a features listába ------
-- Azonos szignatúra és kulcsok; új kulcsok: granted_features, pilot.
-- paid_access jelentése NEM változik (a próbaidő-logika ettől független).
create or replace function public._family_subscription_effective(p_family_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with s as (
    select fs.* from public.family_subscriptions fs where fs.family_id = p_family_id
  ), eff as (
    select
      coalesce((select status from s), 'free') as status,
      coalesce((select plan_key from s), 'free') as plan_key,
      coalesce((
        select case
          when s.status = 'trialing' then s.trial_ends_at > now()
          when s.status = 'active'   then s.current_period_end > now()
          when s.status = 'past_due' then coalesce(s.grace_until > now(), false)
          when s.status = 'canceled' then coalesce(s.current_period_end > now(), false)
          else false
        end from s), false) as paid_access,
      (select current_period_end from s) as current_period_end,
      (select trial_ends_at from s) as trial_ends_at
  ), g as (
    select gr.feature_key, gr.source
    from public.family_feature_grants gr
    where gr.family_id = p_family_id
      and (gr.expires_at is null or gr.expires_at > now())
  )
  select jsonb_build_object(
    'status', eff.status,
    'plan_key', eff.plan_key,
    'effective_plan_key', case when eff.paid_access then eff.plan_key else 'free' end,
    'paid_access', eff.paid_access,
    'trial_ends_at', eff.trial_ends_at,
    'current_period_end', eff.current_period_end,
    'features', coalesce((
      select jsonb_agg(x.feature_key order by x.feature_key) from (
        select f.feature_key
        from public.subscription_plan_features f
        join public.subscription_plans p on p.plan_key = f.plan_key and p.is_active
        where f.plan_key = case when eff.paid_access then eff.plan_key else 'free' end
        union
        select g.feature_key from g
      ) x
    ), '[]'::jsonb),
    'granted_features', coalesce((select jsonb_agg(g.feature_key order by g.feature_key) from g), '[]'::jsonb),
    'pilot', exists (select 1 from g where g.source = 'pilot_grandfather')
  )
  from eff;
$$;
revoke all on function public._family_subscription_effective(uuid) from public, anon, authenticated;
grant execute on function public._family_subscription_effective(uuid) to service_role;

-- 4. Korlátok és foglaltság -------------------------------------------
create or replace function public._family_limits(p_family_id uuid, out children_limit int, out adults_limit int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_features jsonb := public._family_subscription_effective(p_family_id) -> 'features';
begin
  children_limit := case when v_features ? 'family.children.multiple' then 10 else 1 end;
  adults_limit   := case when v_features ? 'family.guardians.multiple' then 10 else 2 end;
end;
$$;
revoke all on function public._family_limits(uuid) from public, anon, authenticated;
grant execute on function public._family_limits(uuid) to service_role;

-- Felnőtt-helyek: aktív/függő tagság + függő, le nem járt meghívó.
-- p_exclude_user / p_exclude_email: a most belépő személy saját sora és
-- saját meghívója nem számít kétszer.
create or replace function public._family_adult_seats_used(
  p_family_id uuid, p_exclude_user uuid default null, p_exclude_email text default null)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*) from public.family_members m
      where m.family_id = p_family_id and m.status in ('active', 'pending')
        and (p_exclude_user is null or m.user_id <> p_exclude_user))::int
  + (select count(*) from public.family_guardian_invitations i
      where i.family_id = p_family_id and i.status = 'pending' and i.expires_at > now()
        and (p_exclude_email is null or i.invited_email <> lower(btrim(p_exclude_email))))::int;
$$;
revoke all on function public._family_adult_seats_used(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public._family_adult_seats_used(uuid, uuid, text) to service_role;

create or replace function public._family_capacity_lock(p_family_id uuid)
returns void
language sql
volatile
set search_path = public, pg_temp
as $$ select pg_advisory_xact_lock(hashtextextended('family_capacity:' || p_family_id::text, 0)) $$;
revoke all on function public._family_capacity_lock(uuid) from public, anon, authenticated;

-- 5. Kikényszerítés triggerrel (minden írási úton) ----------------------
create or replace function public.enforce_family_child_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit int;
  v_used int;
begin
  if tg_op = 'UPDATE' and new.family_id is not distinct from old.family_id then
    return new;
  end if;
  perform public._family_capacity_lock(new.family_id);
  select children_limit into v_limit from public._family_limits(new.family_id);
  select count(*) into v_used from public.family_children where family_id = new.family_id;
  if v_used + 1 > v_limit then
    raise exception using
      errcode = 'P0001',
      message = case when v_limit = 1
        then 'Az ingyenes csomagban egy gyermek vehető fel. Több gyermekhez a Védett Család Plusz szükséges.'
        else 'Elérted a gyermekek legnagyobb számát (' || v_limit || ') ebben a családban.' end,
      hint = 'family_child_limit_reached';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_family_child_limit() from public, anon, authenticated;

drop trigger if exists enforce_family_child_limit_trigger on public.family_children;
create trigger enforce_family_child_limit_trigger
  before insert or update of family_id on public.family_children
  for each row execute function public.enforce_family_child_limit();

create or replace function public.enforce_family_adult_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit int;
  v_used int;
  v_email text;
begin
  -- Csak akkor ellenőrzünk, ha a sor MOST kerül számított (active/pending)
  -- állapotba ebben a családban. Szerepkörváltás (pl. owner-átadás) vagy
  -- már számított sor módosítása nem változtat a létszámon.
  if new.status not in ('active', 'pending') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('active', 'pending') and old.family_id = new.family_id then
    return new;
  end if;
  perform public._family_capacity_lock(new.family_id);
  select adults_limit into v_limit from public._family_limits(new.family_id);
  select u.email into v_email from auth.users u where u.id = new.user_id;
  v_used := public._family_adult_seats_used(new.family_id, new.user_id, v_email);
  if v_used + 1 > v_limit then
    raise exception using
      errcode = 'P0001',
      message = case when v_limit = 2
        then 'Az ingyenes csomagban a család legfeljebb két felnőttből (a tulajdonosból és egy gondviselőből) állhat. További gondviselőhöz a Védett Család Plusz szükséges.'
        else 'Elérted a felnőtt családtagok legnagyobb számát (' || v_limit || ') ebben a családban.' end,
      hint = 'family_guardian_limit_reached';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_family_adult_limit() from public, anon, authenticated;

drop trigger if exists enforce_family_adult_limit_trigger on public.family_members;
create trigger enforce_family_adult_limit_trigger
  before insert or update of status, family_id on public.family_members
  for each row execute function public.enforce_family_adult_limit();

create or replace function public.enforce_family_invitation_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit int;
  v_used int;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'pending' and old.family_id = new.family_id then
    return new;
  end if;
  perform public._family_capacity_lock(new.family_id);
  select adults_limit into v_limit from public._family_limits(new.family_id);
  -- A meghívott saját (esetleg korábbi) függő meghívója nem számít kétszer.
  v_used := public._family_adult_seats_used(new.family_id, null, new.invited_email);
  if v_used + 1 > v_limit then
    raise exception using
      errcode = 'P0001',
      message = case when v_limit = 2
        then 'Az ingyenes csomagban a tulajdonos mellett egy gondviselő hívható meg (a függő meghívók is helyet foglalnak). További gondviselőhöz a Védett Család Plusz szükséges.'
        else 'Elérted a felnőtt családtagok legnagyobb számát (' || v_limit || '); a függő meghívók is helyet foglalnak.' end,
      hint = 'family_guardian_limit_reached';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_family_invitation_limit() from public, anon, authenticated;

drop trigger if exists enforce_family_invitation_limit_trigger on public.family_guardian_invitations;
create trigger enforce_family_invitation_limit_trigger
  before insert or update of status, family_id on public.family_guardian_invitations
  for each row execute function public.enforce_family_invitation_limit();

-- 6. Kapacitás lekérdezése a felülethez (csak családtagnak) --------------
create or replace function public.get_family_capacity(p_family_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lim record;
begin
  if auth.uid() is null then
    return null;
  end if;
  if not (public.is_family_member(p_family_id) or public.is_admin()) then
    return null;
  end if;
  select * into v_lim from public._family_limits(p_family_id);
  return jsonb_build_object(
    'children_used', (select count(*) from public.family_children where family_id = p_family_id),
    'children_limit', v_lim.children_limit,
    'adults_used', public._family_adult_seats_used(p_family_id),
    'adults_limit', v_lim.adults_limit
  );
end;
$$;
revoke all on function public.get_family_capacity(uuid) from public, anon;
grant execute on function public.get_family_capacity(uuid) to authenticated, service_role;

-- 7. Közvetlen táblaírás lezárása ---------------------------------------
-- Az alkalmazás és minden legitim folyamat SECURITY DEFINER függvényen
-- keresztül ír (create_family_with_owner, create_child_profile_for_family,
-- accept_family_guardian_invitation, transfer_family_ownership,
-- delete_own_account); ezekre a lezárás nem hat. A DELETE út (család /
-- tag eltávolítása) változatlan.
drop policy if exists "family_members_insert_owner_or_admin" on public.family_members;
drop policy if exists "family_members_update_owner_or_admin" on public.family_members;
drop policy if exists "family_children_insert_owner_or_admin" on public.family_children;
revoke insert, update on public.family_members from anon, authenticated;
revoke insert, update on public.family_children from anon, authenticated;

-- ROLLBACK (kézzel, csak szükség esetén):
--   drop trigger if exists enforce_family_child_limit_trigger on public.family_children;
--   drop trigger if exists enforce_family_adult_limit_trigger on public.family_members;
--   drop trigger if exists enforce_family_invitation_limit_trigger on public.family_guardian_invitations;
--   drop function if exists public.get_family_capacity(uuid), public.enforce_family_child_limit(),
--     public.enforce_family_adult_limit(), public.enforce_family_invitation_limit(),
--     public._family_capacity_lock(uuid), public._family_adult_seats_used(uuid, uuid, text),
--     public._family_limits(uuid);
--   a 20261027000200 _family_subscription_effective() újrafuttatása;
--   a két INSERT és az UPDATE policy visszaállítása a 20260926000000 szerint.
--   A family_feature_grants tábla (pilot-kiadások) megtartható.
--
-- ROLLBACK – RLS-policy-k és táblajogok (KÉZI, KÜLÖN JÓVÁHAGYÁSSAL):
--   * A visszaállítás NEM automatikus, és csak külön jóváhagyás után futtatható.
--   * A 3 eredeti policy pontos szövege: 20260926000000_family_db_foundation.sql
--     425–427. sor (family_members_insert_owner_or_admin),
--     430–432. sor (family_members_update_owner_or_admin),
--     497–499. sor (family_children_insert_owner_or_admin).
--   * Táblajogok: a 20261030 előtti migrációk a family_members / family_children
--     táblára SEMMILYEN explicit GRANT/REVOKE-ot nem tartalmaznak. Az addigi
--     INSERT/UPDATE jogok tehát kizárólag a platform alapértelmezett jogaiból
--     származnak, a repóból nem állapíthatók meg; az anon írási joga NEM
--     feltételezhető.
--   * EZÉRT ÉLESÍTÉS ELŐTT rögzíteni kell a tényleges állapotot (csak olvasás):
--       select r.rolname, t.tbl, p.priv,
--              has_table_privilege(r.rolname, t.tbl, p.priv) as van_jog
--       from (values ('anon'), ('authenticated')) r(rolname)
--       cross join (values ('public.family_members'), ('public.family_children')) t(tbl)
--       cross join (values ('INSERT'), ('UPDATE')) p(priv)
--       order by 1, 2, 3;
--   * Visszaállításkor KIZÁRÓLAG azokat a szerepkör/tábla/jog hármasokat kell
--     visszaadni, amelyek a fenti lekérdezés szerint élesítés előtt léteztek
--     (van_jog = true), szerepkörönként külön, például:
--       grant insert, update on public.family_members to authenticated;
--       grant insert on public.family_children to authenticated;
--     (a family_children UPDATE és bármely anon jog csak akkor, ha az előzetes
--     lekérdezés kimutatta). Visszaállítás után ugyanazzal a lekérdezéssel
--     ellenőrizni kell, hogy az állapot megegyezik az élesítés előttivel.
