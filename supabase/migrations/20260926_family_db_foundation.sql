-- VédettSarok — Family modul: DB foundation (2. modul)
-- Dátum: 2026-09-26 (frissítve: célzott korrekció, ugyanezen a napon)
--
-- CÉL: a Family rendszer adatbázis-alapjának létrehozása úgy, hogy
-- productionbe deployolható legyen, de normál felhasználóknak MÉG NE
-- legyen elérhető.
--
-- Ez a migráció KIZÁRÓLAG a következőket tartalmazza:
--   - DB schema (families, family_members, child_profiles, family_children)
--   - RLS minden új táblán
--   - family feature flag (a MEGLÉVŐ profiles.pilot_access mechanizmus
--     újrahasználásával, "family_db_beta" kulccsal — NEM új feature_flags
--     tábla)
--   - minimális DB-validáció (CHECK constraintek)
--   - a kritikus bootstrap-probléma megoldása (lásd "BOOTSTRAP" szakasz)
--   - az utolsó aktív owner védelme (lásd "UTOLSÓ OWNER VÉDELME" szakasz)
--   - atomi child_profile + family_children létrehozás RPC-n keresztül
--     (lásd "CHILD BOOTSTRAP" szakasz)
--
-- NINCS benne: UI, API route, Napirend, child login, GPS/Journey/Kísérő
-- mód, subscription, email-meghívás. Ezeket KÜLÖN, additív migráció(k)
-- fogják hozzáadni egy későbbi modulban.
--
-- Additív, idempotens migráció — nem módosít és nem töröl meglévő
-- táblát/oszlopot/adatot. Biztonságosan újrafuttatható.
--
-- FONTOS: ez a fájl SZÁNDÉKOSAN NINCS automatikusan alkalmazva a remote
-- adatbázisra — csak létrehozva és auditálva. Kézi `supabase db push`
-- (vagy a projekt szokásos migrációs folyamata) szükséges az
-- alkalmazásához, egy erre jogosult ember jóváhagyásával.
--
-- AUDIT ELŐZMÉNY (a korábbi READ-ONLY DB audit alapján):
--   - `public.profiles.id` = `auth.users.id` (FK, cascade), `role`
--     (`user`/`admin`), `public.is_admin()` security definer helper.
--   - `public.profiles.pilot_access text[]` a meglévő, 3+ modulhoz már
--     használt pilot/feature-flag mechanizmus, self-escalation trigger
--     által védve (`prevent_pilot_access_self_escalation()`,
--     lásd 20260909_vedett_route_beta_access.sql) — ez MINDEN
--     pilot_access kulcsra vonatkozik, tehát az itt bevezetett
--     "family_db_beta" kulcsot is automatikusan védi, módosítás nélkül.
--   - `public.set_updated_at()` a meglévő updated_at trigger helper —
--     ez a migráció ezt használja újra, nem hoz létre duplikátumot.
--   - Nincs meglévő family/guardian/child_profile jellegű schema; a
--     `job_family_*` táblák (Védett Karrier modul) más domain, nincs
--     névütközés.

create extension if not exists pgcrypto;

-- ────────────────────────────────────────────────────────────────
-- 1. TABLE: families
-- ────────────────────────────────────────────────────────────────
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  -- created_by CSAK audit metadata (ki hozta létre) — a family
  -- tulajdonjogát/jogosultságát KIZÁRÓLAG a family_members tábla
  -- (role='owner', status='active') kezeli, nem ez az oszlop. Ezért
  -- nullable és "on delete set null": a létrehozó profil bármikor
  -- törölhető anélkül, hogy a family rekord törlődne vagy a profil
  -- törlése blokkolva lenne — csak az audit-nyom nullázódik.
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- 2. TABLE: family_members
-- ────────────────────────────────────────────────────────────────
create table if not exists public.family_members (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('owner', 'guardian')),
  status      text not null default 'active' check (status in ('active', 'pending', 'revoked')),
  created_at  timestamptz not null default now(),
  unique (family_id, user_id)
);

-- ────────────────────────────────────────────────────────────────
-- 3. TABLE: child_profiles
-- ────────────────────────────────────────────────────────────────
-- FONTOS: a child_profile NEM auth user — nincs saját bejelentkezése,
-- nincs auth.users kapcsolata. Szándékosan NEM tartalmaz emailt,
-- diagnózist, TAJ-t, címet, GPS-adatot, iskolát, nemet, teljes
-- születési dátumot, sem linked auth usert.
create table if not exists public.child_profiles (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null,
  -- birth_year: egyszerű, IDŐFÜGGETLEN (stabil) CHECK constraint, ami
  -- csak a nyilvánvalóan hibás értékeket szűri ki (pl. negatív szám,
  -- elgépelés) — NEM használ now()/current-year kiértékelést, tehát
  -- nem igényel éves migrációt, és a constraint kiértékelése minden
  -- soron mindig ugyanazt az eredményt adja. A pontos "nem lehet
  -- jövőbeli év" validáció alkalmazás/RPC szinten történik (lásd
  -- create_child_profile_for_family()), ahol az mindig a hívás
  -- pillanatának aktuális évéhez viszonyítva, futásidőben ellenőrzött.
  birth_year  integer check (birth_year is null or (birth_year >= 1900 and birth_year <= 2200)),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- 4. TABLE: family_children
-- ────────────────────────────────────────────────────────────────
create table if not exists public.family_children (
  family_id   uuid not null references public.families (id) on delete cascade,
  child_id    uuid not null references public.child_profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (family_id, child_id)
);

-- ────────────────────────────────────────────────────────────────
-- 5. updated_at triggerek (meglévő public.set_updated_at() helper —
--    NEM duplikált függvény)
-- ────────────────────────────────────────────────────────────────
drop trigger if exists families_set_updated_at on public.families;
create trigger families_set_updated_at before update on public.families
  for each row execute function public.set_updated_at();

drop trigger if exists child_profiles_set_updated_at on public.child_profiles;
create trigger child_profiles_set_updated_at before update on public.child_profiles
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 6. Indexek (csak az RLS/join szempontból indokoltak)
-- ────────────────────────────────────────────────────────────────
create index if not exists idx_family_members_family_id on public.family_members (family_id);
create index if not exists idx_family_members_user_id   on public.family_members (user_id);
create index if not exists idx_family_children_child_id on public.family_children (child_id);

-- ────────────────────────────────────────────────────────────────
-- 7. SECURITY DEFINER helper függvények
-- ────────────────────────────────────────────────────────────────
-- Cél: elkerülni az RLS rekurziót. A family_members SELECT policy nem
-- hivatkozhat biztonságosan/egyszerűen közvetlenül a family_members
-- táblára egy tetszőleges beágyazott subquery-n keresztül más táblák
-- policyjaiban anélkül, hogy a policy-kiértékelés bonyolulttá/lassúvá
-- vagy (bizonyos mintáknál) körkörössé válna — ehelyett ezek a szűk
-- célú, security definer helperek RLS-t megkerülve, egyetlen konkrét
-- kérdésre válaszolnak, és NEM adnak általános adat-hozzáférést.

create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

create or replace function public.is_family_owner(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = auth.uid()
      and fm.role = 'owner'
      and fm.status = 'active'
  );
$$;

-- Általános célú pilot/feature-flag ellenőrző helper a MEGLÉVŐ
-- profiles.pilot_access tömb alapján (nem csak family_db_beta-hoz —
-- bármely jövőbeli pilot modul RLS policy-ja újrahasználhatja).
create or replace function public.has_pilot_access(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.pilot_access @> array[p_key]
  );
$$;

-- ────────────────────────────────────────────────────────────────
-- 8. KRITIKUS BOOTSTRAP: family + első owner biztonságos, atomi
--    létrehozása
-- ────────────────────────────────────────────────────────────────
-- Probléma: a families INSERT policy family_db_beta hozzáférést kér,
-- a family_members INSERT policy pedig aktív owner tagságot kér — de
-- egy most létrehozott familyhez még nincs owner tagság, tehát a
-- creator RLS miatt nem tudná önmagát ownerként hozzáadni. Ez a
-- security definer RPC egyetlen tranzakcióban (function body = egy
-- tranzakció) végzi el mindkét insertet, RLS-t megkerülve, csak a
-- szükséges két sorra szűkítve — NEM épít általános family service
-- réteget.
create or replace function public.create_family_with_owner(p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_uid       uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges family létrehozásához';
  end if;

  if not public.has_pilot_access('family_db_beta') and not public.is_admin() then
    raise exception 'family_db_beta hozzáférés szükséges a family létrehozásához';
  end if;

  insert into public.families (name, created_by)
  values (p_name, v_uid)
  returning id into v_family_id;

  insert into public.family_members (family_id, user_id, role, status)
  values (v_family_id, v_uid, 'owner', 'active');

  return v_family_id;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 9. UTOLSÓ OWNER VÉDELME (DB-szintű invariáns)
-- ────────────────────────────────────────────────────────────────
-- Cél: egy family SOHA nem maradhat aktív owner nélkül a
-- family_members táblán végzett UPDATE vagy DELETE miatt. Védett
-- esetek: (1) az utolsó aktív owner sorának törlése; (2) az utolsó
-- aktív owner role-jának 'guardian'-re állítása; (3) az utolsó aktív
-- owner statusának 'active'-ról 'pending'/'revoked'-ra állítása. Ha
-- egynél több aktív owner van, bármelyikük módosítása/törlése
-- továbbra is szabadon megengedett — a trigger csak azt az egy
-- műveletet blokkolja, ami 0 aktív ownerre csökkentené a családot.
-- Minimális, szűk célú megoldás — nem general permission framework.
create or replace function public.protect_last_family_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_active_owner boolean;
  v_still_active_owner boolean;
  v_other_active_owner_exists boolean;
begin
  v_was_active_owner := (old.role = 'owner' and old.status = 'active');

  if tg_op = 'DELETE' then
    v_still_active_owner := false;
  else
    v_still_active_owner := (new.role = 'owner' and new.status = 'active');
  end if;

  if v_was_active_owner and not v_still_active_owner then
    select exists (
      select 1
      from public.family_members fm
      where fm.family_id = old.family_id
        and fm.role = 'owner'
        and fm.status = 'active'
        and fm.id <> old.id
    ) into v_other_active_owner_exists;

    if not v_other_active_owner_exists then
      raise exception
        'Egy family nem maradhat aktív owner nélkül — ez az utolsó aktív owner, a művelet blokkolva (family_id=%)',
        old.family_id;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

drop trigger if exists family_members_protect_last_owner on public.family_members;
create trigger family_members_protect_last_owner
  before update or delete on public.family_members
  for each row execute function public.protect_last_family_owner();

-- ────────────────────────────────────────────────────────────────
-- 10. CHILD BOOTSTRAP: child_profile + family_children atomi
--     létrehozása
-- ────────────────────────────────────────────────────────────────
-- Cél: a child_profiles insert + a family_children kapcsolat-insert
-- NE két külön kliensoldali hívás legyen (ami inkonzisztens
-- köztes állapotot hagyhatna: child_profile létrejön, de sosincs
-- családhoz kapcsolva, vagy fordítva). Ez a security definer RPC
-- egyetlen tranzakcióban (function body) végzi el mindkét insertet.
-- Szűk célú — NEM épít általános child/family service réteget.
create or replace function public.create_child_profile_for_family(
  p_family_id uuid,
  p_first_name text,
  p_birth_year integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_child_id  uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges child_profile létrehozásához';
  end if;

  if not public.has_pilot_access('family_db_beta') and not public.is_admin() then
    raise exception 'family_db_beta hozzáférés szükséges child_profile létrehozásához';
  end if;

  if not public.is_family_owner(p_family_id) and not public.is_admin() then
    raise exception 'Csak az adott family aktív ownerje (vagy admin) hozhat létre child_profile-t';
  end if;

  if p_first_name is null or btrim(p_first_name) = '' then
    raise exception 'first_name megadása kötelező';
  end if;

  -- A pontos "nem lehet jövőbeli év" validáció itt, futásidőben,
  -- a hívás pillanatának aktuális évéhez viszonyítva történik — NEM
  -- a child_profiles tábla CHECK constraintjében (lásd ott a
  -- birth_year megjegyzést).
  if p_birth_year is not null and p_birth_year > extract(year from now())::int then
    raise exception 'birth_year nem lehet jövőbeli év';
  end if;

  insert into public.child_profiles (first_name, birth_year, created_by)
  values (p_first_name, p_birth_year, v_uid)
  returning id into v_child_id;

  insert into public.family_children (family_id, child_id)
  values (p_family_id, v_child_id);

  return v_child_id;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 11. SECURITY DEFINER function EXECUTE jogosultságok
-- ────────────────────────────────────────────────────────────────
-- A privilegizált/mutáló RPC-k (family + child létrehozás) NE legyenek
-- indokolatlanul PUBLIC (= minden role, anon-t is beleértve) számára
-- végrehajthatók — a projekt Supabase-konvenciója szerint ilyen
-- esetben az EXECUTE explicit "authenticated"-re szűkül. A három
-- olvasás-jellegű, RLS policy-kban használt helper (is_family_member,
-- is_family_owner, has_pilot_access) viszont MEGMARAD PUBLIC-nak,
-- ugyanúgy, mint a meglévő public.is_admin() — ezeket a Postgres a
-- policy-kiértékelés során a lekérdező szerepkör (anon/authenticated)
-- nevében hívja meg, tehát ha ez nincs végrehajtható, minden RLS
-- kiértékelés hibával elbukna (nem csak szűkebb hozzáférést adna).
-- Önmagukban egyébként sem szivárogtatnak adatot: kizárólag a hívó
-- SAJÁT auth.uid()-jéhez kötött boolean választ adnak vissza.
revoke execute on function public.create_family_with_owner(text) from public;
grant execute on function public.create_family_with_owner(text) to authenticated;

revoke execute on function public.create_child_profile_for_family(uuid, text, integer) from public;
grant execute on function public.create_child_profile_for_family(uuid, text, integer) to authenticated;

-- protect_last_family_owner() kizárólag trigger-kontextusban hívható
-- (OLD/NEW sor nélkül Postgres hibát dob rá) — direkt klienshívásra
-- nincs mód, de a defenzív tisztaság kedvéért erről is levesszük a
-- PUBLIC EXECUTE-ot.
revoke execute on function public.protect_last_family_owner() from public;

-- ────────────────────────────────────────────────────────────────
-- 12. RLS engedélyezése
-- ────────────────────────────────────────────────────────────────
alter table public.families        enable row level security;
alter table public.family_members  enable row level security;
alter table public.child_profiles  enable row level security;
alter table public.family_children enable row level security;

-- families ------------------------------------------------------
drop policy if exists "families_select_member_or_admin" on public.families;
create policy "families_select_member_or_admin"
  on public.families for select
  using (public.is_family_member(id) or public.is_admin());

drop policy if exists "families_update_owner_or_admin" on public.families;
create policy "families_update_owner_or_admin"
  on public.families for update
  using (public.is_family_owner(id) or public.is_admin());

drop policy if exists "families_delete_owner_or_admin" on public.families;
create policy "families_delete_owner_or_admin"
  on public.families for delete
  using (public.is_family_owner(id) or public.is_admin());

-- Direkt INSERT csak family_db_beta hozzáféréssel — a normál flow a
-- create_family_with_owner() RPC-n megy (security definer, ezt a
-- policyt is tiszteletben tartja, mert created_by = auth.uid() marad).
drop policy if exists "families_insert_beta_or_admin" on public.families;
create policy "families_insert_beta_or_admin"
  on public.families for insert
  with check (
    auth.uid() is not null
    and created_by = auth.uid()
    and (public.has_pilot_access('family_db_beta') or public.is_admin())
  );

-- family_members --------------------------------------------------
drop policy if exists "family_members_select_active_member_or_admin" on public.family_members;
create policy "family_members_select_active_member_or_admin"
  on public.family_members for select
  using (public.is_family_member(family_id) or public.is_admin());

drop policy if exists "family_members_insert_owner_or_admin" on public.family_members;
create policy "family_members_insert_owner_or_admin"
  on public.family_members for insert
  with check (public.is_family_owner(family_id) or public.is_admin());

drop policy if exists "family_members_update_owner_or_admin" on public.family_members;
create policy "family_members_update_owner_or_admin"
  on public.family_members for update
  using (public.is_family_owner(family_id) or public.is_admin());

drop policy if exists "family_members_delete_owner_or_admin" on public.family_members;
create policy "family_members_delete_owner_or_admin"
  on public.family_members for delete
  using (public.is_family_owner(family_id) or public.is_admin());

-- child_profiles ----------------------------------------------------
-- FONTOS: SOHA nem auth.uid() = id, mert a child_profile nem auth user
-- — a hozzáférés mindig a family_children kapcsolaton keresztüli
-- családi tagságon alapul.
drop policy if exists "child_profiles_select_via_family" on public.child_profiles;
create policy "child_profiles_select_via_family"
  on public.child_profiles for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.family_children fc
      where fc.child_id = child_profiles.id
        and public.is_family_member(fc.family_id)
    )
  );

drop policy if exists "child_profiles_update_via_family_owner" on public.child_profiles;
create policy "child_profiles_update_via_family_owner"
  on public.child_profiles for update
  using (
    public.is_admin()
    or exists (
      select 1 from public.family_children fc
      where fc.child_id = child_profiles.id
        and public.is_family_owner(fc.family_id)
    )
  );

drop policy if exists "child_profiles_delete_via_family_owner" on public.child_profiles;
create policy "child_profiles_delete_via_family_owner"
  on public.child_profiles for delete
  using (
    public.is_admin()
    or exists (
      select 1 from public.family_children fc
      where fc.child_id = child_profiles.id
        and public.is_family_owner(fc.family_id)
    )
  );

-- Szándékosan NINCS közvetlen kliensoldali INSERT policy a
-- child_profiles táblán. A normál (és egyetlen legitim) létrehozási
-- út a public.create_child_profile_for_family() SECURITY DEFINER RPC,
-- amely egy tranzakcióban végzi a child_profiles + family_children
-- insertet, és saját maga ellenőrzi a family_db_beta hozzáférést +
-- az aktív owner tagságot (lásd ott). Egy külön direkt INSERT policy
-- csak megkerülhetővé tenné ezt az atomicitást és a jogosultság-
-- ellenőrzést, ezért nem készül — ha admin-eszközön keresztül mégis
-- szükség lenne rá, azt a service_role kulcs (ami mindig megkerüli az
-- RLS-t) már ma is lefedi, új policy nélkül.

-- family_children ----------------------------------------------------
drop policy if exists "family_children_select_via_membership" on public.family_children;
create policy "family_children_select_via_membership"
  on public.family_children for select
  using (public.is_family_member(family_id) or public.is_admin());

drop policy if exists "family_children_insert_owner_or_admin" on public.family_children;
create policy "family_children_insert_owner_or_admin"
  on public.family_children for insert
  with check (public.is_family_owner(family_id) or public.is_admin());

drop policy if exists "family_children_delete_owner_or_admin" on public.family_children;
create policy "family_children_delete_owner_or_admin"
  on public.family_children for delete
  using (public.is_family_owner(family_id) or public.is_admin());

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Ez a migráció additív és nem-destruktív (nem módosít, nem töröl
-- meglévő táblát/oszlopot/adatot). Visszavonás esetén, EBBEN A
-- SORRENDBEN:
--
--   drop policy if exists "family_children_delete_owner_or_admin" on public.family_children;
--   drop policy if exists "family_children_insert_owner_or_admin" on public.family_children;
--   drop policy if exists "family_children_select_via_membership" on public.family_children;
--   drop policy if exists "child_profiles_delete_via_family_owner" on public.child_profiles;
--   drop policy if exists "child_profiles_update_via_family_owner" on public.child_profiles;
--   drop policy if exists "child_profiles_select_via_family" on public.child_profiles;
--   drop policy if exists "family_members_delete_owner_or_admin" on public.family_members;
--   drop policy if exists "family_members_update_owner_or_admin" on public.family_members;
--   drop policy if exists "family_members_insert_owner_or_admin" on public.family_members;
--   drop policy if exists "family_members_select_active_member_or_admin" on public.family_members;
--   drop policy if exists "families_insert_beta_or_admin" on public.families;
--   drop policy if exists "families_delete_owner_or_admin" on public.families;
--   drop policy if exists "families_update_owner_or_admin" on public.families;
--   drop policy if exists "families_select_member_or_admin" on public.families;
--   drop function if exists public.create_child_profile_for_family(uuid, text, integer);
--   drop trigger if exists family_members_protect_last_owner on public.family_members;
--   drop function if exists public.protect_last_family_owner();
--   drop function if exists public.create_family_with_owner(text);
--   drop function if exists public.has_pilot_access(text);
--   drop function if exists public.is_family_owner(uuid);
--   drop function if exists public.is_family_member(uuid);
--   drop trigger if exists child_profiles_set_updated_at on public.child_profiles;
--   drop trigger if exists families_set_updated_at on public.families;
--   drop table if exists public.family_children;
--   drop table if exists public.child_profiles;
--   drop table if exists public.family_members;
--   drop table if exists public.families;
--
-- A "family_db_beta" pilot_access kulcs a MEGLÉVŐ profiles.pilot_access
-- oszlopban tárolódik, nem hoz létre új oszlopot/táblát — visszavonáskor
-- nincs mit dropolni ezért, csak a felhasználók pilot_access tömbjéből
-- eltávolítandó a kulcs (admin UI-n vagy SQL-lel), ha szükséges.
-- Az EXECUTE grant/revoke állítások (11. szakasz) nem igényelnek külön
-- rollbackot — a function DROP automatikusan törli a hozzájuk tartozó
-- jogosultság-bejegyzéseket is.
