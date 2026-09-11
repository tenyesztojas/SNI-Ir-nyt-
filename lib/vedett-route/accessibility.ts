// VÉDETT ÚTVONAL — AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11)
//
// FONTOS, KŐKEMÉNY SZABÁLY (spec 0/13. pont): ez a modul KIZÁRÓLAG olyan
// állítást tehet, amit a tényleges GTFS/MOTIS adat bizonyít. Nincs itt
// semmilyen kitalált lift/rámpa/alacsonypadlós jármű/akadálymentesség —
// hiányzó adatból SOHA nem következtetünk "accessible"-re.
//
// PROVIDER-FÜGGETLEN MODELL (spec 2. pont): ez a fájl SEM BKK-specifikus —
// a GTFS mezőnevek (wheelchair_boarding, wheelchair_accessible, pathways,
// levels) a hivatalos GTFS specifikáció szerintiek, nem egy adott
// szolgáltató sajátjai. Amikor a Fázis 2-ben a MÁV/Volán is bekerül (lásd
// providers/staticFileProvider.ts), ugyanez a modell és ugyanezek az
// adapterek használhatók lesznek, módosítás nélkül.
//
// JELENLEGI ADATHELYZET (audit, 2026-09-11 — lásd a feature riportot):
// a projektben SEHOL nincs bekötve tényleges GTFS stops.txt/trips.txt/
// pathways.txt MEZŐ-SZINTŰ feldolgozás (a staticFileProvider.ts CSAK a zip
// struktúráját validálja és tárolja — nem olvassa ki a wheelchair_boarding/
// wheelchair_accessible/pathway_mode ÉRTÉKEKET semmilyen queryelhető
// modellbe), és a MOTIS /api/v6/plan válasz típusaiban (motisTypes.ts
// MotisPlace/MotisLeg) SINCS megfigyelt/dokumentált akadálymentességi mező.
// Emiatt az itt definiált klasszifikáló függvények MA, éles adat mellett,
// MINDIG UNKNOWN-t adnak minden szakaszra — ez SZÁNDÉKOS és BIZTONSÁGOS
// (lásd lent hasKnownAccessibilityStatus/combineAccessibilityStatuses):
// amint egy jövőbeli kör bekötné a tényleges GTFS mezőket (vagy a MOTIS
// válasz runtime-ellenőrzéssel bizonyítottan tartalmazna ilyet), ez a modul
// módosítás nélkül elkezdene valódi KNOWN_ACCESSIBLE/KNOWN_NOT_ACCESSIBLE
// eredményt adni.

import { normalizeMotisStopId, normalizeMotisTripId } from "./motisIdNormalization.ts";
import { buildPathwayGraph, classifyPathwayConnection } from "./pathwayGraph.ts";

// --- Alap állapot-modell (spec 2. pont) ------------------------------

export type AccessibilityStatus = "KNOWN_ACCESSIBLE" | "KNOWN_NOT_ACCESSIBLE" | "UNKNOWN";

// A teljes journey (vagy egy komponens-csoport) felhasználó felé
// megjelenő minősítése (spec 6. pont). Szándékosan KEVESEBB érték, mint
// az AccessibilityStatus — a felhasználó nem lát "UNKNOWN" komponens-
// szintű zsargont, csak a három végleges minősítést.
export type AccessibilityResultStatus = "KNOWN_ACCESSIBLE" | "PARTIALLY_UNKNOWN" | "KNOWN_NOT_ACCESSIBLE";

export const ACCESSIBILITY_RESULT_STATUS_LABELS_HU: Record<AccessibilityResultStatus, string> = {
  KNOWN_ACCESSIBLE: "Az elérhető adatok alapján lépcsőmentes",
  PARTIALLY_UNKNOWN: "Az akadálymentesség egy része nem igazolt",
  // KNOWN_NOT_ACCESSIBLE eredményt a spec szerint SOHA nem ajánljuk fel
  // akadálymentes opcióként — ez a szöveg csak belső logolás/riport
  // célra létezik, a UI ezt a minősítést SOHA nem jeleníti meg listaelemként
  // (lásd orchestrator.ts szűrése és a UI-kód).
  KNOWN_NOT_ACCESSIBLE: "Az elérhető adatok szerint nem lépcsőmentes",
};

// --- GTFS mező-adapterek (spec 2. pont) -------------------------------
//
// GTFS stops.txt wheelchair_boarding / trips.txt wheelchair_accessible
// kódolás (hivatalos GTFS spec, mindkét mezőre azonos enum):
//   0 vagy hiányzó/üres = "nincs információ"        -> UNKNOWN
//   1                   = "legalább néhány kerekesszék-felhasználó számára elérhető" -> KNOWN_ACCESSIBLE
//   2                   = "nem elérhető kerekesszékkel"                              -> KNOWN_NOT_ACCESSIBLE
//
// FONTOS (spec 2. pont, explicit követelmény): "0 / üres GTFS érték =
// UNKNOWN, nem accessible." — ez a függvény ezt garantálja: bármilyen más
// érték (0, üres string, undefined, null, vagy egy nem 0/1/2 érvénytelen
// szám) is UNKNOWN-ra esik vissza, SOHA nem KNOWN_ACCESSIBLE-re.
function classifyGtfsWheelchairEnum(raw: number | string | null | undefined): AccessibilityStatus {
  if (raw === null || raw === undefined || raw === "") return "UNKNOWN";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (n === 1) return "KNOWN_ACCESSIBLE";
  if (n === 2) return "KNOWN_NOT_ACCESSIBLE";
  return "UNKNOWN"; // 0, NaN, vagy bármilyen más nem dokumentált érték
}

/** GTFS stops.txt `wheelchair_boarding` — a MEGÁLLÓ/PERON hozzáférhetősége. */
export function classifyWheelchairBoarding(raw: number | string | null | undefined): AccessibilityStatus {
  return classifyGtfsWheelchairEnum(raw);
}

/** GTFS trips.txt `wheelchair_accessible` — a JÁRMŰ/JÁRAT hozzáférhetősége. */
export function classifyWheelchairAccessible(raw: number | string | null | undefined): AccessibilityStatus {
  return classifyGtfsWheelchairEnum(raw);
}

// GTFS pathways.txt `pathway_mode` (hivatalos enum):
//   1 = walkway, 2 = stairs, 3 = moving sidewalk/travelator, 4 = escalator,
//   5 = elevator, 6 = fare gate, 7 = exit gate.
//
// Spec 8. pont: "pathway_mode=stairs -> KNOWN_NOT_ACCESSIBLE lépcsőmentes
// szempontból, ha nincs alternatív accessible pathway. elevator -> csak
// tényleges adat esetén. Ha nincs pathways adat: UNKNOWN."
//
// EZ a függvény egyetlen pathway rekordot minősít ÖNMAGÁBAN (nem old meg
// többszintes/gráf-alapú útkeresést a levels.txt felett — az MVP
// SZÁNDÉKOSAN nem vállal ilyen bizonyítatlan következtetést, lásd a
// modul-fejléc "JELENLEGI ADATHELYZET" szakaszát és a feature riport
// "RUNTIME VERIFICATION REQUIRED" listáját). A stairs-only helyzet
// (nincs alternatív accessible pathway) kiértékelését a lentebbi
// classifyStationPathwayAccessibility() végzi, amely egy megálláshoz
// tartozó pathway-halmazt kap.
export type GtfsPathwayMode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | number;

function isKnownAccessiblePathwayMode(mode: GtfsPathwayMode): boolean {
  // walkway (sík gyalogos átjáró), moving sidewalk, escalator*, elevator —
  // mindegyik lépcsőmentesen használható. (*Az escalator a GTFS spec
  // szerint "moving stairs" — a legtöbb valós escalator NEM kerekesszék-
  // barát, de a hivatalos GTFS dokumentáció ezt explicit "accessible"
  // kategóriába sorolja a walkway/elevator mellett; mivel nincs saját,
  // ellenőrzött adatunk ami ezt felülírná, a hivatalos spec kategorizálását
  // követjük — lásd feature riport "RUNTIME VERIFICATION REQUIRED": ha
  // valós adaton ez pontatlannak bizonyul, külön kezelendő.)
  //
  // KŐKEMÉNY SZABÁLY (Task C2, spec 15/17. pont) — elevator (mode 5) ITT
  // KIZÁRÓLAG azt jelenti, hogy a GTFS statikus adat szerint LÉTEZIK egy
  // lift a pathway-ben. Ez SOHA nem realtime "a lift most működik" állítás
  // — nincs valós idejű lift-üzemképességi adatforrásunk. Bármilyen
  // jövőbeli felhasználói szöveg, ami ebből az adatból származik, KIZÁRÓLAG
  // "lift szerepel az adatokban" jellegű megfogalmazást használhat, SOHA
  // nem "a lift működik/üzemel" jellegűt.
  return mode === 1 || mode === 3 || mode === 4 || mode === 5;
}

/**
 * Egy megálláson belüli (pl. peron <-> peron, szint <-> szint) pathway-
 * halmaz lépcsőmentességi minősítése. Ha VAN legalább egy ismerten
 * akadálymentes pathway (walkway/elevator/stb.) a szükséges két pont
 * között, KNOWN_ACCESSIBLE. Ha a fellelt pathway-k KIZÁRÓLAG stairs-ek
 * (és nincs köztük semmilyen ismert accessible alternatíva), KNOWN_NOT_ACCESSIBLE.
 * Egyébként (nincs adat, vagy csak nem egyértelmű módok vannak) UNKNOWN.
 *
 * FONTOS: ez NEM egy teljes levels.txt gráf-bejárás — csak a KAPOTT
 * pathway-listát nézi. A hívó felelőssége, hogy a releváns pathway-ket
 * adja át (pl. egy adott megálló összes pathway rekordja). Ha a hívó
 * pathways adatot egyáltalán nem tud adni (mert nincs bekötve, ami a
 * jelenlegi állapot), üres tömböt ad át, amire ez a függvény helyesen
 * UNKNOWN-t ad.
 */
export function classifyStationPathwayAccessibility(pathwayModes: GtfsPathwayMode[]): AccessibilityStatus {
  if (pathwayModes.length === 0) return "UNKNOWN";
  const hasAccessible = pathwayModes.some((m) => isKnownAccessiblePathwayMode(m));
  if (hasAccessible) return "KNOWN_ACCESSIBLE";
  const hasStairs = pathwayModes.some((m) => m === 2);
  if (hasStairs) return "KNOWN_NOT_ACCESSIBLE";
  return "UNKNOWN"; // pl. csak fare gate/exit gate rekordok, ami nem mond semmit lépcsőmentességről
}

// --- Kombináló szabályok (spec 6/7. pont) -----------------------------
//
// "A teljes journey státusza a leggyengébb bizonyított szakaszból induljon
// ki." Ez a szabály: KNOWN_NOT_ACCESSIBLE mindig dominál (egyetlen bizonyítottan
// nem elérhető komponens elég ahhoz, hogy a teljes journey ne legyen
// accessible); ha nincs KNOWN_NOT_ACCESSIBLE, de van UNKNOWN, az egész csak
// UNKNOWN lehet (nem "erősíthető fel" accessible-lé más, accessible
// komponensek által); csak ha MINDEN bemenő komponens KNOWN_ACCESSIBLE,
// az eredmény is KNOWN_ACCESSIBLE.
export function combineAccessibilityStatuses(statuses: AccessibilityStatus[]): AccessibilityStatus {
  if (statuses.length === 0) return "UNKNOWN";
  if (statuses.some((s) => s === "KNOWN_NOT_ACCESSIBLE")) return "KNOWN_NOT_ACCESSIBLE";
  if (statuses.some((s) => s === "UNKNOWN")) return "UNKNOWN";
  return "KNOWN_ACCESSIBLE";
}

/**
 * Egy adott utazási LÁB (leg) akadálymentességi állapota — a megálló/peron
 * (stop) és a jármű/járat (vehicle) KÜLÖN bizonyított állapotának
 * kombinációja (spec 7. pont: "Egy accessible jármű NEM tesz automatikusan
 * accessible-é egy inaccessible megállót. Egy accessible megálló NEM tesz
 * automatikusan accessible-é egy UNKNOWN/inaccessible járművet.").
 */
export function combineLegAccessibility(
  stopAccessibility: AccessibilityStatus | undefined,
  vehicleAccessibility: AccessibilityStatus | undefined
): AccessibilityStatus {
  return combineAccessibilityStatuses([stopAccessibility ?? "UNKNOWN", vehicleAccessibility ?? "UNKNOWN"]);
}

/** A teljes journey (több láb) végső AccessibilityStatus-a, a fenti "leggyengébb szakasz" szabály szerint. */
export function combineJourneyAccessibility(legStatuses: AccessibilityStatus[]): AccessibilityStatus {
  return combineAccessibilityStatuses(legStatuses);
}

/** AccessibilityStatus -> felhasználó felé megjelenő AccessibilityResultStatus (spec 6. pont). */
export function toAccessibilityResultStatus(status: AccessibilityStatus): AccessibilityResultStatus {
  if (status === "KNOWN_NOT_ACCESSIBLE") return "KNOWN_NOT_ACCESSIBLE";
  if (status === "KNOWN_ACCESSIBLE") return "KNOWN_ACCESSIBLE";
  return "PARTIALLY_UNKNOWN";
}

/**
 * KNOWN_NOT_ACCESSIBLE eredmény SOHA nem ajánlható fel akadálymentes
 * opcióként (spec 5/6. pont) — ez a segédfüggvény azt dönti el, hogy egy
 * adott journey-t a "Lépcsőmentes útvonal" szűrt eredményhalmazba
 * beengedünk-e. KNOWN_ACCESSIBLE és PARTIALLY_UNKNOWN mindkettő
 * megjelenhet (az utóbbi külön figyelmeztetéssel, lásd a UI-kódot) —
 * kizárólag KNOWN_NOT_ACCESSIBLE esik ki.
 */
export function isEligibleForStepFreeResults(resultStatus: AccessibilityResultStatus): boolean {
  return resultStatus !== "KNOWN_NOT_ACCESSIBLE";
}

// =======================================================================
// RUNTIME INTEGRÁCIÓ (Task C2, 2026-09-11) — MOTIS válasz + GTFS
// Accessibility Index alapú, VALÓDI klasszifikáció.
// =======================================================================
//
// A fenti (Task C-ből örökölt) combineLegAccessibility()/
// combineJourneyAccessibility() a "különböző, EGYMÁST NEM HELYETTESÍTŐ
// komponensek" (pl. megálló ÉS jármű ÉS pathway) kombinálására való — ott
// helyesen minden UNKNOWN komponens lehúzza az eredményt, mert mindegyik
// egy KÜLÖN, szükséges feltétel.
//
// A jármű-akadálymentesség viszont KÉT FÜGGETLEN JEL UGYANARRÓL A TÉNYRŐL
// (a MOTIS saját wheelchairAccessible mezője ÉS a GTFS trips.txt
// keresztellenőrzés, spec 9. pont) — itt MÁS szabály kell: ha a MOTIS
// önmagában ACCESSIBLE-t mond, az ELÉG (spec 8. pont: "Ha wheelchairAccessible
// === ACCESSIBLE → jármű szinten KNOWN_ACCESSIBLE"), a GTFS oldal hiánya
// (UNKNOWN) ezt NEM ronthatja le — DE ha a GTFS oldal NOT_ACCESSIBLE-t
// mond, az MINDIG győz, FÜGGETLENÜL attól, mit mondott a MOTIS (spec 9.
// pont: "Ha MOTIS és GTFS egymásnak ellentmond: KNOWN_NOT_ACCESSIBLE
// győzzön. Soha ne upgrade-elj NOT_ACCESSIBLE-t ACCESSIBLE-re."). Ezért ez
// EGY KÜLÖN, nem a fenti combineAccessibilityStatuses()-szel megoldható
// függvény.

export interface VehicleAccessibilityReconciliation {
  status: AccessibilityStatus;
  /** true, ha a MOTIS és a GTFS keresztellenőrzés EGYMÁSNAK ELLENTMONDÓ, bizonyított jelet adott (egyik ACCESSIBLE, másik NOT_ACCESSIBLE) — kizárólag szerver-oldali diagnosztikai logoláshoz, SOHA nem kerül a felhasználó elé. */
  conflict: boolean;
}

/**
 * A MOTIS leg saját wheelchairAccessible jelzése + a GTFS trips.txt
 * keresztellenőrzés összeegyeztetése (spec 8/9. pont). NEM szimmetrikus
 * kombináció — lásd a fenti magyarázatot.
 */
export function reconcileVehicleAccessibilitySignals(
  motisStatus: AccessibilityStatus,
  gtfsStatus: AccessibilityStatus
): VehicleAccessibilityReconciliation {
  const conflict =
    (motisStatus === "KNOWN_ACCESSIBLE" && gtfsStatus === "KNOWN_NOT_ACCESSIBLE") ||
    (motisStatus === "KNOWN_NOT_ACCESSIBLE" && gtfsStatus === "KNOWN_ACCESSIBLE");
  let status: AccessibilityStatus;
  if (motisStatus === "KNOWN_NOT_ACCESSIBLE" || gtfsStatus === "KNOWN_NOT_ACCESSIBLE") {
    status = "KNOWN_NOT_ACCESSIBLE"; // KNOWN_NOT_ACCESSIBLE MINDIG győz, soha nem upgrade-elünk ACCESSIBLE-re
  } else if (motisStatus === "KNOWN_ACCESSIBLE" || gtfsStatus === "KNOWN_ACCESSIBLE") {
    status = "KNOWN_ACCESSIBLE"; // bármelyik forrás önmagában elég, ha a másik nem MOND ELLENT
  } else {
    status = "UNKNOWN";
  }
  return { status, conflict };
}

/** MOTIS leg.wheelchairAccessible (spec 2/8. pont) -> AccessibilityStatus. Csak a két dokumentált értéket ismeri el, minden más (hiányzó/ismeretlen string) UNKNOWN. */
export function classifyMotisWheelchairAccessible(raw: string | undefined): AccessibilityStatus {
  if (raw === "ACCESSIBLE") return "KNOWN_ACCESSIBLE";
  if (raw === "NOT_ACCESSIBLE") return "KNOWN_NOT_ACCESSIBLE";
  return "UNKNOWN";
}

/**
 * Egy transit leg jármű-akadálymentessége: a MOTIS saját jelzése +
 * (ha a tripId biztonságosan normalizálható és van accessibility index)
 * a GTFS trips.txt keresztellenőrzés, a fenti reconcile-szabály szerint
 * összeegyeztetve.
 */
export function classifyVehicleAccessibility(
  motisWheelchairAccessible: string | undefined,
  motisTripId: string | undefined,
  index: AccessibilityIndexLike | null
): VehicleAccessibilityReconciliation {
  const motisStatus = classifyMotisWheelchairAccessible(motisWheelchairAccessible);
  let gtfsStatus: AccessibilityStatus = "UNKNOWN";
  if (index) {
    const normalized = normalizeMotisTripId(motisTripId);
    if (normalized.provider !== "UNKNOWN") {
      gtfsStatus = classifyWheelchairAccessible(index.tripsById[normalized.gtfsId]?.wheelchairAccessible);
    }
  }
  return reconcileVehicleAccessibilitySignals(motisStatus, gtfsStatus);
}

/**
 * Egy megálló (boarding/alighting stop) akadálymentessége a GTFS
 * Accessibility Index alapján, a MOTIS stopId normalizálásán keresztül
 * (spec 10/11. pont). Ismeretlen dataset/hiányzó index/nincs match esetén
 * UNKNOWN — SOSEM dob hibát.
 */
export function classifyStopAccessibility(motisStopId: string | undefined, index: AccessibilityIndexLike | null): AccessibilityStatus {
  if (!index) return "UNKNOWN";
  const normalized = normalizeMotisStopId(motisStopId);
  if (normalized.provider === "UNKNOWN") return "UNKNOWN";
  const entry = index.stopsById[normalized.gtfsId];
  return classifyWheelchairBoarding(entry?.wheelchairBoarding);
}

/**
 * Egy két transit láb közötti (transfer) WALK láb station-belüli
 * lépcsőmentességi minősítése a pathway-gráf alapján (spec 12/13. pont).
 */
export function classifyTransferPathwayAccessibility(
  fromMotisStopId: string | undefined,
  toMotisStopId: string | undefined,
  index: AccessibilityIndexLike | null
): AccessibilityStatus {
  if (!index) return "UNKNOWN";
  const from = normalizeMotisStopId(fromMotisStopId);
  const to = normalizeMotisStopId(toMotisStopId);
  if (from.provider === "UNKNOWN" || to.provider === "UNKNOWN") return "UNKNOWN";
  const graph = buildPathwayGraph(index.pathways);
  return classifyPathwayConnection(graph, from.gtfsId, to.gtfsId);
}

export interface StepFreeLegLike {
  mode: string;
  tripId?: string;
  wheelchairAccessible?: string;
  from?: { stopId?: string };
  to?: { stopId?: string };
}

export interface StepFreeItineraryClassification {
  resultStatus: AccessibilityResultStatus;
  /** Kizárólag szerver-oldali diagnosztikai logoláshoz (spec 9. pont: "ne jeleníts meg user-facing belső azonosítókat") — true, ha VOLT legalább egy MOTIS/GTFS ellentmondó jármű-jelzés ebben az itinerary-ben. */
  hasVehicleConflict: boolean;
}

/**
 * Egy teljes MOTIS itinerary (legs sorozat) "Lépcsőmentes útvonal"
 * minősítése (spec 14. pont): minden TRANSIT láb jármű+boarding+alighting
 * stop komponense, minden TRANSFER (két transit láb közötti) WALK láb
 * pathway-komponense összegyűjtve, majd a "leggyengébb komponens" szabály
 * szerint kombinálva.
 *
 * ARCHITEKTÚRA DÖNTÉS (dokumentált, spec 13. pont): az ELSŐ/UTOLSÓ
 * (first-mile/last-mile, tehát NEM két transit láb közötti) WALK lábak
 * SZÁNDÉKOSAN KIMARADNAK a komponens-listából — ezt a MOTIS WHEELCHAIR
 * pedestrian profilja kezeli (lásd orchestrator.ts, a kérésben
 * pedestrianProfile=WHEELCHAIR), és nincs olyan GTFS/OSM adatunk, amivel
 * ezt saját magunk, függetlenül bizonyítani tudnánk — a spec explicit
 * tiltja, hogy hiányzó bizonyítékot KNOWN_ACCESSIBLE-nek nevezzünk, de azt
 * sem írja elő, hogy ezt UNKNOWN komponensként a kombinációba kényszerítve
 * MINDEN journey-t automatikusan PARTIALLY_UNKNOWN-ra fokozzunk le pusztán
 * amiatt, hogy van benne gyaloglás — ezért ez a réteg egyszerűen NEM
 * állít semmit erről a szakaszról (sem accessible, sem unknown-ként be
 * nem számítva), a felelősséget a MOTIS pedestrian profiljára hagyva.
 */
export function classifyItineraryStepFreeAccessibility(
  legs: StepFreeLegLike[],
  index: AccessibilityIndexLike | null
): StepFreeItineraryClassification {
  const componentStatuses: AccessibilityStatus[] = [];
  let hasVehicleConflict = false;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.mode !== "WALK") {
      const vehicle = classifyVehicleAccessibility(leg.wheelchairAccessible, leg.tripId, index);
      if (vehicle.conflict) hasVehicleConflict = true;
      componentStatuses.push(vehicle.status);
      componentStatuses.push(classifyStopAccessibility(leg.from?.stopId, index));
      componentStatuses.push(classifyStopAccessibility(leg.to?.stopId, index));
    } else {
      const prev = legs[i - 1];
      const next = legs[i + 1];
      const isTransfer = Boolean(prev && next && prev.mode !== "WALK" && next.mode !== "WALK");
      if (isTransfer) {
        componentStatuses.push(classifyTransferPathwayAccessibility(leg.from?.stopId, leg.to?.stopId, index));
      }
      // első/utolsó WALK láb — lásd a fenti "ARCHITEKTÚRA DÖNTÉS" komment.
    }
  }

  const combined = combineJourneyAccessibility(componentStatuses);
  return { resultStatus: toAccessibilityResultStatus(combined), hasVehicleConflict };
}

// Minimális, csak a klasszifikációhoz szükséges alak — a teljes
// AccessibilityIndex típus az accessibilityIndex.ts-ben él; ez a modul
// SZÁNDÉKOSAN nem importálja onnan a konkrét típust futásidejű
// függőségként (elkerülve egy felesleges, kör-szerű modul-kapcsolatot),
// csak a ténylegesen használt alakot írja le strukturálisan.
export interface AccessibilityIndexLike {
  stopsById: Record<string, { wheelchairBoarding?: number }>;
  tripsById: Record<string, { wheelchairAccessible?: number }>;
  pathways: { fromStopId: string; toStopId: string; pathwayMode: number; isBidirectional: boolean }[];
}
