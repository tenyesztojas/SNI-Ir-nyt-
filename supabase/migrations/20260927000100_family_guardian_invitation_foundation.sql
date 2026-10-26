-- VédettSarok — Family modul: Family Guardian Invitation DATABASE
-- FOUNDATION (3. modul, a Family DB foundation és a Child Account
-- Foundation után)
-- Dátum: 2026-09-27
--
-- CÉL: egyetlen új tábla + 4 SECURITY DEFINER RPC, amivel egy family
-- aktív ownerje egy másik felnőttet (leendő guardiant) e-mail-cím
-- alapján meghívhat a családjába, és a meghívott — SAJÁT, már
-- bejelentkezett VédettSarok sessionjével — elfogadhatja vagy
-- elutasíthatja azt.
--
-- Ez a migráció KIZÁRÓLAG a DB foundationt tartalmazza:
--   - 1 új tábla (family_guardian_invitations)
--   - RLS ezen a táblán
--   - 4 mutáló RPC (invite / revoke / accept / decline)
--
-- NINCS benne (SZÁNDÉKOSAN, a feladat explicit korlátozása szerint):
--   - UI (nincs Family UI módosítás, nincs GuardianPermissionsForm)
--   - email-küldés/notifikáció
--   - invitation token (lásd "TOKEN NÉLKÜLI DESIGN" szakasz lent)
--   - service_role használat, auth.users olvasás
--   - guardian_child_permissions módosítás vagy bármilyen automatikus
--     child-permission juttatás — lásd "FAMILY MEMBERSHIP !=
--     CHILD PERMISSION" szakasz lent
--   - a MEGLÉVŐ families/family_members/child_profiles/
--     family_children/guardian_child_permissions/
--     child_account_invitations struktúrák módosítása — ez a
--     migráció TISZTÁN additív, egyetlen meglévő táblát, RLS
--     policy-t, RPC-t vagy triggert sem érint.
--
-- Additív, idempotens migráció — biztonságosan újrafuttatható.
--
-- ────────────────────────────────────────────────────────────────
-- AUDIT — a meglévő struktúrák pontos, ellenőrzött állapota, amire
-- ez a migráció épül (READ-ONLY vizsgálat, forrás:
-- supabase/migrations/20260926_family_db_foundation.sql):
--
--   - public.families(id, name, created_by, created_at, updated_at)
--   - public.family_members(id, family_id, user_id, role, status,
--     created_at), UNIQUE (family_id, user_id), CHECK role IN
--     ('owner','guardian'), CHECK status IN
--     ('active','pending','revoked'). A protect_last_family_owner()
--     trigger BEFORE UPDATE/DELETE ezen a táblán garantálja, hogy
--     egy family soha nem maradhat aktív owner nélkül — ez a
--     migráció ezt NEM módosítja, és az itt bevezetett RPC-k SOSEM
--     hoznak létre/módosítanak owner sort, tehát a triggerrel nincs
--     ütközés (lásd 4.3 accept_family_guardian_invitation lent).
--   - public.is_family_owner(p_family_id uuid) — language sql,
--     stable, security definer, set search_path = public: TRUE, ha
--     auth.uid() ennek a familynek AKTÍV ('active' status) ÉS
--     'owner' role-ú tagja. Ez pontosan a megfelelő gate az invite/
--     revoke RPC-khez — nincs szükség új helperre.
--   - public.has_pilot_access(p_key text) — ugyanígy security
--     definer helper, a profiles.pilot_access tömböt nézi. Ezt a
--     "family_db_beta" kulccsal használjuk újra, MINT a meglévő
--     create_family_with_owner()/create_child_profile_for_family()
--     RPC-k — nincs új feature-flag mechanizmus.
--   - public.profiles-nak NINCS email oszlopa, és ez a migráció sem
--     ad hozzá ilyet — a recipiens identitását KIZÁRÓLAG a Supabase
--     Auth session claim-jei (auth.uid(), auth.email()) igazolják,
--     futásidőben, a hívó SAJÁT sessionjéből. Nincs auth.users
--     olvasás, nincs service_role, nincs admin API-hívás sehol ebben
--     a migrációban.
--
-- ────────────────────────────────────────────────────────────────
-- TOKEN NÉLKÜLI DESIGN (miért nincs itt invitation token, szemben a
-- child_account_invitations táblával):
--
-- A child_account_invitations tábla token/hash mechanizmusa azért
-- kellett, mert ELFOGADÁSKOR a gyermeknek MÉG NEM volt saját auth
-- identitása, amivel a jogosultságát bizonyítani tudta volna — a
-- birtokában lévő titok (token) ÖNMAGÁBAN igazolta a jogosultságot.
--
-- Ez a flow MÁSKÉNT működik: a recipiens elfogadáskor MÁR
-- bejelentkezett a SAJÁT VédettSarok accountjával. A jogosultságot
-- tehát nem egy titok birtoklása igazolja, hanem a session identitása
-- (auth.uid() + auth.email()) — pontosan úgy, mint minden más RLS
-- policy/RPC ebben a projektben. Emiatt itt SZÁNDÉKOSAN nincs
-- token/token_hash oszlop: nincs mit "plaintext reusable secret"-ként
-- védeni, mert nincs secret a rendszerben.
--
-- ────────────────────────────────────────────────────────────────
-- FAMILY MEMBERSHIP != CHILD PERMISSION (a legfontosabb biztonsági
-- elv, amit ez a migráció garantál):
--
-- Az accept_family_guardian_invitation() RPC KIZÁRÓLAG a
-- family_members táblát mutálja. NEM ír, NEM olvas, NEM referál a
-- guardian_child_permissions táblára. Nincs trigger ezen az új
-- táblán, ami a guardian_child_permissions táblát érintené. A
-- guardian_child_permissions minden boolean jog-oszlopa alapból FALSE
-- (lásd 20260927_child_account_foundation.sql), és — mivel ez a
-- migráció egyáltalán nem ír ebbe a táblába — egy frissen elfogadott
-- guardian a family_members aktiválása UTÁN is PONTOSAN NULLA
-- child-szintű jogosultsággal rendelkezik. A gyermekenkénti,
-- explicit jogosultság-adás továbbra is KIZÁRÓLAG a MEGLÉVŐ, ÁLTAL
-- EZ A MIGRÁCIÓ NEM MÓDOSÍTOTT upsert_guardian_child_permission()
-- RPC-n keresztül történhet, egy KÉSŐBBI (UI) lépésben.
--
-- ────────────────────────────────────────────────────────────────
-- NINCS is_admin() BYPASS ebben a migrációban (explicit termék-
-- döntés a felhasználótól, tudatosan eltérve a Family modul többi,
-- MÁR ÉLES tábláján használt "or public.is_admin()" mintától — ez
-- a migráció szándékosan a Child Account Foundation szigorúbb,
-- admin-bypass-mentes konvencióját követi).

-- ────────────────────────────────────────────────────────────────
-- 1. TABLE: family_guardian_invitations
-- ────────────────────────────────────────────────────────────────
create table if not exists public.family_guardian_invitations (
  id            uuid primary key default gen_random_uuid(),

  -- A meghívó family — ha a family törlődik, a meghívás-történet is
  -- értelmét veszti (ugyanaz a minta, mint family_children.family_id).
  family_id     uuid not null references public.families (id) on delete cascade,

  -- CSAK audit metadata (ki hívott meg) — a jogosultságot SOHA nem ez
  -- az oszlop dönti el, mindig a family_id + is_family_owner() a
  -- meghívás LÉTREHOZÁSAKOR (RPC-ben ellenőrizve). Nullable + SET
  -- NULL: a meghívó profilja bármikor törölhető anélkül, hogy a
  -- meghívás-audit sor törlődne — ugyanaz a pszeudonimizálható
  -- audit-retenciós minta, mint a child_account_invitations.created_by
  -- és a guardian_authorizations táblán.
  invited_by    uuid references public.profiles (id) on delete set null,

  -- MINDIG normalizált formában tárolva (lower(btrim(...))) — az
  -- RPC-k ezt garantálják beszúrás előtt, a lenti CHECK constraint
  -- pedig DB-szinten is kikényszeríti, hogy ne kerülhessen be
  -- nem-normalizált vagy üres érték, akkor sem, ha valaki egy jövőbeli
  -- kódváltozásban elfelejtené normalizálni.
  invited_email text not null,

  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),

  -- Fix MVP TTL: 168 óra (7 nap), az invite_family_guardian() RPC
  -- állítja be létrehozáskor — nincs DEFAULT itt, mert a pontos érték
  -- az RPC-ben, now()-hoz viszonyítva, futásidőben számítandó.
  expires_at    timestamptz not null,

  -- Recipiens válasza (accept VAGY decline) idejét rögzíti.
  responded_at  timestamptz,

  -- Owner általi visszavonás idejét rögzíti.
  revoked_at    timestamptz,

  created_at    timestamptz not null default now(),

  constraint family_guardian_invitations_email_not_blank
    check (btrim(invited_email) <> ''),

  -- Defenzív, DB-szintű kikényszerítés arra, hogy az email MINDIG
  -- teljesen normalizált (kisbetűs ÉS whitespace-mentes/trimelt)
  -- formában legyen tárolva — az RPC-k lower(btrim(...))-mel
  -- normalizálnak, ez a constraint pedig garantálja, hogy egy
  -- jövőbeli hibás módosítás se tudjon nem-normalizált (akár csak
  -- vezető/záró whitespace-t tartalmazó) sort beszúrni, ami a
  -- lower(invited_email) = lower(auth.email()) RLS/RPC egyezéseket
  -- megkerülhetővé tenné. Az "invited_email = lower(btrim(invited_email))"
  -- egyetlen kifejezés EGYSZERRE zárja ki: a nagybetűs karaktereket
  -- (lower() nem hagyná változatlanul), a vezető whitespace-t és a
  -- záró whitespace-t (btrim() egyiket sem hagyná változatlanul) — ha
  -- bármelyik jelen van, a bal és jobb oldal nem egyezik, a CHECK
  -- elbukik. Az üres string esetét külön, a fenti
  -- family_guardian_invitations_email_not_blank constraint zárja ki.
  constraint family_guardian_invitations_email_normalized
    check (invited_email = lower(btrim(invited_email)))
);

comment on table public.family_guardian_invitations is
  'Family-szintű guardian-meghívás e-mail-cím alapján. NEM tartalmaz tokent — az elfogadás jogosultságát a recipiens SAJÁT, már bejelentkezett Supabase session identitása (auth.uid()+auth.email()) igazolja, nem egy birtokolt titok. Elfogadás KIZÁRÓLAG guardian role-ú family_members sort hozhat létre/aktiválhat — semmilyen guardian_child_permissions jogosultságot NEM ad automatikusan.';
comment on column public.family_guardian_invitations.invited_email is
  'Mindig normalizált (lower(btrim(...))) formában tárolva — DB-szinten kikényszerítve a family_guardian_invitations_email_normalized CHECK constrainttel.';
comment on column public.family_guardian_invitations.status is
  'pending -> accepted | declined | revoked. A "expired" érték is használható, de NINCS cron/sweep job, amely automatikusan erre állítaná — a tényleges használhatóságot minden RPC/RLS mindig az expires_at > now() futásidejű feltétellel dönti el, a "expired" csak egy opcionális, jövőbeli, explicit UI-jelöléshez tartalék állapot.';

-- ────────────────────────────────────────────────────────────────
-- 2. RACE-SAFE GARANCIA: legfeljebb egy HASZNÁLHATÓ (pending)
--    meghívás ugyanarra a family_id + invited_email párra.
-- ────────────────────────────────────────────────────────────────
-- Ugyanaz a minta, mint a child_account_invitations
-- idx_child_account_invitations_one_pending_per_child indexénél: a
-- partial index predikátum nem hivatkozhat now()-ra/expires_at-ra
-- (nem immutable), ezért ez a VÉGSŐ, konkurenciabiztos garancia
-- független attól, hogy az invite_family_guardian() RPC saját maga
-- milyen előzetes ellenőrzést végez — ha két konkurens hívás mindkettő
-- eljutna az INSERT-ig, a második unique_violation hibát kap, amit az
-- RPC egy EXCEPTION blokkban egyértelmű, felhasználóbarát hibává
-- fordít (lásd 4.1).
create unique index if not exists idx_family_guardian_invitations_one_pending_per_family_email
  on public.family_guardian_invitations (family_id, invited_email)
  where status = 'pending';

-- ────────────────────────────────────────────────────────────────
-- 3. Indexek (owner-oldali és recipiens-oldali RLS/lookup támogatás)
-- ────────────────────────────────────────────────────────────────
create index if not exists idx_family_guardian_invitations_family_id
  on public.family_guardian_invitations (family_id);

create index if not exists idx_family_guardian_invitations_invited_email
  on public.family_guardian_invitations (invited_email);

-- ────────────────────────────────────────────────────────────────
-- 4. RPC-k
-- ────────────────────────────────────────────────────────────────

-- 4.1 invite_family_guardian ---------------------------------------
-- Owner-gated (is_family_owner) + family_db_beta hozzáférés. Az
-- e-mailt normalizálja (lower(btrim(...))), formailag validálja,
-- és blokkolja az önmagára szóló meghívást (a hívó — mivel owner,
-- tehát már a family aktív tagja — sosem hívhatja meg a SAJÁT
-- auth.email()-jét ugyanahhoz a familyhez; ez egyben lefedi a
-- "ha a hívó már aktív tagként szerepel ebben a familyben, ne
-- lehessen saját emailre invitationt létrehozni" követelményt is,
-- mert egy owner DEFINÍCIÓ SZERINT már aktív tagja a saját
-- familyjének). Fix 168 órás (7 napos) TTL. A "legfeljebb egy
-- használható pending meghívás" garanciát a 2. szakasz partial
-- unique indexe adja — ha már van pending sor ugyanarra a párra, ez
-- az INSERT unique_violationba futna, amit itt egyértelmű hibává
-- fordítunk (a meglévő pending meghívást előbb explicit revoke-olni
-- kell, lásd 4.2).
create or replace function public.invite_family_guardian(
  p_family_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_email text;
  v_expires_at timestamptz;
  v_invitation_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges családtag meghívásához';
  end if;

  if not public.has_pilot_access('family_db_beta') then
    raise exception 'family_db_beta hozzáférés szükséges családtag meghívásához';
  end if;

  if not public.is_family_owner(p_family_id) then
    raise exception 'Csak a family aktív ownerje hívhat meg új családtagot';
  end if;

  if p_email is null or btrim(p_email) = '' then
    raise exception 'E-mail-cím megadása kötelező';
  end if;

  v_email := lower(btrim(p_email));

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Érvénytelen e-mail-cím formátum';
  end if;

  -- Önmeghívás blokkolása. auth.email() a hívó SAJÁT, session-beli
  -- e-mail-címe — ha ez null (pl. telefonszám-alapú auth, nincs
  -- ismert email-claim), az összehasonlítás NULL-safe módon nem
  -- egyezik semmivel, tehát nem blokkol feleslegesen, de ez esetben
  -- a recipiens-oldali RPC-k (accept/decline) is elutasítanák a hívót
  -- (lower(auth.email()) = invited_email sosem lehet igaz NULL
  -- auth.email()-re) — konzisztens, fail-closed viselkedés.
  v_caller_email := auth.email();
  if v_caller_email is not null and v_email = lower(v_caller_email) then
    raise exception 'Nem hívhatod meg saját magadat családtagként';
  end if;

  v_expires_at := now() + interval '168 hours';

  begin
    insert into public.family_guardian_invitations (family_id, invited_by, invited_email, status, expires_at)
    values (p_family_id, v_uid, v_email, 'pending', v_expires_at)
    returning id into v_invitation_id;
  exception
    when unique_violation then
      raise exception 'Ehhez a családhoz és e-mail-címhez már létezik függő meghívás — vond vissza a meglévőt, mielőtt újat küldenél';
  end;

  return v_invitation_id;
end;
$$;

-- 4.2 revoke_family_guardian_invitation -----------------------------
-- Csak a meghívás mögötti family aktív ownerje hívhatja, és csak
-- pending állapotú meghívás vonható vissza. Az owner-ellenőrzés és a
-- status-guard EGYÜTT, egy atomikus UPDATE...WHERE-ben zárja ki a
-- race-eket (ha valaki közben elfogadta/elutasította, a WHERE 0 sort
-- érint, "not found" hibát kapunk, nem hagyjuk csendben "sikeresnek"
-- látszani a műveletet).
create or replace function public.revoke_family_guardian_invitation(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_family_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges a meghívás visszavonásához';
  end if;

  select family_id into v_family_id
  from public.family_guardian_invitations
  where id = p_invitation_id;

  if v_family_id is null then
    raise exception 'A meghívás nem található';
  end if;

  if not public.is_family_owner(v_family_id) then
    raise exception 'Csak a family aktív ownerje vonhatja vissza a meghívást';
  end if;

  update public.family_guardian_invitations
  set status = 'revoked', revoked_at = now()
  where id = p_invitation_id
    and status = 'pending';

  if not found then
    raise exception 'A meghívás már nem függő állapotú (elfogadva, elutasítva, visszavonva vagy lejárt) — nem vonható vissza';
  end if;
end;
$$;

-- 4.3 accept_family_guardian_invitation ------------------------------
-- KRITIKUS RPC. Két egymást követő, mindkettő ATOMIKUS lépésből áll,
-- EGYETLEN tranzakcióban (a function body a hívó tranzakciójában fut):
--
--   (a) Az invitation atomikus állapotváltása: egyetlen
--       UPDATE ... WHERE id=... AND status='pending' AND
--       expires_at > now() AND lower(invited_email) = lower(auth.email())
--       RETURNING family_id. Ez EGYSZERRE igazolja a jogosultságot
--       (csak a helyes e-mail-című, bejelentkezett recipiens hívása
--       találja meg a sort) ÉS zárja ki a race-eket: két konkurens
--       accept-kísérlet közül a Postgres sor-szintű lockolása miatt
--       csak az egyik láthatja a WHERE status='pending' feltételt
--       teljesülni — a másik 0 sort érint, v_family_id NULL marad,
--       "érvénytelen meghívás" hibát kap. Ugyanez a mechanizmus zárja
--       ki a lejárt, visszavont, elutasított vagy már elfogadott
--       meghívók újrafelhasználását — lásd a lenti explicit
--       teszt-forgatókönyveket.
--
--   (b) A family_members kapcsolat atomikus létrehozása/aktiválása
--       EGYETLEN INSERT ... ON CONFLICT (family_id, user_id) DO
--       UPDATE ... WHERE role = 'guardian' utasítással — lásd lent a
--       részletes indoklást.
--
-- A role SOHA nem paraméter — mindig a plpgsql kódban literális
-- 'guardian' string, tehát SEMMILYEN körülmények között (rossz input,
-- manipulált hívás, race) nem hozható létre/módosítható owner role
-- ezen az RPC-n keresztül.
create or replace function public.accept_family_guardian_invitation(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_email_norm text;
  v_family_id uuid;
  v_membership_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges a meghívás elfogadásához';
  end if;

  if v_email is null then
    raise exception 'A sessionedhez nincs ismert e-mail-cím rendelve, a meghívás emiatt nem fogadható el';
  end if;

  v_email_norm := lower(btrim(v_email));

  -- (a) Az invitation atomikus, race-safe állapotváltása — lásd fent
  -- a függvény-fejben a részletes indoklást.
  update public.family_guardian_invitations
  set status = 'accepted', responded_at = now()
  where id = p_invitation_id
    and status = 'pending'
    and expires_at > now()
    and invited_email = v_email_norm
  returning family_id into v_family_id;

  if v_family_id is null then
    raise exception 'Érvénytelen, lejárt, visszavont, elutasított vagy már elfogadott meghívás, vagy nem a hozzád tartozó e-mail-címre szól';
  end if;

  -- (b) family_members atomikus insert/reaktiválás.
  --
  -- MIÉRT ON CONFLICT DO UPDATE (nem SELECT-majd-branch): egy
  -- SELECT-then-INSERT/UPDATE minta egy check-then-act race window-t
  -- nyitna a family_members (family_id, user_id) UNIQUE constraintje
  -- körül. Az INSERT ... ON CONFLICT egyetlen atomikus statement,
  -- nincs ilyen ablak.
  --
  -- MIÉRT "WHERE role = 'guardian'" a DO UPDATE-en: ez a guard
  -- garantálja, hogy ez az RPC SOHA nem módosíthat egy meglévő OWNER
  -- family_members sort — ha a konfliktusban lévő sor role='owner'
  -- (elméleti eset: valaki már owner, és valamiért újra meghívták),
  -- a DO UPDATE guard hamis lesz, a sor NEM módosul, és a RETURNING
  -- NEM ad vissza sort ebben az ágban — ezt lent explicit kezeljük.
  --
  -- MIÉRT rendben van egy REVOKED vagy PENDING guardian sor
  -- reaktiválása: ha a konfliktusban lévő sor role='guardian' (bármely
  -- status: pending/revoked/active), ez az egyetlen másik megengedett
  -- role-érték a family_members CHECK constraintje szerint (role IN
  -- ('owner','guardian')) — tehát a WHERE role = 'guardian' guard
  -- KIZÁRÓLAG ezt az ágat engedi át. Ez a viselkedés SZÁNDÉKOS: ha egy
  -- owner korábban visszavont egy guardiant (status='revoked'), majd
  -- újra meghívja és a meghívott elfogadja, az elvárt eredmény az,
  -- hogy a guardian ismét aktív tagja legyen a családnak — nem egy
  -- örökre "beragadt" revoked állapot. A role-t a SET-ben EXPLICIT
  -- ismét 'guardian'-re állítjuk (redundáns a guarddal, de védelmi
  -- rétegben explicit és auditálható), tehát a reaktiválás SOHA nem
  -- eredményezhet owner role-t.
  --
  -- A protect_last_family_owner() trigger (lásd
  -- 20260926_family_db_foundation.sql) ezen a ponton NEM lép működésbe
  -- károsan: a trigger csak akkor blokkol, ha egy AKTÍV OWNER sor
  -- kerülne ki az owner/active állapotból — mivel ez az UPDATE-ág
  -- KIZÁRÓLAG már-is role='guardian' sorokat érhet el (a guard miatt),
  -- old.role sosem 'owner' itt, a trigger no-op marad.
  insert into public.family_members (family_id, user_id, role, status)
  values (v_family_id, v_uid, 'guardian', 'active')
  on conflict (family_id, user_id) do update
    set role = 'guardian', status = 'active'
    where public.family_members.role = 'guardian'
  returning id into v_membership_id;

  if v_membership_id is null then
    raise exception 'Ez a felhasználó már a family ownerje — a meghívás elfogadása nem módosíthatja az owner szerepkört';
  end if;
end;
$$;

-- 4.4 decline_family_guardian_invitation ------------------------------
-- Szimmetrikus az accepttel: egyetlen atomikus UPDATE...WHERE, amely
-- EGYSZERRE igazolja a jogosultságot (csak a helyes e-mail-című,
-- bejelentkezett recipiens találja meg a sort) és zárja ki a race-eket
-- — nincs family_members hatás, csak az invitation állapota változik.
create or replace function public.decline_family_guardian_invitation(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_email_norm text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges a meghívás elutasításához';
  end if;

  if v_email is null then
    raise exception 'A sessionedhez nincs ismert e-mail-cím rendelve, a meghívás emiatt nem utasítható el';
  end if;

  v_email_norm := lower(btrim(v_email));

  update public.family_guardian_invitations
  set status = 'declined', responded_at = now()
  where id = p_invitation_id
    and status = 'pending'
    and expires_at > now()
    and invited_email = v_email_norm
  returning id into v_id;

  if v_id is null then
    raise exception 'Érvénytelen, lejárt vagy már megválaszolt meghívás, vagy nem a hozzád tartozó e-mail-címre szól';
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 5. SECURITY DEFINER function EXECUTE jogosultságok
-- ────────────────────────────────────────────────────────────────
-- Mind a 4 mutáló RPC: explicit REVOKE FROM PUBLIC, explicit REVOKE
-- FROM anon (nem csak feltételezve, hogy a PUBLIC revoke lefedi az
-- anon-t — lásd a Child Account Foundation production incidensét),
-- explicit GRANT TO authenticated. Nincs direkt table mutation
-- permission (nincs INSERT/UPDATE/DELETE policy a táblán, lásd 6.
-- szakasz) — minden mutáció KIZÁRÓLAG ezen az RPC-rétegen keresztül.
revoke execute on function public.invite_family_guardian(uuid, text) from public;
revoke execute on function public.invite_family_guardian(uuid, text) from anon;
grant execute on function public.invite_family_guardian(uuid, text) to authenticated;

revoke execute on function public.revoke_family_guardian_invitation(uuid) from public;
revoke execute on function public.revoke_family_guardian_invitation(uuid) from anon;
grant execute on function public.revoke_family_guardian_invitation(uuid) to authenticated;

revoke execute on function public.accept_family_guardian_invitation(uuid) from public;
revoke execute on function public.accept_family_guardian_invitation(uuid) from anon;
grant execute on function public.accept_family_guardian_invitation(uuid) to authenticated;

revoke execute on function public.decline_family_guardian_invitation(uuid) from public;
revoke execute on function public.decline_family_guardian_invitation(uuid) from anon;
grant execute on function public.decline_family_guardian_invitation(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────
-- 6. RLS engedélyezése
-- ────────────────────────────────────────────────────────────────
alter table public.family_guardian_invitations enable row level security;

-- Szándékosan NINCS INSERT/UPDATE/DELETE policy ezen a táblán — minden
-- mutáció (létrehozás, visszavonás, elfogadás, elutasítás) KIZÁRÓLAG
-- a 4 SECURITY DEFINER RPC-n keresztül történhet, amelyek RLS-t
-- megkerülve, saját maguk ellenőrzik a jogosultságot. Egy direkt
-- INSERT/UPDATE/DELETE policy csak megkerülhetővé tenné ezt az
-- atomicitást (pl. egy kliens direkt UPDATE-tel status='accepted'-re
-- állíthatná a sort family_members insert nélkül) — ugyanaz a minta,
-- mint a child_account_invitations táblán.
--
-- Az egyetlen SELECT policy default-deny: egy authenticated user
-- KIZÁRÓLAG a saját familyjéhez tartozó (owner-ként) VAGY a saját
-- e-mail-címére szóló (recipiensként) sorokat láthatja. NINCS
-- is_admin() bypass (explicit termékdöntés, lásd a fájl fejét).
drop policy if exists "family_guardian_invitations_select_owner_or_recipient" on public.family_guardian_invitations;
create policy "family_guardian_invitations_select_owner_or_recipient"
  on public.family_guardian_invitations for select
  using (
    public.is_family_owner(family_id)
    or lower(invited_email) = lower(auth.email())
  );

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Additív, nem-destruktív migráció. Visszavonás esetén, EBBEN A
-- SORRENDBEN:
--
--   drop policy if exists "family_guardian_invitations_select_owner_or_recipient" on public.family_guardian_invitations;
--   drop function if exists public.decline_family_guardian_invitation(uuid);
--   drop function if exists public.accept_family_guardian_invitation(uuid);
--   drop function if exists public.revoke_family_guardian_invitation(uuid);
--   drop function if exists public.invite_family_guardian(uuid, text);
--   drop index if exists public.idx_family_guardian_invitations_invited_email;
--   drop index if exists public.idx_family_guardian_invitations_family_id;
--   drop index if exists public.idx_family_guardian_invitations_one_pending_per_family_email;
--   drop table if exists public.family_guardian_invitations;
--
-- Az EXECUTE grant/revoke állítások (5. szakasz) nem igényelnek külön
-- rollbackot — a function DROP automatikusan törli a hozzájuk tartozó
-- jogosultság-bejegyzéseket is.
