-- VédettSarok — Child Account Foundation (3. modul)
-- Dátum: 2026-09-27
--
-- CÉL: az adatmodell-alap megteremtése ahhoz, hogy egy már létező
-- child_profile OPCIONÁLISAN összekapcsolható legyen egy Supabase Auth
-- userrel ("gyermek-account"), és hogy a guardian -> child jogosultságok
-- (jelenleg: napirend-szintű; KÉSŐBB: GPS/journey-szintű) a family
-- membershiptől STRUKTURÁLISAN FÜGGETLEN, explicit, egyedileg
-- visszavonható rekordokként létezzenek.
--
-- Ez a migráció KIZÁRÓLAG a következőket tartalmazza:
--   - DB schema: child_accounts, child_account_invitations,
--     guardian_child_permissions, guardian_authorizations
--   - RLS minden új táblán, default-deny elv szerint
--   - kritikus műveletekhez SECURITY DEFINER RPC-k, fix search_path-pal
--   - a meglévő is_child_family_member() / is_child_family_owner() /
--     has_pilot_access() helperek ÚJRAHASZNÁLÁSA (nem duplikálva)
--
-- NINCS benne (SZÁNDÉKOSAN, lásd a feladatleírás 8. pontja):
--   GPS, location_points, supervised_journeys, journey_events,
--   location history, push notification, Capacitor/natív kód,
--   Napirend UI, child UI, QR UI, email küldés, payment/subscription,
--   és NEM módosítja a meglévő Family UI-t.
--
-- Additív, idempotens migráció — nem módosít és nem töröl meglévő
-- táblát/oszlopot/adatot (families, family_members, child_profiles,
-- family_children, child_schedule_items teljesen érintetlen).
--
-- FONTOS: ez a fájl SZÁNDÉKOSAN NINCS alkalmazva semmilyen (sem local,
-- sem production) adatbázisra — csak létrehozva és auditálva. Kézi
-- jóváhagyás és `supabase db push` szükséges az alkalmazásához.
--
-- ALAPELV (lásd a feladatleírás "ALAPVETŐ SECURITY ELV" szakaszát):
-- family membership, child account és guardian -> child jogosultság
-- HÁROM KÜLÖN dolog. Egyik sem következik automatikusan a másikból.
-- Konkrétan:
--   - egy child_profile-nak lehet gyermek-accountja, de LEHET, hogy
--     SOSEM lesz — a child_profile account nélkül is teljes értékű
--     (ez a MEGLÉVŐ elv, amit ez a migráció NEM változtat meg: a
--     child_profiles tábla maga NEM kap semmilyen új oszlopot vagy FK-t
--     ehhez a modulhoz).
--   - family_members tagság (owner/guardian) ÖNMAGÁBAN nem jogosít fel
--     semmilyen guardian_child_permissions jogot — azt egy KÜLÖN,
--     explicit RPC-hívással kell megadni, minden jog alapból FALSE.
--   - guardian_child_permissions léte/módosítása NEM azonos a
--     family_members táblával, és nem is helyettesíti azt.
--
-- AUDIT ELŐZMÉNY (a MEGLÉVŐ migrationök alapján, amit ez a fájl
-- újrahasznál, nem duplikál):
--   - supabase/schema.sql: public.profiles (id = auth.users.id, FK
--     cascade), public.is_admin(), public.set_updated_at(), és a
--     public.handle_new_user() trigger, amely MINDEN auth.users
--     insertre (tehát egy jövőbeli gyermek-account signupra IS)
--     automatikusan létrehoz egy public.profiles sort, role='user',
--     pilot_access='{}' default értékekkel — ez NEM ad semmilyen
--     automatikus jogosultságot a gyermek saját auth accountjának
--     (lásd lent, "NYITOTT KÉRDÉSEK" a jelentésben).
--   - supabase/migrations/20260926_family_db_foundation.sql:
--     public.is_family_member(uuid)/is_family_owner(uuid)/
--     has_pilot_access(text), families/family_members/child_profiles/
--     family_children táblák és RLS.
--   - supabase/migrations/20260926_child_schedule_items_foundation.sql:
--     public.is_child_family_member(uuid)/is_child_family_owner(uuid)
--     — ezeket EZ a migráció is közvetlenül újrahasznália (child_id
--     alapú owner/member ellenőrzés), NEM definiálja újra. Ugyanitt
--     jött létre a public.family_children.family_children_child_id_unique
--     UNIQUE(child_id) constraint — tehát MOSTANTÓL egy child_profile
--     PONTOSAN egy familyhez tartozik, ezt ez a migráció is feltételezi
--     (lásd lent a guardian_child_permissions RLS/RPC indoklásánál).
--
-- FONTOS, TUDATOS DÖNTÉS — NINCS "OR public.is_admin()" ELSZÓRVA:
-- a feladatleírás kifejezetten kéri, hogy a KÉSŐBBI GPS-security miatt
-- MÁR MOST kerüljük azt a mintát, ahol admin státusz automatikusan
-- minden gyermekadat megtekintését/módosítását jelenti. Ez a migráció
-- ezért SEHOL nem ad admin bypasst az új táblákon/RPC-ken — ez nem
-- felejtés, hanem szándékos, dokumentált hiányosság.

-- ────────────────────────────────────────────────────────────────
-- 1. TABLE: child_accounts
-- ────────────────────────────────────────────────────────────────

create table if not exists public.child_accounts (
  id             uuid primary key default gen_random_uuid(),
  child_id       uuid not null unique references public.child_profiles (id) on delete restrict,
  auth_user_id   uuid not null unique references auth.users (id) on delete cascade,

  status         text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'revoked')),

  activated_at   timestamptz,
  revoked_at     timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint child_accounts_pending_has_no_activated_at
    check (status <> 'pending' or activated_at is null),
  constraint child_accounts_revoked_requires_revoked_at
    check (status <> 'revoked' or revoked_at is not null),
  constraint child_accounts_non_revoked_has_no_revoked_at
    check (status = 'revoked' or revoked_at is null)
);

comment on table public.child_accounts is
  'Egy child_profile OPCIONÁLIS 1:1 összekapcsolása egy Supabase Auth userrel. A sor HIÁNYA a normális állapot — a child_profile account nélkül is teljes értékű. A kapcsolat SOSEM implikál semmilyen guardian_child_permissions jogot.';
comment on column public.child_accounts.status is
  'pending: linkelve, de még nem aktivált. active: használható. suspended: ideiglenesen letiltva (visszaállítható). revoked: VÉGLEGESEN visszavont — a child_accounts_guard_status_transition trigger blokkol minden revoked -> bármi átmenetet.';

-- ────────────────────────────────────────────────────────────────
-- 2. TRIGGER-EK
-- ────────────────────────────────────────────────────────────────

create or replace function public.child_accounts_guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if old.status = 'revoked' and new.status is distinct from 'revoked' then
    raise exception
      'A gyermek-account visszavonása véglegesített állapot, nem állítható vissza (child_account id=%)',
      old.id;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending' and new.status in ('active', 'revoked'))
      or (old.status = 'active' and new.status in ('suspended', 'revoked'))
      or (old.status = 'suspended' and new.status in ('active', 'revoked'))
    ) then
      raise exception
        'Érvénytelen gyermek-account állapotváltás: % -> % (child_account id=%)',
        old.status, new.status, old.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists child_accounts_guard_status_transition on public.child_accounts;
create trigger child_accounts_guard_status_transition
  before update on public.child_accounts
  for each row execute function public.child_accounts_guard_status_transition();

drop trigger if exists child_accounts_set_updated_at on public.child_accounts;
create trigger child_accounts_set_updated_at before update on public.child_accounts
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 3. TABLE: child_account_invitations
-- ────────────────────────────────────────────────────────────────

create table if not exists public.child_account_invitations (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references public.child_profiles (id) on delete cascade,
  created_by    uuid references public.profiles (id) on delete set null,

  token_hash    text not null unique,

  status        text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),

  expires_at    timestamptz not null,
  used_at       timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),

  constraint child_account_invitations_accepted_requires_used_at
    check (status <> 'accepted' or used_at is not null),
  constraint child_account_invitations_revoked_requires_revoked_at
    check (status <> 'revoked' or revoked_at is not null),
  constraint child_account_invitations_pending_has_no_used_or_revoked_at
    check (status <> 'pending' or (used_at is null and revoked_at is null))
);

comment on table public.child_account_invitations is
  'Egyszer felhasználható, hash-elt tokenes meghívó egy child_profile gyermek-accounttá kapcsolásához. A plaintext token SOSEM kerül ide — csak SHA-256 hash (token_hash). Lejárhat, visszavonható, elfogadás után nem használható újra.';
comment on column public.child_account_invitations.token_hash is
  'SHA-256 hash (hex). A plaintext tokent a hívó EGYETLEN egyszer kapja meg az RPC visszatérési értékében — DB-ben soha nem tárolódik.';

create index if not exists idx_child_account_invitations_child_id
  on public.child_account_invitations (child_id);

create unique index if not exists idx_child_account_invitations_one_pending_per_child
  on public.child_account_invitations (child_id)
  where status = 'pending';

-- ────────────────────────────────────────────────────────────────
-- 4. TABLE: guardian_child_permissions
-- ────────────────────────────────────────────────────────────────

create table if not exists public.guardian_child_permissions (
  id                            uuid primary key default gen_random_uuid(),
  child_id                      uuid not null references public.child_profiles (id) on delete cascade,
  guardian_user_id              uuid not null references public.profiles (id) on delete cascade,

  can_view_schedule             boolean not null default false,
  can_manage_schedule           boolean not null default false,
  can_start_supervised_journey  boolean not null default false,
  can_view_active_journey       boolean not null default false,
  can_view_live_location        boolean not null default false,

  status                        text not null default 'active' check (status in ('active', 'revoked')),

  granted_at                    timestamptz not null default now(),
  revoked_at                    timestamptz,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  unique (child_id, guardian_user_id),

  constraint guardian_child_permissions_revoked_requires_revoked_at
    check (status <> 'revoked' or revoked_at is not null),
  constraint guardian_child_permissions_active_has_no_revoked_at
    check (status = 'active' or revoked_at is not null)
);

comment on table public.guardian_child_permissions is
  'Explicit, egyedi guardian -> child jogosultság-rekord. NEM azonos a family_members táblával és nem is következik belőle automatikusan. Minden jog alapból FALSE.';

create index if not exists idx_guardian_child_permissions_guardian_user_id
  on public.guardian_child_permissions (guardian_user_id);

drop trigger if exists guardian_child_permissions_set_updated_at on public.guardian_child_permissions;
create trigger guardian_child_permissions_set_updated_at before update on public.guardian_child_permissions
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 5. TABLE: guardian_authorizations
-- ────────────────────────────────────────────────────────────────

create table if not exists public.guardian_authorizations (
  id                  uuid primary key default gen_random_uuid(),
  child_id            uuid references public.child_profiles (id) on delete set null,
  guardian_user_id    uuid references public.profiles (id) on delete set null,

  authorization_type  text not null check (authorization_type in (
                         'CHILD_ACCOUNT_ACTIVATION',
                         'SUPERVISED_JOURNEY',
                         'LOCATION_PROCESSING'
                       )),
  document_version    text not null,

  granted_at          timestamptz not null default now(),
  withdrawn_at        timestamptz,
  created_at          timestamptz not null default now()
);

comment on table public.guardian_authorizations is
  'Audit/authorization rekord. child_id és guardian_user_id NULLABLE, ON DELETE SET NULL.';

create index if not exists idx_guardian_authorizations_child_id
  on public.guardian_authorizations (child_id);

create index if not exists idx_guardian_authorizations_guardian_user_id
  on public.guardian_authorizations (guardian_user_id);

-- ────────────────────────────────────────────────────────────────
-- 6. RLS
-- ────────────────────────────────────────────────────────────────

alter table public.child_accounts enable row level security;
alter table public.child_account_invitations enable row level security;
alter table public.guardian_child_permissions enable row level security;
alter table public.guardian_authorizations enable row level security;

drop policy if exists "child_accounts_select_self_or_family_member" on public.child_accounts;
drop policy if exists "child_accounts_select_self_or_family_owner" on public.child_accounts;

create policy "child_accounts_select_self_or_family_owner"
  on public.child_accounts for select
  using (
    auth_user_id = auth.uid()
    or public.is_child_family_owner(child_id)
  );

drop policy if exists "child_account_invitations_select_via_family_owner"
  on public.child_account_invitations;

create policy "child_account_invitations_select_via_family_owner"
  on public.child_account_invitations for select
  using (public.is_child_family_owner(child_id));

drop policy if exists "guardian_child_permissions_select_owner_or_self"
  on public.guardian_child_permissions;

create policy "guardian_child_permissions_select_owner_or_self"
  on public.guardian_child_permissions for select
  using (
    public.is_child_family_owner(child_id)
    or guardian_user_id = auth.uid()
  );

drop policy if exists "guardian_authorizations_select_owner_or_self"
  on public.guardian_authorizations;

create policy "guardian_authorizations_select_owner_or_self"
  on public.guardian_authorizations for select
  using (
    public.is_child_family_owner(child_id)
    or guardian_user_id = auth.uid()
  );

-- ────────────────────────────────────────────────────────────────
-- 7. RPC-K
-- ────────────────────────────────────────────────────────────────

create or replace function public.create_child_account_invitation(
  p_child_id uuid,
  p_ttl_hours integer default 72
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_invitation_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges meghívó létrehozásához';
  end if;

  if not public.has_pilot_access('family_db_beta') then
    raise exception 'family_db_beta hozzáférés szükséges meghívó létrehozásához';
  end if;

  if not public.is_child_family_owner(p_child_id) then
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje hozhat létre gyermek-account meghívót';
  end if;

  if p_ttl_hours is null or p_ttl_hours < 1 or p_ttl_hours > 720 then
    raise exception 'A meghívó érvényességi ideje 1 és 720 óra (30 nap) között kell legyen';
  end if;

  if exists (
    select 1 from public.child_accounts ca
    where ca.child_id = p_child_id and ca.status <> 'revoked'
  ) then
    raise exception 'Ehhez a gyermekhez már létezik gyermek-account (pending/active/suspended)';
  end if;

  update public.child_account_invitations
  set status = 'revoked', revoked_at = now()
  where child_id = p_child_id and status = 'pending';

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  v_expires_at := now() + (p_ttl_hours || ' hours')::interval;

  begin
    insert into public.child_account_invitations
      (child_id, created_by, token_hash, expires_at)
    values
      (p_child_id, v_uid, v_token_hash, v_expires_at)
    returning id into v_invitation_id;
  exception
    when unique_violation then
      raise exception 'Ehhez a gyermekhez éppen most jött létre másik függő meghívó egy konkurens kérésből — próbáld újra';
  end;

  return query select v_invitation_id, v_raw_token, v_expires_at;
end;
$$;

create or replace function public.revoke_child_account_invitation(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_child_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges meghívó visszavonásához';
  end if;

  select child_id, status
  into v_child_id, v_status
  from public.child_account_invitations
  where id = p_invitation_id;

  if v_child_id is null then
    raise exception 'A meghívó nem található';
  end if;

  if not public.is_child_family_owner(v_child_id) then
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje vonhatja vissza a meghívót';
  end if;

  if v_status <> 'pending' then
    raise exception 'Csak függő (pending) állapotú meghívó vonható vissza (jelenlegi állapot: %)', v_status;
  end if;

  update public.child_account_invitations
  set status = 'revoked', revoked_at = now()
  where id = p_invitation_id
    and status = 'pending';

  if not found then
    raise exception 'A meghívó állapota közben megváltozott, nem vonható vissza';
  end if;
end;
$$;

create or replace function public.accept_child_account_invitation(
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token_hash text;
  v_child_id uuid;
  v_account_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges a meghívó elfogadásához';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception 'Érvénytelen meghívó token';
  end if;

  if exists (
    select 1
    from public.family_members fm
    where fm.user_id = v_uid
      and fm.status = 'active'
  ) then
    raise exception 'Ez a felhasználói fiók jelenleg aktív tagja egy familynek (owner vagy guardian) — meglévő felnőtt/családtag fiók nem linkelhető gyermek-accountként';
  end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  update public.child_account_invitations
  set status = 'accepted',
      used_at = now()
  where token_hash = v_token_hash
    and status = 'pending'
    and expires_at > now()
  returning child_id into v_child_id;

  if v_child_id is null then
    raise exception 'Érvénytelen, lejárt, visszavont vagy már felhasznált meghívó';
  end if;

  if exists (
    select 1 from public.child_accounts
    where auth_user_id = v_uid
  ) then
    raise exception 'Ez a felhasználói fiók már egy másik gyermek-accounthoz van kapcsolva';
  end if;

  if exists (
    select 1 from public.child_accounts
    where child_id = v_child_id
  ) then
    raise exception 'Ehhez a gyermekhez már létezik gyermek-account';
  end if;

  insert into public.child_accounts
    (child_id, auth_user_id, status, activated_at)
  values
    (v_child_id, v_uid, 'active', now())
  returning id into v_account_id;

  return v_account_id;
end;
$$;

create or replace function public.revoke_child_account(
  p_child_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges gyermek-account visszavonásához';
  end if;

  if not public.is_child_family_owner(p_child_id) then
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje vonhatja vissza a gyermek-accountot';
  end if;

  update public.child_accounts
  set status = 'revoked',
      revoked_at = now()
  where child_id = p_child_id
    and status <> 'revoked';

  if not found then
    raise exception 'Nincs visszavonható gyermek-account ehhez a childhoz';
  end if;
end;
$$;

create or replace function public.upsert_guardian_child_permission(
  p_child_id uuid,
  p_guardian_user_id uuid,
  p_can_view_schedule boolean default false,
  p_can_manage_schedule boolean default false,
  p_can_start_supervised_journey boolean default false,
  p_can_view_active_journey boolean default false,
  p_can_view_live_location boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges guardian jogosultság megadásához';
  end if;

  if not public.has_pilot_access('family_db_beta') then
    raise exception 'family_db_beta hozzáférés szükséges guardian jogosultság megadásához';
  end if;

  if not public.is_child_family_owner(p_child_id) then
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje adhat guardian jogosultságot';
  end if;

  if not exists (
    select 1
    from public.family_children fc
    join public.family_members fm
      on fm.family_id = fc.family_id
    where fc.child_id = p_child_id
      and fm.user_id = p_guardian_user_id
      and fm.status = 'active'
  ) then
    raise exception 'A megadott guardian_user_id nem aktív tagja a gyermek családjának';
  end if;

  insert into public.guardian_child_permissions (
    child_id,
    guardian_user_id,
    can_view_schedule,
    can_manage_schedule,
    can_start_supervised_journey,
    can_view_active_journey,
    can_view_live_location,
    status,
    granted_at,
    revoked_at
  )
  values (
    p_child_id,
    p_guardian_user_id,
    coalesce(p_can_view_schedule, false),
    coalesce(p_can_manage_schedule, false),
    coalesce(p_can_start_supervised_journey, false),
    coalesce(p_can_view_active_journey, false),
    coalesce(p_can_view_live_location, false),
    'active',
    now(),
    null
  )
  on conflict (child_id, guardian_user_id)
  do update set
    can_view_schedule = coalesce(p_can_view_schedule, false),
    can_manage_schedule = coalesce(p_can_manage_schedule, false),
    can_start_supervised_journey = coalesce(p_can_start_supervised_journey, false),
    can_view_active_journey = coalesce(p_can_view_active_journey, false),
    can_view_live_location = coalesce(p_can_view_live_location, false),
    status = 'active',
    granted_at = now(),
    revoked_at = null,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.revoke_guardian_child_permission(
  p_child_id uuid,
  p_guardian_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges guardian jogosultság visszavonásához';
  end if;

  if not public.is_child_family_owner(p_child_id) then
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje vonhatja vissza a guardian jogosultságot';
  end if;

  update public.guardian_child_permissions
  set status = 'revoked',
      revoked_at = now(),
      can_view_schedule = false,
      can_manage_schedule = false,
      can_start_supervised_journey = false,
      can_view_active_journey = false,
      can_view_live_location = false
  where child_id = p_child_id
    and guardian_user_id = p_guardian_user_id
    and status = 'active';

  if not found then
    raise exception 'Nincs visszavonható (aktív) guardian jogosultság ehhez a child/guardian párhoz';
  end if;
end;
$$;

create or replace function public.record_guardian_authorization(
  p_child_id uuid,
  p_authorization_type text,
  p_document_version text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges authorization rögzítéséhez';
  end if;

  if not (
    public.is_child_family_owner(p_child_id)
    or exists (
      select 1
      from public.guardian_child_permissions gcp
      where gcp.child_id = p_child_id
        and gcp.guardian_user_id = v_uid
        and gcp.status = 'active'
    )
  ) then
    raise exception 'Authorization rögzítéséhez ownernek vagy explicit aktív guardian jogosultsággal rendelkező felhasználónak kell lenned';
  end if;

  if p_authorization_type not in (
    'CHILD_ACCOUNT_ACTIVATION',
    'SUPERVISED_JOURNEY',
    'LOCATION_PROCESSING'
  ) then
    raise exception 'Érvénytelen authorization_type: %', p_authorization_type;
  end if;

  if p_document_version is null or btrim(p_document_version) = '' then
    raise exception 'document_version megadása kötelező';
  end if;

  insert into public.guardian_authorizations (
    child_id,
    guardian_user_id,
    authorization_type,
    document_version,
    granted_at
  )
  values (
    p_child_id,
    v_uid,
    p_authorization_type,
    p_document_version,
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.withdraw_guardian_authorization(
  p_authorization_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row_id uuid;
  v_guardian_user_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges authorization visszavonásához';
  end if;

  select id, guardian_user_id
  into v_row_id, v_guardian_user_id
  from public.guardian_authorizations
  where id = p_authorization_id;

  if v_row_id is null then
    raise exception 'Az authorization rekord nem található';
  end if;

  if v_guardian_user_id is null
     or v_guardian_user_id <> v_uid then
    raise exception 'Csak a saját authorization rekord vonható vissza';
  end if;

  update public.guardian_authorizations
  set withdrawn_at = now()
  where id = p_authorization_id
    and withdrawn_at is null;

  if not found then
    raise exception 'Az authorization rekord már visszavonva van';
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 8. SECURITY DEFINER EXECUTE jogosultságok
-- ────────────────────────────────────────────────────────────────

revoke execute on function public.create_child_account_invitation(uuid, integer) from public;
revoke execute on function public.create_child_account_invitation(uuid, integer) from anon;
grant execute on function public.create_child_account_invitation(uuid, integer) to authenticated;

revoke execute on function public.revoke_child_account_invitation(uuid) from public;
revoke execute on function public.revoke_child_account_invitation(uuid) from anon;
grant execute on function public.revoke_child_account_invitation(uuid) to authenticated;

revoke execute on function public.accept_child_account_invitation(text) from public;
revoke execute on function public.accept_child_account_invitation(text) from anon;
grant execute on function public.accept_child_account_invitation(text) to authenticated;

revoke execute on function public.revoke_child_account(uuid) from public;
revoke execute on function public.revoke_child_account(uuid) from anon;
grant execute on function public.revoke_child_account(uuid) to authenticated;

revoke execute on function public.upsert_guardian_child_permission(
  uuid, uuid, boolean, boolean, boolean, boolean, boolean
) from public;
revoke execute on function public.upsert_guardian_child_permission(
  uuid, uuid, boolean, boolean, boolean, boolean, boolean
) from anon;
grant execute on function public.upsert_guardian_child_permission(
  uuid, uuid, boolean, boolean, boolean, boolean, boolean
) to authenticated;

revoke execute on function public.revoke_guardian_child_permission(uuid, uuid) from public;
revoke execute on function public.revoke_guardian_child_permission(uuid, uuid) from anon;
grant execute on function public.revoke_guardian_child_permission(uuid, uuid) to authenticated;

revoke execute on function public.record_guardian_authorization(uuid, text, text) from public;
revoke execute on function public.record_guardian_authorization(uuid, text, text) from anon;
grant execute on function public.record_guardian_authorization(uuid, text, text) to authenticated;

revoke execute on function public.withdraw_guardian_authorization(uuid) from public;
revoke execute on function public.withdraw_guardian_authorization(uuid) from anon;
grant execute on function public.withdraw_guardian_authorization(uuid) to authenticated;

revoke execute on function public.child_accounts_guard_status_transition() from public;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Additív, nem-destruktív migráció. Visszavonás esetén, EBBEN A
-- SORRENDBEN:
--
--   drop policy if exists "guardian_authorizations_select_owner_or_self" on public.guardian_authorizations;
--   drop policy if exists "guardian_child_permissions_select_owner_or_self" on public.guardian_child_permissions;
--   drop policy if exists "child_account_invitations_select_via_family_owner" on public.child_account_invitations;
--   drop policy if exists "child_accounts_select_self_or_family_owner" on public.child_accounts;
--
--   drop function if exists public.withdraw_guardian_authorization(uuid);
--   drop function if exists public.record_guardian_authorization(uuid, text, text);
--   drop function if exists public.revoke_guardian_child_permission(uuid, uuid);
--   drop function if exists public.upsert_guardian_child_permission(uuid, uuid, boolean, boolean, boolean, boolean, boolean);
--   drop function if exists public.revoke_child_account(uuid);
--   drop function if exists public.accept_child_account_invitation(text);
--   drop function if exists public.revoke_child_account_invitation(uuid);
--   drop function if exists public.create_child_account_invitation(uuid, integer);
--
--   drop table if exists public.guardian_authorizations;
--
--   drop trigger if exists guardian_child_permissions_set_updated_at on public.guardian_child_permissions;
--   drop table if exists public.guardian_child_permissions;
--
--   drop index if exists public.idx_child_account_invitations_one_pending_per_child;
--   drop table if exists public.child_account_invitations;
--
--   drop trigger if exists child_accounts_set_updated_at on public.child_accounts;
--   drop trigger if exists child_accounts_guard_status_transition on public.child_accounts;
--   drop function if exists public.child_accounts_guard_status_transition();
--   drop table if exists public.child_accounts;
--
-- Az EXECUTE grant/revoke állítások nem igényelnek külön rollbackot —
-- a function DROP automatikusan törli a hozzájuk tartozó
-- jogosultság-bejegyzéseket is.