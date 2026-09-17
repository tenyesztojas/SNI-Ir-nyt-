// NAVIGATION — TRANSIT GEOMETRY CONFIDENCE (Safety Sprint, 2026-09-17).
//
// ROOT CAUSE (VPS-proven S40 eset, Déli pu. -> Kelenföld, 17:20, MOTIS
// tripId 20260917_17:20_mavgtfs_32616577_2872, mode=REGIONAL_RAIL): ehhez a
// járathoz a MOTIS válasz legGeometry.length=2 (a nyers GTFS shape is
// mindössze 1 shape point-ot tartalmaz) — a leg SAJÁT geometriája
// gyakorlatilag egy egyenes vonal a beszállási és a leszállási pont között,
// NEM a jármű tényleges pályája. Mivel lib/vedett-route/geometry.ts
// journeyLegsToNavigationRoute() UGYANEZT a dekódolt koordináta-tömböt adja
// oda MIND a térkép rajzolásának, MIND a navigáció OFF_ROUTE/BOARDED
// logikájának (lásd annak fejléc-kommentjét), egy ilyen "gyenge" geometria
// esetén a GPS-projekció (projectPointToRoute) távolsága NEM bizonyítja,
// hogy a user letért az útvonalról vagy hogy nem szállt fel — csak azt,
// hogy távol van a leegyszerűsített, két-pontos vonaltól.
//
// EZ A MODUL NEM egy új geometria-forrás és NEM egy "accuracy"-becslés — a
// MÁR meglévő, journeyLegsToNavigationRoute() által kiszámolt
// legCoordinates PONTSZÁMÁT és a leg (normalizált) transitMode-ját
// használja fel, hogy egy EGYSZERŰ, determinisztikus "usable" vs. "weak"
// besorolást adjon. Ez SOSEM állítja, hogy egy "USABLE" geometria térben
// pontos — csak azt, hogy nem bizonyítottan egy leegyszerűsített
// fallback-vonal.

export type TransitGeometryConfidence = "USABLE" | "WEAK";

/**
 * Sínhez/vezetett pályához kötött módok, ahol a jármű NEM tud szabadon
 * letérni a hivatalos nyomvonalról — ezért egy WEAK (leegyszerűsített)
 * geometria esetén a GPS-eltérés önmagában SOSEM bizonyítja az OFF_ROUTE-ot
 * vagy a le nem szállást. A `transitMode` a JourneyLeg NORMALIZÁLT mezője
 * (lib/vedett-route/orchestrator.ts mapLeg(): a nyers MOTIS leg.mode-ot adja
 * tovább változatlanul TRANSIT esetén) — ez a regiszter EZT a normalizált
 * értéket olvassa, nem duplikál egy külön raw-mode listát. BUS-t
 * SZÁNDÉKOSAN nem tartalmaz: a sprint spec kizárólag akkor engedi a
 * BUS-viselkedés módosítását, ha elkerülhetetlen — itt nem az.
 */
const RAIL_GUIDED_TRANSIT_MODES: ReadonlySet<string> = new Set(["RAIL", "REGIONAL_RAIL", "SUBWAY", "TRAM"]);

/**
 * Minimális pontszám, ami alatt a leg SAJÁT geometriáját (legCoordinates,
 * lásd lib/vedett-route/geometry.ts journeyLegsToNavigationRoute()) "weak"-
 * nek (leegyszerűsített / fallback-szerű) tekintjük. A VPS-proven S40 eset
 * pontszáma (2) EZ ALATT van; egy valódi, MOTIS által dekódolt polyline
 * ennél tipikusan lényegesen több pontot ad.
 */
const MIN_RELIABLE_TRANSIT_GEOMETRY_POINTS = 3;

/** A leg (normalizált) transitMode-ja sínhez/vezetett pályához kötött-e. */
export function isRailGuidedTransitMode(transitMode: string | null | undefined): boolean {
  if (!transitMode) return false;
  return RAIL_GUIDED_TRANSIT_MODES.has(transitMode);
}

/**
 * A megadott TRANSIT leg SAJÁT geometriájának (legCoordinates) megbízhatósága.
 * Kizárólag a pontszámot nézi — ÚJ mérést/becslést nem vezet be, és SOSEM
 * állítja, hogy egy "USABLE" geometria térben pontos, csak azt, hogy nem
 * bizonyítottan egy 2-pontos fallback-vonal.
 */
export function classifyTransitGeometryConfidence(
  legCoordinates: readonly unknown[] | null | undefined,
): TransitGeometryConfidence {
  if (!legCoordinates || legCoordinates.length < MIN_RELIABLE_TRANSIT_GEOMETRY_POINTS) return "WEAK";
  return "USABLE";
}
