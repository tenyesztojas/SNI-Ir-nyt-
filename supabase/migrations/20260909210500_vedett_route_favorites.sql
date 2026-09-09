-- ============================================================
-- Védett Útvonal — Kedvenc útvonalak (vedett_route_favorites)
-- Kedvenc Útvonalak feladat, 2026-09-09
-- ============================================================
--
-- FONTOS ARCHITEKTÚRAI ELV (spec 16-17. pont): ez egy ROUTE PRESET
-- (honnan/hová/koordináták-vagy-strukturált-cím/szenzoros prioritások),
-- SOHA nem egy konkrét, aktuálisan kiszámolt MOTIS/BKK journey. Nincs itt
-- eltárolt járatindulás, késés, realtime útvonal vagy átszállási
-- kombináció — ezek idővel elavulnának. A kedvenc megnyitásakor a Védett
-- Útvonal MINDIG friss útvonalat számol a jelenlegi adatokból (lásd
-- lib/vedett-route/favorites/queries.ts és a
-- components/vedett-utvonal/VedettUtvonalSearchForm.tsx integráció).
--
-- GPS PRIVACY (spec 18/27. pont) — ez a legfontosabb invariáns: a
-- CURRENT_LOCATION induló mód esetén a séma SZÁNDÉKOSAN NEM tartalmaz
-- origin_latitude/origin_longitude oszlopot. Nem "üresen hagyjuk" ezeket
-- egy CURRENT_LOCATION sorban — EGYÁLTALÁN NINCS ilyen oszlop a táblában,
-- tehát a pillanatnyi GPS-koordináta STRUKTURÁLISAN nem tárolható el itt,
-- semmilyen jövőbeli kód-hiba esetén sem. Csak az origin_mode =
-- 'CURRENT_LOCATION' jelentés kerül mentésre ("Aktuális helyzetem → [cél]"
-- jelentése); a tényleges pozíciót a kedvenc megnyitásakor a felhasználó
-- explicit "Aktuális helyzetem" kattintása kéri le újra, session/in-memory
-- módon — pontosan úgy, mint bármely más induló-pont kérésnél.
--
-- SZÁNDÉKOSAN KÜLÖN adatmodell a meglévő "favorites" (VédettSarok hely-
-- kedvencek, lib/actions/favorites.ts) táblától — az egy hely-bookmark
-- (place_id), NEM egy útvonal-preset. A két funkció más célt szolgál,
-- nincs köztük átfedés vagy duplikáció.

CREATE TABLE IF NOT EXISTS vedett_route_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,

  -- Induló hely — MANUAL (strukturált cím) VAGY CURRENT_LOCATION (lásd
  -- fenti GPS PRIVACY megjegyzés: NINCS origin_latitude/origin_longitude
  -- oszlop, a pillanatnyi GPS-koordináta sosem kerül ide).
  origin_mode TEXT NOT NULL
    CHECK (origin_mode IN ('MANUAL', 'CURRENT_LOCATION')),
  origin_city TEXT NULL,
  origin_district_or_postal_code TEXT NULL,
  origin_street TEXT NULL,

  -- Célhely — MANUAL (strukturált cím) VAGY KNOWN_PLACE (egy VédettSarok
  -- Védett Hely már ismert koordinátája/neve, "Navigálj oda" integráció).
  destination_mode TEXT NOT NULL
    CHECK (destination_mode IN ('MANUAL', 'KNOWN_PLACE')),
  destination_city TEXT NULL,
  destination_district_or_postal_code TEXT NULL,
  destination_street TEXT NULL,
  destination_latitude DOUBLE PRECISION NULL,
  destination_longitude DOUBLE PRECISION NULL,
  destination_label TEXT NULL,
  -- Csak referencia célú (megjelenítés/jövőbeli összekapcsolás), SOSEM
  -- kényszerített FK a places táblára — egy törölt/átnevezett Védett Hely
  -- esetén a kedvenc a MENTETT név+koordináta alapján továbbra is
  -- működik (nincs újra-geokódolás), a place_id csak kiegészítő adat.
  destination_place_id TEXT NULL,

  -- Szenzoros prioritások — a MEGLÉVŐ weights modell mind a 6 kulcsával,
  -- mindegyik PONTOSAN 0/1/2 (lásd lib/vedett-route/favorites/schemas.ts
  -- favoriteWeightsSchema — az app-szintű zod séma marad az ELSŐDLEGES
  -- kapuőr; a DB CHECK (lásd lent, vedett_route_favorites_weights_valid)
  -- egy MÁSODIK, defense-in-depth réteg, ha egy jövőbeli kódút közvetlenül
  -- a DB-be írna a Zod-validáció megkerülésével — ez NEM gyengíti/írja
  -- felül az app-szintű validációt, azt nem is módosítjuk).
  weights JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT vedett_route_favorites_name_not_blank CHECK (char_length(trim(name)) > 0),
  CONSTRAINT vedett_route_favorites_name_max_length CHECK (char_length(name) <= 120),

  -- Induló hely alakja az origin_mode szerint — CURRENT_LOCATION esetén a
  -- strukturált cím-mezők MINDIG NULL-ok (nincs mit menteni, hiszen nincs
  -- is koordináta-oszlop), MANUAL esetén MINDHÁROM kötelező, ÉS tényleges
  -- (nem csak NOT NULL, hanem trim() után is nem-üres) tartalmat kell
  -- tartalmazniuk — ugyanaz az invariáns, mint a kliens oldali
  -- isManualAddressComplete() (ami trim()-elt, nem-üres mezőket követel),
  -- itt DB-szinten megerősítve (hardening, 2026-09-09): egy puszta
  -- IS NOT NULL elfogadna egy "" (üres string) MANUAL cím-mezőt is, ami
  -- soha nem lenne valódi, kereshető cím.
  CONSTRAINT vedett_route_favorites_origin_shape CHECK (
    (
      origin_mode = 'CURRENT_LOCATION'
      AND origin_city IS NULL AND origin_district_or_postal_code IS NULL AND origin_street IS NULL
    )
    OR
    (
      origin_mode = 'MANUAL'
      AND NULLIF(trim(origin_city), '') IS NOT NULL
      AND NULLIF(trim(origin_district_or_postal_code), '') IS NOT NULL
      AND NULLIF(trim(origin_street), '') IS NOT NULL
    )
  ),

  -- Célhely alakja a destination_mode szerint — a két mód mezői kölcsönösen
  -- kizárják egymást (ugyanaz a minta, mint a lib/vedett-route/schemas.ts
  -- journeySearchSchema to/toCoordinates superRefine-je, csak DB szinten).
  -- Hardening (2026-09-09): (a) a MANUAL cím-mezők itt is trim()-elt,
  -- nem-üres tartalmat követelnek (lásd origin_shape megjegyzése); (b) a
  -- destination_label KNOWN_PLACE esetén sem lehet üres string; (c) a
  -- destination_place_id-t MANUAL esetén explicit NULL-ra kényszerítjük
  -- (korábban csak a lat/lon/label mezőket néztük, a place_id-t nem) —
  -- KNOWN_PLACE esetén a place_id TOVÁBBRA IS opcionális marad (egy deep
  -- linkből érkező, csak name+lat+lon adatú célpont is legitim, place_id
  -- nélkül), tehát ott SZÁNDÉKOSAN nem írjuk elő a kitöltését.
  CONSTRAINT vedett_route_favorites_destination_shape CHECK (
    (
      destination_mode = 'MANUAL'
      AND NULLIF(trim(destination_city), '') IS NOT NULL
      AND NULLIF(trim(destination_district_or_postal_code), '') IS NOT NULL
      AND NULLIF(trim(destination_street), '') IS NOT NULL
      AND destination_latitude IS NULL AND destination_longitude IS NULL AND destination_label IS NULL
      AND destination_place_id IS NULL
    )
    OR
    (
      destination_mode = 'KNOWN_PLACE'
      AND destination_latitude IS NOT NULL AND destination_longitude IS NOT NULL
      AND NULLIF(trim(destination_label), '') IS NOT NULL
      AND destination_city IS NULL AND destination_district_or_postal_code IS NULL AND destination_street IS NULL
    )
  ),

  CONSTRAINT vedett_route_favorites_destination_latitude_range
    CHECK (destination_latitude IS NULL OR destination_latitude BETWEEN -90 AND 90),
  CONSTRAINT vedett_route_favorites_destination_longitude_range
    CHECK (destination_longitude IS NULL OR destination_longitude BETWEEN -180 AND 180),

  -- Szenzoros súlyok DB-szintű integritása (hardening, 2026-09-09) —
  -- defense-in-depth az app-szintű favoriteWeightsSchema mellett (azt NEM
  -- helyettesíti, NEM gyengíti). FONTOS KORLÁT, amit figyelembe kellett
  -- venni: a PostgreSQL CHECK constraint NEM tartalmazhat subselectet
  -- ("cannot use subquery in check constraint") — ezért a "pontosan 6
  -- kulcs, extra kulcs nélkül" feltételt NEM `count(*) FROM
  -- jsonb_object_keys(...)` subselecttel fejezzük ki (az szintaktikailag
  -- helyesnek tűnne, de éles migrálásnál hibára futna), hanem egy
  -- subquery-mentes, tisztán szkalár egyenlőség-vizsgálattal: a `weights`
  -- objektumot összehasonlítjuk egy, KIZÁRÓLAG a 6 elvárt kulcsból
  -- `jsonb_build_object()`-tel újraépített objektummal. A jsonb `=`
  -- kulcs-érték pár szerint (sorrend-független) hasonlít, ezért ha
  -- `weights`-ben volna egy 7. (extra) kulcs, a két objektum nem lenne
  -- egyenlő — ez magában foglalja a "nincs extra kulcs" garanciát is, a
  -- lenti `?&` (mind a 6 elvárt kulcs jelen van) melletti feltételként.
  -- Összefoglalva, a teljes constraint garantálja:
  --   1) weights egy JSON OBJECT (nem tömb/szám/string/bool/null),
  --   2) mind a 6 elvárt kulcs jelen van (`?&`),
  --   3) NINCS extra kulcs (a jsonb_build_object-es egyenlőség-vizsgálat —
  --      a 2) és 3) együtt zárja ki mind a HIÁNYZÓ, mind az EXTRA kulcsot),
  --   4) minden egyes kulcs értéke szó szerint a '0'/'1'/'2' JSONB szám
  --      egyike — ez zárja ki a string "1"-et (az '"1"'::jsonb NEM
  --      egyezik '1'::jsonb-vel), a törtet (0.5), a tartományon kívüli
  --      egészt (3), és a JSON null-t (a hiányzó ÉRTÉK, nem hiányzó
  --      KULCS, esete).
  CONSTRAINT vedett_route_favorites_weights_valid CHECK (
    jsonb_typeof(weights) = 'object'
    AND weights ?& ARRAY[
      'transfers',
      'modeSwitches',
      'underground',
      'walking',
      'duration',
      'waiting'
    ]
    AND weights = jsonb_build_object(
      'transfers', weights->'transfers',
      'modeSwitches', weights->'modeSwitches',
      'underground', weights->'underground',
      'walking', weights->'walking',
      'duration', weights->'duration',
      'waiting', weights->'waiting'
    )
    AND weights->'transfers' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb)
    AND weights->'modeSwitches' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb)
    AND weights->'underground' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb)
    AND weights->'walking' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb)
    AND weights->'duration' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb)
    AND weights->'waiting' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb)
  )

  -- SZÁNDÉKOSAN NINCS globális UNIQUE constraint (spec 24. pont: "NE
  -- legyen globális UNIQUE constraint olyan formában, ami későbbi
  -- rugalmas fejlesztést akadályozhat") — a duplikáció-ellenőrzés
  -- app-szinten, user-scope-olva történik (lásd
  -- lib/vedett-route/favorites/queries.ts findDuplicateFavoriteRoute()).
);

CREATE INDEX IF NOT EXISTS vedett_route_favorites_user_id_idx ON vedett_route_favorites (user_id);

-- Hardening (2026-09-09): explicit search_path a triggerfüggvényen, hogy
-- NE támaszkodjon a hívó/session implicit search_path-jére (a `now()`
-- beépített függvény ettől függetlenül elérhető, de a explicit
-- `public, pg_temp` a projekt bevált Supabase-mintáját követi, és
-- kizárja, hogy egy módosított search_path-ú session más `now`/egyéb
-- objektumot kössön be). NEM SECURITY DEFINER — nincs rá szükség, a
-- trigger a hívó jogosultságával (SECURITY INVOKER, az alapértelmezett)
-- fut, ami itt elegendő, mert csak a saját sorát frissítő UPDATE-en fut,
-- amit az RLS már egyébként is a hívóra korlátoz.
CREATE OR REPLACE FUNCTION vedett_route_favorites_set_updated_at()
RETURNS TRIGGER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vedett_route_favorites_updated_at_trigger ON vedett_route_favorites;
CREATE TRIGGER vedett_route_favorites_updated_at_trigger
  BEFORE UPDATE ON vedett_route_favorites
  FOR EACH ROW
  EXECUTE FUNCTION vedett_route_favorites_set_updated_at();

-- ── Row Level Security ──────────────────────────────────────
-- SZABÁLY (spec 25. pont): a kedvenc útvonal SZEMÉLYES felhasználói adat.
-- Másik user kedvencét SOHA nem lehet olvasni/módosítani/törölni — ez a
-- védelem a DATABASE szinten (auth.uid(), nem a kliensből érkező user_id-
-- ban bízva) érvényesül, ugyanaz a minta, mint a rest_points táblánál
-- (lásd supabase/migrations/20260907_rest_points.sql).

ALTER TABLE vedett_route_favorites ENABLE ROW LEVEL SECURITY;

-- Idempotencia (hardening, 2026-09-09) — mivel ezt a migrációt kézzel,
-- a Supabase SQL Editorban futtatjuk, egy megszakadt/részleges futás
-- után biztonságosan újrafuttathatónak kell lennie. A CREATE TABLE/INDEX
-- fentebb már IF NOT EXISTS-szel idempotens, a triggernél DROP TRIGGER
-- IF EXISTS + CREATE TRIGGER minta él (lásd fentebb) — a policy-knál
-- ugyanezt az elvet a DROP POLICY IF EXISTS + CREATE POLICY pár adja
-- (a CREATE POLICY-nak nincs saját "OR REPLACE"/"IF NOT EXISTS" formája).
DROP POLICY IF EXISTS "vedett_route_favorites_own_select" ON vedett_route_favorites;
CREATE POLICY "vedett_route_favorites_own_select"
  ON vedett_route_favorites FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "vedett_route_favorites_own_insert" ON vedett_route_favorites;
CREATE POLICY "vedett_route_favorites_own_insert"
  ON vedett_route_favorites FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "vedett_route_favorites_own_update" ON vedett_route_favorites;
CREATE POLICY "vedett_route_favorites_own_update"
  ON vedett_route_favorites FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "vedett_route_favorites_own_delete" ON vedett_route_favorites;
CREATE POLICY "vedett_route_favorites_own_delete"
  ON vedett_route_favorites FOR DELETE
  USING (user_id = auth.uid());

-- Nincs semmilyen "más felhasználó is láthatja" SELECT policy — a kedvenc
-- útvonal mindig 100%-ban privát, nincs megosztás/publikus/családi/
-- szervezeti kedvenc ebben a körben (lásd spec 33. pont, scope-határ).
