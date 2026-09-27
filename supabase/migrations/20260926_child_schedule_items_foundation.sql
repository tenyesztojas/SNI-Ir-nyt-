-- VédettSarok — Napirend (child_schedule_items) DB foundation.
-- Dátum: 2026-09-26 (frissítve: célzott korrekció, production előtti
-- review alapján, ugyanezen a napon — koordinátapár-constraint,
-- days_of_week normalizálás/validáció, idő-mezők szemantikájának
-- dokumentálása)
--
-- CÉL: egy child_profile-hoz ismétlődő vagy egyszeri napirendi
-- eseményeket lehessen tárolni (pl. "Úszás, kedd/csütörtök, 16:00,
-- érkezési célidő 15:50, indulási hely: Iskola, cél: Uszoda").
--
-- Ez a migráció KIZÁRÓLAG a következőket tartalmazza:
--   - DB schema (public.child_schedule_items)
--   - RLS
--   - DB-szintű CHECK-validáció
--   - create_child_schedule_item / update_child_schedule_item RPC
--   - indexek, updated_at trigger
--
-- NINCS benne: UI, push notification, GPS, child auth, journey
-- session, Védett Útvonal integráció, indulási idő számítás. A
-- koordináta- és timezone-mezők azért kerülnek be MOST, hogy a
-- KÉSŐBBI (itt NEM implementált) rendszer ezekből tudjon majd
-- indulási időt számolni, push-t küldeni, Védett Útvonalat indítani
-- és journey sessiont létrehozni — ez a fájl csak az adatmodellt adja
-- hozzá, semmilyen fenti logikát nem futtat.
--
-- Additív, idempotens migráció — nem módosít és nem töröl meglévő
-- táblát/oszlopot/adatot, és NEM módosítja a MEGLÉVŐ
-- supabase/migrations/20260926_family_db_foundation.sql fájlt.
--
-- FONTOS: ez a fájl SZÁNDÉKOSAN NINCS automatikusan alkalmazva a remote
-- adatbázisra — csak létrehozva és auditálva. Kézi `supabase db push`
-- (vagy a projekt szokásos migrációs folyamata) szükséges az
-- alkalmazásához, egy erre jogosult ember jóváhagyásával.
--
-- ARCHITEKTURÁLIS MEGJEGYZÉS (natív app-kompatibilitás): ez az
-- adatmodell semmilyen böngésző-specifikus működéshez nincs kötve —
-- csak sima uuid/text/date/time/smallint[]/double precision
-- oszlopok, security definer RPC-k és RLS, tehát natív iOS/Android
-- kliensből (Supabase mobil SDK-n vagy sima REST/RPC hívásokon
-- keresztül) ugyanúgy használható, mint webről.
--
-- AUDIT ELŐZMÉNY (a MEGLÉVŐ Family DB foundation alapján, lásd
-- supabase/migrations/20260926_family_db_foundation.sql):
--   - `public.child_profiles` NEM auth user, `public.family_children`
--     a family<->child kapcsoló tábla (family_id, child_id).
--   - `public.is_family_member(p_family_id uuid)` /
--     `public.is_family_owner(p_family_id uuid)` — security definer
--     helperek, RLS-rekurzió elkerülésére. Ez a migráció EZEKET
--     újrahasználja (nem duplikálja), és rájuk épülő, child-szintű
--     helpereket ad hozzá (lásd lent), mivel a schedule item a
--     child_id-hez kötődik, nem közvetlenül family_id-hez.
--   - `public.has_pilot_access(p_key text)` — a `profiles.pilot_access`
--     alapú generikus feature-flag helper, itt is a `family_db_beta`
--     kulccsal újrahasználva.
--   - `public.is_admin()`, `public.set_updated_at()` — MEGLÉVŐ, tovább
--     újrahasznált helperek.
--
-- FRISSÍTVE (2026-09-26, ugyanezen a napon, második célzott
-- korrekció, production apply ELŐTT): production preflight lekérdezés
-- (duplikált child_id keresése a public.family_children táblában,
-- family_id szerint csoportosítva) "Success. No rows returned"
-- eredménnyel zárult — jelenleg NINCS olyan production child_profile,
-- amely egynél több familyhez lenne kapcsolva. Ez alapján az
-- adatmodell mostantól VÉGLEGESEN, DB-szinten is kikényszeríti, hogy
-- 1 child_profile pontosan 1 familyhez tartozzon (lásd lent, 0.
-- szakasz). Ez a döntés a MEGLÉVŐ public.family_children táblát
-- (amelyet a supabase/migrations/20260926_family_db_foundation.sql
-- hozott létre) egy ÚJ UNIQUE constraint-tel bővíti — magát a
-- family_children táblát vagy a family_db_foundation migrációs fájlt
-- EZ A FÁJL NEM módosítja, a bővítés kizárólag itt, egy külön ALTER
-- TABLE utasítással történik.

-- ────────────────────────────────────────────────────────────────
-- 0. INVARIÁNS: 1 child_profile = pontosan 1 family
-- ────────────────────────────────────────────────────────────────
-- Üzleti szabály: egy gyermekprofil (child_profiles sor) mindig
-- PONTOSAN egy familyhez tartozik. Több szülő/gondviselő esetét (pl.
-- elvált/külön élő szülők) NEM több family létrehozásával kezeljük,
-- hanem úgy, hogy mindegyikük saját family_members sorral tagja
-- UGYANANNAK az egy familynek (owner/guardian role-lal).
--
-- Ezt a szabályt eddig (a Family DB foundation eredeti migrációjában)
-- csak a PRIMARY KEY (family_id, child_id) biztosította a
-- family_children táblán, ami KIZÁRTA a duplikált (family_id,
-- child_id) sorpárt, de NEM zárta ki, hogy UGYANAZ a child_id TÖBB
-- KÜLÖNBÖZŐ family_id-hez is kapcsolódjon (több sor, különböző
-- family_id, azonos child_id). Ez a szakasz ezt a hiányzó invariánst
-- zárja le DB-szinten egy UNIQUE(child_id) constrainttel — a MEGLÉVŐ
-- PRIMARY KEY (family_id, child_id) TOVÁBBRA IS megmarad, adatot nem
-- töröl és meglévő family/child kapcsolatot nem módosít.
--
-- Sorrend: ez a constraint SZÁNDÉKOSAN a fájl LEGELSŐ végrehajtott
-- utasítása (megelőzi a lenti child_schedule_items táblát, RLS-t és
-- RPC-ket), mert a Napirend RLS-helperek
-- (is_child_family_member/is_child_family_owner, lásd 4. szakasz) és
-- RPC-k a family_children (family_id, child_id) kapcsolatot úgy
-- olvassák, hogy egy child_id-hez legfeljebb egy family_id tartozhat
-- — ez az invariáns tehát a rá épülő logika ELŐTT kerül létrehozásra.
--
-- Idempotencia: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT pár, a
-- fájl többi részéhez hasonló stílusban.
--
-- KOCKÁZAT/PREFLIGHT: ez a constraint AZONNAL elbukik, ha production
-- adatbázisban létezik olyan child_id, amely egynél több family_id-hez
-- kapcsolódik. Ezt a preflightot a felhasználó a migráció írása ELŐTT
-- lefuttatta (lásd fenti FRISSÍTVE megjegyzés) — "Success. No rows
-- returned" eredménnyel, tehát a jelen pillanatban ismert production
-- adatokkal ez az ALTER TABLE biztonságosan lefut. Éles alkalmazás
-- előtt AJÁNLOTT a preflightot közvetlenül az apply előtt (nem csak
-- korábban) megismételni, mert az adatbázis állapota változhatott
-- (lásd a fájl végén a production apply + post-check terv 5. pontját).
alter table public.family_children
  drop constraint if exists family_children_child_id_unique;
alter table public.family_children
  add constraint family_children_child_id_unique unique (child_id);

comment on constraint family_children_child_id_unique on public.family_children is
  'Egy child_profile PONTOSAN egy familyhez kapcsolható (1 gyermek = 1 család). Több szülő/gondviselő kezelése NEM több family létrehozásával történik, hanem ugyanazon family több family_members során (owner/guardian) keresztül. A meglévő PRIMARY KEY (family_id, child_id) továbbra is megmarad; ez a UNIQUE(child_id) azt zárja le, hogy ugyanaz a child_id több különböző family_id-hez is kapcsolódhasson.';

-- ────────────────────────────────────────────────────────────────
-- 1. TABLE: child_schedule_items
-- ────────────────────────────────────────────────────────────────
create table if not exists public.child_schedule_items (
  id                  uuid primary key default gen_random_uuid(),
  child_id            uuid not null references public.child_profiles (id) on delete cascade,

  title               text not null,
  description         text,

  schedule_type       text not null check (schedule_type in ('one_time', 'recurring')),

  start_date          date,
  end_date            date,

  time_local          time not null,
  arrival_time_local  time,

  -- IANA időzóna-azonosító (pl. 'Europe/Budapest') — NEM UTC eltolás,
  -- mert a push-scheduling/utazásiidő-számítás később DST-t (téli/nyári
  -- időszámítás-váltást) helyesen kell kezelje. Sima stringként tárolva,
  -- validáció NÉLKÜL (nincs beépített Postgres IANA-tzname CHECK) — ez
  -- KÉSŐBBI, alkalmazás/RPC-szintű validáció, itt csak az oszlop és az
  -- ésszerű default kerül be.
  timezone            text not null default 'Europe/Budapest',

  -- Ismétlődő napirendi elem napjai — lásd lent a COMMENT ON COLUMN-t
  -- a pontos jelentésért (1 = hétfő ... 7 = vasárnap).
  days_of_week        smallint[],

  origin_label        text,
  origin_lat          double precision,
  origin_lon          double precision,

  destination_label   text,
  destination_lat     double precision,
  destination_lon     double precision,

  is_active           boolean not null default true,

  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- ── DB-szintű validáció (2. szakasz) ──────────────────────────
  -- title ne lehessen üres/whitespace.
  constraint child_schedule_items_title_not_blank
    check (btrim(title) <> ''),

  -- days_of_week értékei csak 1..7 (halmaz-tartalmazás operátorral,
  -- SUBQUERY NÉLKÜL — a Postgres CHECK constraint nem engedne
  -- SELECT/FROM-os subqueryt).
  constraint child_schedule_items_days_of_week_values
    check (days_of_week is null or days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]),

  -- days_of_week-ben NULL elem nem megengedett (pl. {1,null,3}).
  -- array_position(arr, NULL) a tömb első NULL elemének pozícióját
  -- adja vissza, vagy NULL-t, ha nincs ilyen — nem subquery, egyetlen
  -- függvényhívás, tehát CHECK constraintben megengedett.
  constraint child_schedule_items_days_of_week_no_null_elements
    check (days_of_week is null or array_position(days_of_week, null::smallint) is null),

  -- recurring esetén days_of_week ne legyen üres. cardinality()-t
  -- használunk (NEM array_length()-t), mert array_length('{}',1) NULL-t
  -- ad vissza egy üres tömbre (nem 0-t), ami hibásan "átmenne" egy
  -- CHECK-en (a NULL kiértékelés NEM hibázza el a constraintet) —
  -- cardinality() egy üres tömbre helyesen 0-t ad.
  constraint child_schedule_items_recurring_requires_days
    check (
      schedule_type <> 'recurring'
      or (days_of_week is not null and cardinality(days_of_week) > 0)
    ),

  -- one_time esetén days_of_week legyen NULL (a napirendi elem nem
  -- ismétlődik, tehát nincs napokra vonatkozó bontása).
  --
  -- FONTOS — MIT NEM GARANTÁL a DB itt: a napokon BELÜLI duplikáció
  -- mentesség (pl. days_of_week = {2,2,4}) NINCS DB CHECK-kel
  -- kikényszerítve. Egy tiszta, subquery- és egyedi-function-mentes
  -- immutable CHECK-kel ez nem oldható meg biztonságosan/egyszerűen
  -- (a duplikátum-számláláshoz unnest+group by szükséges, ami vagy
  -- subquery, vagy egy külön, csak ehhez írt custom function lenne —
  -- ez utóbbit szándékosan NEM készítjük el, hogy ne legyen
  -- túlkomplikált, csak-erre-a-célra function). Ehelyett: a DB az
  -- ÖSSZES biztonságosan garantálható invariánst kikényszeríti
  -- (tartomány, nem-NULL elem, nem-üres/kötelező recurringnél, NULL
  -- one_time-nál), a duplikáció-mentességet pedig a
  -- create_child_schedule_item()/update_child_schedule_item() RPC
  -- validálja (elutasítja, ha van duplikátum — lásd ott). Egy
  -- esetleges JÖVŐBELI, NEM ezen az RPC-n át érkező direkt INSERT
  -- (pl. service_role-lal futó admin script) tehát elméletileg
  -- tudna duplikált napot tartalmazó sort létrehozni — ez egy
  -- tudatosan elfogadott, dokumentált résidőszak, amíg a kliens
  -- kizárólag az RPC-n keresztül ír (lásd 5. szakasz, nincs direkt
  -- kliensoldali INSERT policy).
  constraint child_schedule_items_one_time_days_of_week_null
    check (schedule_type <> 'one_time' or days_of_week is null),

  -- one_time esetén start_date kötelező.
  constraint child_schedule_items_one_time_requires_start_date
    check (schedule_type <> 'one_time' or start_date is not null),

  -- ha end_date van, ne lehessen start_date előtt. IDŐFÜGGETLEN
  -- (stabil) constraint — nem használ now()/current_date-et.
  constraint child_schedule_items_end_not_before_start
    check (end_date is null or start_date is null or end_date >= start_date),

  -- Koordináta-tartományok (lat: -90..90, lon: -180..180) — mindkét
  -- pontra (origin/destination) külön-külön, IDŐFÜGGETLEN.
  constraint child_schedule_items_origin_lat_range
    check (origin_lat is null or (origin_lat >= -90 and origin_lat <= 90)),
  constraint child_schedule_items_origin_lon_range
    check (origin_lon is null or (origin_lon >= -180 and origin_lon <= 180)),
  constraint child_schedule_items_destination_lat_range
    check (destination_lat is null or (destination_lat >= -90 and destination_lat <= 90)),
  constraint child_schedule_items_destination_lon_range
    check (destination_lon is null or (destination_lon >= -180 and destination_lon <= 180)),

  -- Ne lehessen fél koordinátapár: origin_lat/origin_lon együtt
  -- kötelező vagy együtt hiányzó, ugyanígy destination_lat/lon.
  constraint child_schedule_items_origin_pair
    check (
      (origin_lat is null and origin_lon is null)
      or (origin_lat is not null and origin_lon is not null)
    ),
  constraint child_schedule_items_destination_pair
    check (
      (destination_lat is null and destination_lon is null)
      or (destination_lat is not null and destination_lon is not null)
    )
);

comment on table public.child_schedule_items is
  'Gyermek napirendi eseményei (egyszeri vagy ismétlődő). Csak adatmodell — push/GPS/routing/journey logika KÉSŐBBI, itt nem implementált.';

comment on column public.child_schedule_items.days_of_week is
  'Ismétlődő napirendi elem napjai, ISO 8601 hét-nap konvenció: 1 = hétfő, 2 = kedd, 3 = szerda, 4 = csütörtök, 5 = péntek, 6 = szombat, 7 = vasárnap. NULL one_time elemeknél (DB CHECK kikényszeríti), recurring elemnél soha nem lehet üres/NULL, és nem tartalmazhat NULL elemet (DB CHECK). A napok EGYEDISÉGÉT (nincs duplikált nap) a DB CHECK szintjén NEM kényszerítjük ki — azt a create_child_schedule_item()/update_child_schedule_item() RPC validálja, lásd a child_schedule_items_one_time_days_of_week_null constraint melletti megjegyzést.';

comment on column public.child_schedule_items.timezone is
  'IANA időzóna-azonosító (pl. Europe/Budapest), NEM UTC eltolás — a time_local/arrival_time_local ehhez a zónához viszonyított helyi óra:perc. Formátum-validáció nélkül, alkalmazás/RPC-szintű feladat.';

comment on column public.child_schedule_items.time_local is
  'Az esemény/tevékenység helyi KEZDÉSI időpontja (óra:perc a timezone oszlopban tárolt időzónában, NEM UTC). Pl. edzés kezdete 16:00.';

comment on column public.child_schedule_items.arrival_time_local is
  'Opcionális, kívánt LEGKÉSŐBBI ÉRKEZÉSI időpont UGYANAHHOZ az eseményhez, mint time_local (nem egy külön esemény) — helyi óra:perc, NEM UTC. Pl. edzés kezdete 16:00, kívánt érkezés 15:50 -> arrival_time_local = 15:50, time_local = 16:00. Tipikusan KORÁBBI, mint time_local, de ez szándékosan NINCS DB CHECK-kel kikényszerítve (lásd a tábla-szintű megjegyzést: a mezők jelentése ezt sugallja, de a DB nem zárja ki a fordított esetet, mert nincs rá biztos üzleti szükséglet, és egy ilyen constraint később törékennyé tenné a modellt). Az indulási idő NEM ennek a táblának a felelőssége — azt a KÉSŐBBI Védett Útvonal integráció számolja majd az útvonalból és ebből az időpontból.';

-- ────────────────────────────────────────────────────────────────
-- 2. updated_at trigger (MEGLÉVŐ public.set_updated_at() helper —
--    NEM duplikált függvény)
-- ────────────────────────────────────────────────────────────────
drop trigger if exists child_schedule_items_set_updated_at on public.child_schedule_items;
create trigger child_schedule_items_set_updated_at before update on public.child_schedule_items
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 3. Indexek (csak az RLS/join szempontból indokoltak)
-- ────────────────────────────────────────────────────────────────
create index if not exists idx_child_schedule_items_child_id
  on public.child_schedule_items (child_id);
create index if not exists idx_child_schedule_items_child_active
  on public.child_schedule_items (child_id, is_active);

-- ────────────────────────────────────────────────────────────────
-- 4. SECURITY DEFINER helper függvények (child-szintű, a MEGLÉVŐ
--    family-szintű helperekre épülve)
-- ────────────────────────────────────────────────────────────────
-- A child_schedule_items.child_id-hez tartozik, NEM közvetlenül
-- family_id-hez — a family(k) a family_children kapcsolótáblán
-- keresztül érhetők el. Ezek a helperek EZT a kapcsolatot fedik le,
-- a MEGLÉVŐ public.is_family_member()/is_family_owner()-re épülve
-- (nem duplikálják a tagság-logikát, csak egy szinttel kiterjesztik
-- child_id-re) — pontosan az a minta, amit a MEGLÉVŐ
-- child_profiles RLS policy-k (lásd
-- supabase/migrations/20260926_family_db_foundation.sql) inline
-- EXISTS subqueryként már használnak; itt névvel ellátott,
-- újrahasználható helperré emeljük, mert ennél a táblánál több
-- policy/RPC is igényli ugyanazt a logikát.
create or replace function public.is_child_family_member(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_children fc
    where fc.child_id = p_child_id
      and public.is_family_member(fc.family_id)
  );
$$;

create or replace function public.is_child_family_owner(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_children fc
    where fc.child_id = p_child_id
      and public.is_family_owner(fc.family_id)
  );
$$;

-- ────────────────────────────────────────────────────────────────
-- 5. MUTÁCIÓS RPC-K
-- ────────────────────────────────────────────────────────────────
-- create_child_schedule_item — a KIZÁRÓLAGOS létrehozási út (nincs
-- direkt kliensoldali INSERT policy, lásd 6. szakasz).
create or replace function public.create_child_schedule_item(
  p_child_id uuid,
  p_title text,
  p_schedule_type text,
  p_time_local time,
  p_description text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_arrival_time_local time default null,
  p_timezone text default 'Europe/Budapest',
  p_days_of_week smallint[] default null,
  p_origin_label text default null,
  p_origin_lat double precision default null,
  p_origin_lon double precision default null,
  p_destination_label text default null,
  p_destination_lat double precision default null,
  p_destination_lon double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges napirendi elem létrehozásához';
  end if;

  if not public.has_pilot_access('family_db_beta') and not public.is_admin() then
    raise exception 'family_db_beta hozzáférés szükséges napirendi elem létrehozásához';
  end if;

  if not public.is_child_family_owner(p_child_id) and not public.is_admin() then
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje (vagy admin) hozhat létre napirendi elemet';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'title megadása kötelező';
  end if;

  if p_schedule_type not in ('one_time', 'recurring') then
    raise exception 'schedule_type csak one_time vagy recurring lehet';
  end if;

  if p_schedule_type = 'recurring'
     and (p_days_of_week is null or cardinality(p_days_of_week) = 0) then
    raise exception 'recurring napirendi elemhez days_of_week megadása kötelező';
  end if;

  if p_schedule_type = 'one_time' and p_days_of_week is not null then
    raise exception 'one_time napirendi elemhez days_of_week nem adható meg (legyen NULL)';
  end if;

  -- Napok egyediségének VALIDÁLÁSA (nem csendes normalizálás/dedupe) —
  -- ezt szándékosan az RPC végzi, NEM DB CHECK constraint (lásd a
  -- child_schedule_items_one_time_days_of_week_null constraint
  -- melletti migráció-kommentet arról, miért nem egy erre írt custom
  -- function).
  if p_days_of_week is not null
     and cardinality(p_days_of_week) <> cardinality(array(select distinct unnest(p_days_of_week))) then
    raise exception 'days_of_week nem tartalmazhat duplikált napot';
  end if;

  if p_schedule_type = 'one_time' and p_start_date is null then
    raise exception 'one_time napirendi elemhez start_date megadása kötelező';
  end if;

  if p_end_date is not null and p_start_date is not null and p_end_date < p_start_date then
    raise exception 'end_date nem lehet start_date előtt';
  end if;

  -- Fél koordinátapár tiltása — konzisztens a DB CHECK-kel
  -- (child_schedule_items_origin_pair / _destination_pair).
  if (p_origin_lat is null) <> (p_origin_lon is null) then
    raise exception 'origin_lat és origin_lon együtt kötelező vagy együtt hiányzó';
  end if;

  if (p_destination_lat is null) <> (p_destination_lon is null) then
    raise exception 'destination_lat és destination_lon együtt kötelező vagy együtt hiányzó';
  end if;

  insert into public.child_schedule_items (
    child_id, title, description, schedule_type, start_date, end_date,
    time_local, arrival_time_local, timezone, days_of_week,
    origin_label, origin_lat, origin_lon,
    destination_label, destination_lat, destination_lon,
    created_by
  ) values (
    p_child_id, p_title, p_description, p_schedule_type, p_start_date, p_end_date,
    p_time_local, p_arrival_time_local, coalesce(p_timezone, 'Europe/Budapest'), p_days_of_week,
    p_origin_label, p_origin_lat, p_origin_lon,
    p_destination_label, p_destination_lat, p_destination_lon,
    v_uid
  )
  returning id into v_item_id;

  return v_item_id;
end;
$$;

-- update_child_schedule_item — SZÁNDÉKOSAN nincs p_child_id
-- paramétere: a jogosultság-ellenőrzés a MEGLÉVŐ (tárolt) child_id
-- alapján történik, és a UPDATE-be sincs child_id oszlop a SET
-- listában — ez a függvény tehát STRUKTURÁLISAN nem képes child_id-t
-- másik childra áthelyezni, nem csak validációval tiltja azt.
create or replace function public.update_child_schedule_item(
  p_id uuid,
  p_title text,
  p_schedule_type text,
  p_time_local time,
  p_description text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_arrival_time_local time default null,
  p_timezone text default 'Europe/Budapest',
  p_days_of_week smallint[] default null,
  p_origin_label text default null,
  p_origin_lat double precision default null,
  p_origin_lon double precision default null,
  p_destination_label text default null,
  p_destination_lat double precision default null,
  p_destination_lon double precision default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_child_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges napirendi elem módosításához';
  end if;

  if not public.has_pilot_access('family_db_beta') and not public.is_admin() then
    raise exception 'family_db_beta hozzáférés szükséges napirendi elem módosításához';
  end if;

  select child_id into v_child_id
  from public.child_schedule_items
  where id = p_id;

  if v_child_id is null then
    raise exception 'A napirendi elem nem található';
  end if;

  if not public.is_child_family_owner(v_child_id) and not public.is_admin() then
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje (vagy admin) módosíthatja ezt a napirendi elemet';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'title megadása kötelező';
  end if;

  if p_schedule_type not in ('one_time', 'recurring') then
    raise exception 'schedule_type csak one_time vagy recurring lehet';
  end if;

  if p_schedule_type = 'recurring'
     and (p_days_of_week is null or cardinality(p_days_of_week) = 0) then
    raise exception 'recurring napirendi elemhez days_of_week megadása kötelező';
  end if;

  if p_schedule_type = 'one_time' and p_days_of_week is not null then
    raise exception 'one_time napirendi elemhez days_of_week nem adható meg (legyen NULL)';
  end if;

  if p_days_of_week is not null
     and cardinality(p_days_of_week) <> cardinality(array(select distinct unnest(p_days_of_week))) then
    raise exception 'days_of_week nem tartalmazhat duplikált napot';
  end if;

  if p_schedule_type = 'one_time' and p_start_date is null then
    raise exception 'one_time napirendi elemhez start_date megadása kötelező';
  end if;

  if p_end_date is not null and p_start_date is not null and p_end_date < p_start_date then
    raise exception 'end_date nem lehet start_date előtt';
  end if;

  if (p_origin_lat is null) <> (p_origin_lon is null) then
    raise exception 'origin_lat és origin_lon együtt kötelező vagy együtt hiányzó';
  end if;

  if (p_destination_lat is null) <> (p_destination_lon is null) then
    raise exception 'destination_lat és destination_lon együtt kötelező vagy együtt hiányzó';
  end if;

  update public.child_schedule_items set
    title = p_title,
    description = p_description,
    schedule_type = p_schedule_type,
    start_date = p_start_date,
    end_date = p_end_date,
    time_local = p_time_local,
    arrival_time_local = p_arrival_time_local,
    timezone = coalesce(p_timezone, 'Europe/Budapest'),
    days_of_week = p_days_of_week,
    origin_label = p_origin_label,
    origin_lat = p_origin_lat,
    origin_lon = p_origin_lon,
    destination_label = p_destination_label,
    destination_lat = p_destination_lat,
    destination_lon = p_destination_lon,
    is_active = coalesce(p_is_active, true)
  where id = p_id;

  return p_id;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 6. RLS engedélyezése
-- ────────────────────────────────────────────────────────────────
alter table public.child_schedule_items enable row level security;

drop policy if exists "child_schedule_items_select_via_family" on public.child_schedule_items;
create policy "child_schedule_items_select_via_family"
  on public.child_schedule_items for select
  using (public.is_child_family_member(child_id) or public.is_admin());

-- Szándékosan NINCS közvetlen kliensoldali INSERT policy — ugyanaz az
-- elv, mint a MEGLÉVŐ child_profiles táblán: a normál (és egyetlen
-- legitim) létrehozási út a create_child_schedule_item() SECURITY
-- DEFINER RPC, amely saját maga ellenőrzi a family_db_beta
-- hozzáférést + az aktív owner tagságot.

drop policy if exists "child_schedule_items_update_via_family_owner" on public.child_schedule_items;
create policy "child_schedule_items_update_via_family_owner"
  on public.child_schedule_items for update
  using (
    public.is_admin()
    or (public.is_child_family_owner(child_id) and public.has_pilot_access('family_db_beta'))
  )
  with check (
    public.is_admin()
    or (public.is_child_family_owner(child_id) and public.has_pilot_access('family_db_beta'))
  );

drop policy if exists "child_schedule_items_delete_via_family_owner" on public.child_schedule_items;
create policy "child_schedule_items_delete_via_family_owner"
  on public.child_schedule_items for delete
  using (
    public.is_admin()
    or (public.is_child_family_owner(child_id) and public.has_pilot_access('family_db_beta'))
  );

-- ────────────────────────────────────────────────────────────────
-- 7. SECURITY DEFINER function EXECUTE jogosultságok
-- ────────────────────────────────────────────────────────────────
-- Ugyanaz az elv, mint a Family DB foundationnél: a mutáló RPC-k NE
-- legyenek PUBLIC (= anon-t is beleértve) számára végrehajthatók,
-- csak "authenticated"-nek. A két child-szintű olvasás-jellegű
-- helper (is_child_family_member, is_child_family_owner) viszont
-- MEGMARAD PUBLIC-nak, mint a többi RLS-ben használt helper — a
-- Postgres a policy-kiértékelés során a lekérdező szerepkör
-- (anon/authenticated) nevében hívja meg őket, tehát ha ez nincs
-- végrehajtható, minden RLS kiértékelés hibával elbukna. Önmagukban
-- nem szivárogtatnak adatot: csak a hívó saját auth.uid()-jéhez
-- kötött boolean választ adnak vissza.
revoke execute on function public.create_child_schedule_item(
  uuid, text, text, time, text, date, date, time, text, smallint[],
  text, double precision, double precision, text, double precision, double precision
) from public;
grant execute on function public.create_child_schedule_item(
  uuid, text, text, time, text, date, date, time, text, smallint[],
  text, double precision, double precision, text, double precision, double precision
) to authenticated;

revoke execute on function public.update_child_schedule_item(
  uuid, text, text, time, text, date, date, time, text, smallint[],
  text, double precision, double precision, text, double precision, double precision, boolean
) from public;
grant execute on function public.update_child_schedule_item(
  uuid, text, text, time, text, date, date, time, text, smallint[],
  text, double precision, double precision, text, double precision, double precision, boolean
) to authenticated;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Additív, nem-destruktív migráció. Visszavonás esetén, EBBEN A
-- SORRENDBEN:
--
--   drop policy if exists "child_schedule_items_delete_via_family_owner" on public.child_schedule_items;
--   drop policy if exists "child_schedule_items_update_via_family_owner" on public.child_schedule_items;
--   drop policy if exists "child_schedule_items_select_via_family" on public.child_schedule_items;
--   drop function if exists public.update_child_schedule_item(uuid, text, text, time, text, date, date, time, text, smallint[], text, double precision, double precision, text, double precision, double precision, boolean);
--   drop function if exists public.create_child_schedule_item(uuid, text, text, time, text, date, date, time, text, smallint[], text, double precision, double precision, text, double precision, double precision);
--   drop function if exists public.is_child_family_owner(uuid);
--   drop function if exists public.is_child_family_member(uuid);
--   drop trigger if exists child_schedule_items_set_updated_at on public.child_schedule_items;
--   drop table if exists public.child_schedule_items;
--   alter table public.family_children drop constraint if exists family_children_child_id_unique;
--
-- Az EXECUTE grant/revoke állítások nem igényelnek külön rollbackot —
-- a function DROP automatikusan törli a hozzájuk tartozó
-- jogosultság-bejegyzéseket is.
--
-- FONTOS: a family_children_child_id_unique constraint rollbackja
-- (visszaállítás a "több family / gyermek" állapotra) KIZÁRÓLAG akkor
-- biztonságos, ha a child_schedule_items tábla (és minden rá épülő,
-- 1 child = 1 family invariánsra támaszkodó jövőbeli logika) EZT
-- MEGELŐZŐEN már törölve van — épp azért, mert a fenti sorrend ezt az
-- invariánst a Napirend logika ELÉ helyezte. A rollback blokk ezért
-- ebben, a létrehozással ellentétes sorrendben van felsorolva.
