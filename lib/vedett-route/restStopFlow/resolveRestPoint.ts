// Sprint E.2 hotfix (2026-09-08) — source-aware pihenőpont-feloldás a
// /route-to-rest-point végponthoz.
//
// GYÖKÉROK (valódi Vercel Preview, 2026-09-08, "EXTERNAL REST POINT
// RESOLUTION MISMATCH"): a discovery (nearby) lépés mindhárom forrásból
// (USER/VEDETT_SAROK/OSM) normalizált RestPoint DTO-kat ad vissza, de a
// /route-to-rest-point végpont korábban KIZÁRÓLAG a rest_points DB
// táblában (listOwnRestPoints()) keresett — forrástól függetlenül. Egy
// OSM candidate id-je ("osm:node/123") vagy egy VédettSarok candidate
// id-je ("vedett-sarok:<placeId>") SOHA nem egyezik egy rest_points
// UUID-vel, ezért minden OSM/VEDETT_SAROK kiválasztás garantáltan 404-et
// (korábban helytelenül "REST_POINT_NO_ROUTE" reason-nel) adott, MÉG a
// MOTIS hívás előtt.
//
// EZ A MODUL alias-mentes (csak relatív import), hogy node --test alól,
// Supabase/places DB nélkül tesztelhető legyen — ugyanaz az elv, mint
// discovery/vedettSarokMapping.ts fejlécében. A TÉNYLEGES DB-hívásokat
// (listOwnRestPoints() / getApprovedPlaces()) a hívó API route
// (app/api/vedett-route/rest-stops/route-to-rest-point/route.ts) végzi —
// ez a modul KIZÁRÓLAG a már lekérdezett adatokon dönt.
//
// AUTHORITATIVE SOURCE forrásonként (2026-09-08 audit döntés):
//  - USER: KIZÁRÓLAG a rest_points DB (RLS-scoped, listOwnRestPoints()) —
//    a kliens semmilyen mezőjét (koordináta, név) NEM tekintjük
//    authoritative-nek, csak az id-t használjuk kulcsként a saját
//    (RLS-szűrt) pontok között.
//  - VEDETT_SAROK: KIZÁRÓLAG a "places" tábla (getApprovedPlaces() +
//    rest_point_eligible === true explicit kapu, lásd
//    discovery/vedettSarokMapping.ts mapEligiblePlaceToRestPoint()) — a
//    kliens koordinátáját/nevét itt sem használjuk, mindig a places
//    sorból olvasunk.
//  - OSM: a discovery candidate payload (amit a kliens a /nearby
//    válaszból, változatlanul kapott vissza és küld most tovább) az
//    authoritative source. INDOK: az OSM/Overpass adat nem resolve-olható
//    újra koordináta/userId nélkül anélkül, hogy egy MÁSODIK Overpass
//    hívást indítanánk ugyanazon user action alatt (lásd osmProvider.ts
//    request-storm szabálya és az Overpass 406 hotfix "406 után ugyanazon
//    user action alatt ne küldj még egy Overpass requestet" elve) — és az
//    OSM pontot SOHA nem mentjük el a rest_points DB-be (privacy: nincs
//    "külső hely a saját pihenőpontjaid közt" összemosás, lásd
//    supabase/migrations/20260907_rest_points.sql
//    rest_points_user_source_only CHECK constraint). A payload szigorúan
//    validált (lásd schemas.ts osmRestPointRefSchema: id formátum,
//    lat/lon tartomány, name hossz) — ez a kompromisszum a "ne bízz
//    korlátlanul a kliensben" elv és a "ne mentsd DB-be / ne generálj
//    plusz Overpass hívást" elv között.

import type { RestPoint } from "../../rest-points/types.ts";
import type { Place } from "../../types.ts";
import { mapEligiblePlaceToRestPoint } from "./discovery/vedettSarokMapping.ts";

export type SelectedRestPointRef =
  | { source: "USER"; id: string }
  | { source: "VEDETT_SAROK"; id: string }
  | { source: "OSM"; id: string; name: string; latitude: number; longitude: number };

const VEDETT_SAROK_ID_PREFIX = "vedett-sarok:";

export function resolveUserRestPoint(
  ownPoints: RestPoint[],
  ref: Extract<SelectedRestPointRef, { source: "USER" }>
): RestPoint | null {
  // Kizárólag az id alapján keresünk — az ownPoints már RLS-scope-olt
  // (listOwnRestPoints() csak a hívó saját pontjait adja vissza), tehát
  // egy másik felhasználó pontjának id-je itt eleve nem szerepelhet.
  return ownPoints.find((rp) => rp.id === ref.id) ?? null;
}

export function resolveVedettSarokRestPoint(
  places: Place[],
  ref: Extract<SelectedRestPointRef, { source: "VEDETT_SAROK" }>
): RestPoint | null {
  if (!ref.id.startsWith(VEDETT_SAROK_ID_PREFIX)) return null;
  const placeId = ref.id.slice(VEDETT_SAROK_ID_PREFIX.length);
  const place = places.find((p) => p.id === placeId);
  if (!place) return null;
  // mapEligiblePlaceToRestPoint() MÁR elvégzi a rest_point_eligible ===
  // true explicit kaput és a koordináta-meglétet — egy nem-eligible vagy
  // koordináta nélküli place itt null-t ad, tehát ugyanúgy "nem
  // feloldható"-ként kezelődik, mint egy nem létező id.
  return mapEligiblePlaceToRestPoint(place);
}

export function resolveOsmRestPoint(ref: Extract<SelectedRestPointRef, { source: "OSM" }>): RestPoint {
  // Tisztán a validált (schemas.ts osmRestPointRefSchema) kliens-
  // payloadból építjük — lásd fenti fejléc "AUTHORITATIVE SOURCE"
  // szakasza. SOHA nem íródik DB-be, SOHA nem indít újabb Overpass
  // hívást.
  return {
    id: ref.id,
    createdBy: "osm",
    name: ref.name,
    latitude: ref.latitude,
    longitude: ref.longitude,
    source: "OSM",
    visibility: "PUBLIC",
    toilet: null,
    seating: null,
    quietSpace: null,
    indoors: null,
    outdoors: null,
    purchaseRequired: null,
    notes: null,
    createdAt: "",
    updatedAt: "",
  };
}

export function resolveSelectedRestPoint(
  ref: SelectedRestPointRef,
  data: { ownPoints: RestPoint[]; places: Place[] }
): RestPoint | null {
  if (ref.source === "USER") return resolveUserRestPoint(data.ownPoints, ref);
  if (ref.source === "VEDETT_SAROK") return resolveVedettSarokRestPoint(data.places, ref);
  return resolveOsmRestPoint(ref);
}
