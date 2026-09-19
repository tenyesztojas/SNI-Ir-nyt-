"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Journey, OrchestratedSearchResult, PersonalizationWeights, RankedJourney, RankingLabel, ServiceAlert } from "@/lib/vedett-route/types";
import type { AccessibilityResultStatus } from "@/lib/vedett-route/accessibility";
import dynamic from "next/dynamic";
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import { useRouteNavigation } from "@/lib/hooks/useRouteNavigation";
import { useWalkToTransitBoundary } from "@/lib/hooks/useWalkToTransitBoundary";
import { useScreenWakeLock } from "@/lib/hooks/useScreenWakeLock";
import { journeyLegsToNavigationRoute } from "@/lib/vedett-route/geometry";
import {
  buildLegStopProgress,
  buildNavigationInstructions,
  isAtRouteEnd,
  resolveActiveLegIndex,
  resolveLegPhaseFraction,
  resolveRemainingStops,
  selectActiveInstructionWithStopProgress,
} from "@/lib/vedett-route/navigation/instructions";
// NAVIGATION — WALK TURN-BY-TURN PROGRESS (Sprint 5, 2026-09-16) — a Sprint 4
// pure walkManoeuvre.ts detektor ÉS a Sprint 5 pure walkManoeuvreProgress.ts
// híd MINIMÁLIS bekötése: az AKTÍV WALK leg manőverlistája és a
// current/next kiválasztás TELJESEN a MEGLÉVŐ displayedJourney/routeProgress
// adatokból van levezetve (useMemo) — nincs új, párhuzamos navigációs state.
import { detectWalkManoeuvres } from "@/lib/vedett-route/navigation/walkManoeuvre";
import {
  buildWalkInstructionText,
  cumulativeDistanceToVertex,
  resolveDistanceAlongLegMeters,
  resolveWalkProgress,
} from "@/lib/vedett-route/navigation/walkManoeuvreProgress";
// NAVIGATION — NEXT-INSTRUCTION PREVIEW (Sprint 6, 2026-09-16) — a MEGLÉVŐ
// navigationInstructions/navigationInstructionForDisplay/activeWalkProgress
// DERIVÁLT adataiból egy rövid "Utána: ..." preview-szöveg. Nincs új state.
import { resolveInstructionPreview } from "@/lib/vedett-route/navigation/instructionPreview";
// NAVIGATION — ACTIVE-LEG REALTIME INFO (Sprint 7, 2026-09-16) — a MÁR
// MEGLÉVŐ JourneyLeg.realtime/delayMinutes/cancelled mezők navigációs
// megjelenítése. Nincs új adatforrás, nincs Sensory Data V2.
import { resolveNavigationRealtimeInfo } from "@/lib/vedett-route/navigation/realtimeInfo";
// NAVIGATION — WALK→TRANSIT BOUNDARY + TRANSFER TIMING (Sprint 7.1,
// 2026-09-16). Lásd a modulok fejlécét: a MEGLÉVŐ geometriai activeLegIndex-
// et FINOMÍTJA (nem helyettesíti egy második state machine-nel), és a MÁR
// MEGLÉVŐ JourneyLeg idő-mezőket olvassa (nincs új adatforrás).
import {
  createInitialWalkToTransitBoundaryState,
  resolveWalkToTransitBoundary,
  type WalkToTransitBoundaryState,
} from "@/lib/vedett-route/navigation/legTransition";
import { resolveNavigationTransferTiming } from "@/lib/vedett-route/navigation/transferTiming";
// NAVIGATION — LIVE TRANSIT REALTIME REFRESH (Sprint 7.2, 2026-09-16) — a
// MÁR MEGLÉVŐ displayedJourney TRANSIT lábainak realtime mezőit (departure/
// arrival/delay/cancelled) frissíti, PONTOS stabil identitás (tripId)
// alapján, egy PURE merge-en keresztül. Nincs új navigációs state machine —
// a hook csak a meglévő setDisplayedJourney(prev => ...) functional update
// mintát használja (lásd rerouteSessionRef staleness-guard, ugyanaz a
// mintázat, mint az automatikus reroute effektnél).
import { useTransitRealtimeRefresh } from "@/lib/hooks/useTransitRealtimeRefresh";
import { mergeRealtimeUpdates } from "@/lib/vedett-route/realtimeRefresh/mergeRealtimeUpdates";
// NAVIGATION FOUNDATION (2026-09-17) — GPS FIX FRESHNESS + FOREGROUND
// REACQUISITION. A gpsFixGate.ts PURE modul dönti el, hogy egy adott GPS
// fix FELHASZNÁLHATÓ-e route progress / leg transition / boarding /
// reroute-kiértékeléshez. A hívó itt (nem a routeProgress.ts/legTransition.ts
// belsejében) kapcsolja a lentebbi hookoknak átadott POZÍCIÓT `null`-ra,
// amikor a fix nem usable — a hookok MÁR MA IS helyesen kezelik a `null`
// pozíciót, ezért ez a MINIMÁLIS beavatkozási pont. Az itt bevezetett
// gpsFixUsable állapot NEM módosítja useTransitRealtimeRefresh.ts
// visibility-return viselkedését (az egy külön, saját mechanizmus).
import {
  createInitialGpsFixGateState,
  evaluateGpsFixUsability,
  isGpsReacquiring,
  markVisibilityReturned,
} from "@/lib/vedett-route/navigation/gpsFixGate";
import RestPointQuickAdd, { type RestPointCreatedPayload } from "./RestPointQuickAdd";
// TELEPÜLÉS-AUTOCOMPLETE ("UX-fejlesztés..." kör, A) rész) — EGYETLEN közös
// komponens/logika a "Város" mezőkhöz (induló + célhely), nincs duplikált
// keresési/billentyűzet-kezelési kód. Lásd SettlementAutocomplete.tsx
// fejlécét: kizárólag településnév-azonosítás, a geokódolás VÁLTOZATLAN.
import SettlementAutocomplete from "./SettlementAutocomplete";
import RestStopFlowPanel, { type RestStopMapState, type RestPanelMode } from "./RestStopFlowPanel";
import type { RestPointMarker } from "./VedettUtvonalMap";
import { setNavigationModeActive } from "@/lib/pwa/navigationModeSignal";
import type { GeocodePlaceCandidate } from "@/lib/vedett-route/geocode";
import { useAddressAutocomplete, retrieveAddressSuggestion } from "@/lib/vedett-route/useAddressAutocomplete";
// STREET-LEVEL FALLBACK (2026-09-12) — a request-body-összeállítás pure
// függvényekbe kiszervezve (lib/vedett-route/searchRequestBuilder.ts), hogy
// Node.js tesztekben React-függőség nélkül ellenőrizhetők legyenek az
// invariánsok (MAP_PICKED → toCoordinates, MANUAL → to string, stb.).
import {
  buildSearchRequestOriginFields,
  buildSearchRequestDestinationFields,
  type RouteOrigin,
  type RouteDestination,
} from "@/lib/vedett-route/searchRequestBuilder";
import { formatDurationMinutes } from "@/lib/vedett-route/formatDurationMinutes";
import {
  createInitialRerouteGuardState,
  markRerouteFinished,
  markRerouteStarted,
  resetRerouteGuard,
  shouldStartAutomaticReroute,
} from "@/lib/vedett-route/navigation/rerouteGuard";
import {
  classifyTransitGeometryConfidence,
  isRailGuidedTransitMode,
} from "@/lib/vedett-route/navigation/transitGeometryConfidence";
// FOREGROUND REACQUISITION — SPRINT 8.1 (2026-09-18). Pure fázis-modell a
// MEGLÉVŐ gpsFixGate.ts kimeneteinek (usable/reacquiring) elnevezésére +
// egy monoton generation-számláló (lásd a modul fejlécét) — nem duplikál
// semmilyen freshness/quality/hiszterézis logikát.
import {
  cancelForegroundRecovery,
  createInitialForegroundRecoveryState,
  isForegroundRecoveryActive,
  isGenuineForegroundTransition,
  startForegroundRecovery,
  updateForegroundRecoveryPhase,
  type DocumentVisibilityState,
  type ForegroundRecoveryPhase,
} from "@/lib/vedett-route/navigation/foregroundReacquisition";
import { vedettRouteForegroundDebugLog } from "@/lib/vedett-route/logger";
// NAVIGATION SESSION PERSISTENCE — SPRINT 8.2 (2026-09-18). Pure
// serialize/validate/save/load/clear modul, hogy az aktív navigáció
// túlélje a reload/tab-evictiont/új JS-session mountot. KÜLÖN fogalom, mint
// a foreground reacquisition (lásd navigationSessionPersistence.ts fejléce).
import {
  clearNavigationSession,
  deriveDestinationFromJourney,
  loadNavigationSession,
  saveNavigationSession,
  sanitizeRestoredJourney,
  serializeNavigationSession,
  type PersistedNavigationSession,
} from "@/lib/vedett-route/navigation/navigationSessionPersistence";
// LIVE ALTERNATIVE — SPRINT 8.4 (8.4A pure engine, 8.4B runtime wiring,
// 2026-09-18). "STAY ON CURRENT ROUTE" az alap — ez a bekötés SOHA nem vált
// automatikusan journey-t, kizárólag OFFERED állapotban ajánl fel egy
// candidate-et, és a váltás KIZÁRÓLAG explicit "Ezt választom" után történik
// (lásd liveAlternative.ts fejléce). Ez NEM az automatikus reroute (fentebb,
// rerouteGuard.ts) — a Live Alternative csak akkor futhat, ha a user
// TOVÁBBRA IS a helyes útvonalon van (lásd offRouteConfirmed guard bemenet).
import {
  acceptLiveAlternativeOffer,
  buildDisruptionTriggers,
  buildRealtimeDegradationSamples,
  computeRemainingJourneyMetrics,
  computeSwitchingCost,
  createInitialLiveAlternativeGuardState,
  createInitialLiveAlternativeOffer,
  declineLiveAlternativeOffer,
  discardLiveAlternativeSearch,
  evaluateMeaningfulImprovement,
  evaluateRealtimeDegradation,
  markLiveAlternativeEventDeclined,
  markLiveAlternativeSearchFinished,
  markLiveAlternativeSearchStarted,
  presentLiveAlternativeOffer,
  selectBestLiveAlternativeCandidate,
  shouldStartLiveAlternativeSearch,
  startLiveAlternativeOfferSearch,
  type LiveAlternativeTrigger,
} from "@/lib/vedett-route/navigation/liveAlternative";
import { computeJourneyFingerprint } from "@/lib/vedett-route/fingerprint";
// SPRINT 8.5 — a MEGLÉVŐ 8.3 engine (csak export/signature szinten
// használva itt): a React komponens SOHA nem implementál saját alert-
// relevancia logikát, kizárólag a leg-shape konverziót (toDisruptionRelevanceLegs)
// és a fail-closed relevancia-motort (evaluateDisruptionRelevance-en
// keresztül, a buildDisruptionTriggers() hívja) hívja.
import { toDisruptionRelevanceLegs } from "@/lib/vedett-route/navigation/disruptionRelevance";

// „Aktuális helyzetem" mint indulási pont (UX módosítás, 2026-09-09) — a
// keresési form induló-mezője mostantól két, egymást KIZÁRÓ móddal
// rendelkezik. MANUAL: a felhasználó strukturált címet gépel be (Város /
// Irányítószám vagy kerület / Utca, házszám — lásd buildStructuredAddress
// lent), a szerver továbbra is a belőle összeállított `from` szöveges
// mezőt geokódolja. CURRENT_LOCATION: a böngésző GPS-ből származó,
// STRUKTURÁLT lat/lon-t küldjük — ezt a szerver oldalon a routing SOSEM
// próbálja geocodolni (lásd app/api/admin/vedett-utvonal/search/route.ts
// fromCoordinates ága). A két mód SZÁNDÉKOSAN nem keveredik: amint a
// felhasználó gépelni kezd BÁRMELYIK induló címmezőbe, CURRENT_LOCATION
// azonnal megszűnik (lásd updateOriginManualField), hogy SOSE maradjon
// érvényben egy elavult GPS-koordináta egy időközben már kézzel átírt cím
// mellett.
// GEOCODING GENERALIZÁCIÓ / SZIMMETRIA (2026-09-11, 8-9. pont) — az indulási
// oldal mostantól a MAP_PICKED módot is ismeri, UGYANÚGY mint a
// RouteDestination (lásd lent) — ha a geokódolás csak közelítő (utca/
// település igazolt, de a konkrét hely nem) eredményt ad, a felhasználó
// a térképen MAGA pontosíthatja az induló pontot is, nem csak a célt.
// Wire-szinten (route.ts felé) ez UGYANÚGY `fromCoordinates`-en megy, mint
// a CURRENT_LOCATION — lásd handleSubmit lent — a MEGLÉVŐ, EXAKT
// stringmintát kereső regresszióteszt (17. eset) miatt szándékosan NEM egy
// harmadik, önálló wire-mezőn (a `name` megjelenítési label itt még
// mindig a rögzített "Jelenlegi hely"-t adja — lásd a részletes
// magyarázatot a végső riportban, "ismert korlátozás" pont).
// RouteOrigin importálva: lib/vedett-route/searchRequestBuilder.ts
// (MANUAL | CURRENT_LOCATION | MAP_PICKED — wire-invariáns: MAP_PICKED és
// CURRENT_LOCATION → fromCoordinates, MANUAL → from: string)

// Védett Hely "Navigálj oda" -> Védett Útvonal integráció (2026-09-09).
//
// UGYANAZT a mintát követi, mint a fenti RouteOrigin: két, egymást KIZÁRÓ
// mód. MANUAL: a felhasználó strukturált célcímet gépel be (Város /
// Irányítószám vagy kerület / Utca, házszám — lásd buildStructuredAddress),
// a szerver továbbra is a belőle összeállított `to` szöveges mezőt
// geokódolja. KNOWN_PLACE: a /vedett-utvonal oldal egy deep linkből
// (Védett Hely "Navigálj oda" -> Védett Útvonal) érkező, MÁR ISMERT
// VédettSarok hely nevét és koordinátáját kapta — ezt a szerver oldali
// routing SOSEM próbálja geocodolni (lásd app/api/admin/vedett-utvonal/
// search/route.ts toCoordinates ága), mert a koordináta már megbízhatóan
// ismert. Amint a felhasználó kézzel írni kezd a "Hová?" mezőbe (a
// KNOWN_PLACE nézet egyetlen mezőjébe, lásd handleDestinationOverrideChange,
// vagy egy MANUAL strukturált mezőbe, lásd updateDestinationManualField),
// KNOWN_PLACE azonnal megszűnik — pontosan úgy, mint az induló mezőnél.
// Geocoding hardening (2026-09-10) — a KNOWN_PLACE mintáját követő, de
// SZEMANTIKAILAG külön harmadik mód: a felhasználó egy APPROXIMATE
// geokódolási találat után saját maga jelölte ki a pontos célt a térképen
// (lásd DestinationMapPicker.tsx). A wire-protokoll szintjén (route.ts felé)
// UGYANÚGY toCoordinates/toName megy, mint KNOWN_PLACE esetén (13. pont:
// "ne geokódold újra") — külön típusként tartjuk, hogy a UI-szöveg
// ("Térképen kijelölt célpont") és a jövőbeli logika ne keveredjen össze a
// Védett Hely deep link KNOWN_PLACE jelentésével.
// RouteDestination importálva: lib/vedett-route/searchRequestBuilder.ts
// (MANUAL | KNOWN_PLACE | MAP_PICKED — wire-invariáns: KNOWN_PLACE és
// MAP_PICKED → toCoordinates, MANUAL → to: string)

// buildStructuredAddress kiszervezve: lib/vedett-route/searchRequestBuilder.ts
// → buildStructuredAddressString(). A handleSubmit-ben mostantól az ott
// importált buildSearchRequestOriginFields / buildSearchRequestDestinationFields
// hívódik, amelyek belsőleg a buildStructuredAddressString-et használják.
// Ez a csere SEMMILYEN wire-viselkedést nem változtat: az összeállított
// cím-string formátuma byte-azonos marad.

// GEOCODING KORREKCIÓ (2026-09-11, C4.2, "3. PLACE-ONLY INPUT LEGYEN
// ÉRVÉNYES" pont) — BIZONYÍTOTT root cause: a City mező ALAPÉRTELMEZETTEN
// "Budapest"-tel van feltöltve (lásd a MANUAL state kezdőértékét lejjebb),
// tehát a korábbi "Város ÉS Kerület EGYSZERRE üres" bypass-szabály a
// GYAKORLATBAN SOSEM aktiválódott — egy "Arena Plaza" keresésnél a City
// mező a legtöbb felhasználónál "Budapest" marad, a Kerület mező pedig
// üres, ez a korábbi logika szerint HIÁNYOS (cityFilled && !districtFilled
// -> false), ezért a kliens MÉG A GEOKÓDOLÓ HÍVÁSA ELŐTT elutasította a
// kérést a "Add meg a várost, az irányítószámot vagy kerületet és az
// utcát." hibaszöveggel — pontosan ez a valós Preview-ban tapasztalt hiba.
//
// ÚJ SZABÁLY: egy nem üres Utca/hely mező ÖNMAGÁBAN elég a geokódoló
// meghívásához — a Város és a Kerület/irányítószám mostantól OPCIONÁLIS,
// SZŰKÍTŐ kontextus (amit a szerver oldali geocode.ts GeoContextConstraint
// hard constraintként érvényesít, ha ki van töltve — lásd
// candidateViolatesGeoContext), NEM kötelező mező. A klasszikus,
// "Kossuth Lajos utca 12."-szerű teljes cím és a "Deák tér"/"Arena
// Plaza"-szerű named place/POI keresés a kliens szemszögéből EGYSZERRE
// érvényes — a kliensnek NEM kell (és nem is tudja biztonságosan)
// eldönteni, hogy a beírt szöveg utca, tér, üzlet, plaza, állomás, park,
// POI vagy intézmény; ezt a szerver oldali geokódolási pipeline dönti el.
function isManualAddressComplete(addr: { city: string; districtOrPostalCode: string; street: string }): boolean {
  return Boolean(addr.street.trim());
}

// MapLibre a böngésző window objektumára támaszkodik -> csak kliens
// oldalon tölthető be (SSR alatt nincs window). dynamic({ ssr: false })
// a Next.js hivatalos mintája erre.
const VedettUtvonalMap = dynamic(() => import("./VedettUtvonalMap"), { ssr: false });

// Geocoding hardening (2026-09-10, "Alacskai út 63" audit) — a térképes
// célpont-kijelölő is a MEGLÉVŐ MapLibre/OpenFreeMap infrastruktúrát
// használja (11. pont: "NE hozz létre teljesen külön térképrendszert"),
// ugyanazzal a dynamic({ssr:false}) mintával, mint a fenti VedettUtvonalMap.
const DestinationMapPicker = dynamic(() => import("./DestinationMapPicker"), { ssr: false });

type SearchApiResponse =
  | OrchestratedSearchResult
  // Geocoding hardening (2026-09-10) — a szerver (route.ts) ÚJ, egymástól
  // KÜLÖN kezelt hibaágakat ad: "address_not_found" (nincs elfogadható
  // Nominatim-találat) és "address_approximate" (utca/település igazolt,
  // de a konkrét házszám nem — lásd geocode.ts). Az "address_approximate"
  // esetben a szerver a geokódolt KÖZELÍTŐ koordinátát is visszaadja
  // (approximateLocation), hogy a térképes célpont-kijelölő ott induljon
  // (12. pont). `field`/`helperMessage`/`approximateLocation` mind
  // OPCIONÁLIS — a régi (routing-szintű) hibaágak ("routing_engine_unavailable"/
  // "no_route_found"/"invalid_request") ezeket sosem küldik, a kliens ott
  // egyszerűen csak a `message`-et jeleníti meg, változatlanul.
  | {
      ok: false;
      reason: string;
      message: string;
      field?: "from" | "to";
      helperMessage?: string;
      approximateLocation?: { name: string; lat: number; lon: number };
      // GEOCODING KORREKCIÓ (2026-09-11, C4.1) — "address_ambiguous" reason
      // esetén a szerver egy MINIMÁLIS jelölt-listát ad (lásd geocode.ts
      // GeocodePlaceCandidate) — SOHA nem nyers Nominatim objektumot. A régi
      // (routing-szintű) hibaágak ezt sosem küldik, ezért opcionális.
      candidates?: GeocodePlaceCandidate[];
      // STREET-LEVEL FALLBACK (2026-09-12) — "house_number_not_resolved"
      // reason esetén a szerver visszaadja a biztosan feloldott utcát és
      // települést, hogy az inline figyelmeztetőkártya megmutathassa.
      resolvedStreet?: string;
      resolvedCity?: string;
    };

const LABEL_META: Record<RankingLabel, { text: string; className: string }> = {
  FASTEST: { text: "Leggyorsabb", className: "bg-blue-100 text-blue-800" },
  FEWEST_TRANSFERS: { text: "Legkevesebb átszállás", className: "bg-purple-100 text-purple-800" },
  CALMEST: { text: "Legnyugodtabb (becsült)", className: "bg-green-100 text-green-800" },
  LEAST_WALKING: { text: "Legkevesebb gyaloglás", className: "bg-amber-100 text-amber-800" },
};

// AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C, spec 6. pont —
// "Felhasználói nyelv") — journey.accessibilityStatus KIZÁRÓLAG akkor van
// jelen, ha a keresés stepFreeRequired=true volt (lásd orchestrator.ts).
// KNOWN_NOT_ACCESSIBLE SZÁNDÉKOSAN NINCS ebben a táblában — a szerver már
// kiszűri (isEligibleForStepFreeResults), ez a UI-kód SOHA nem kap/jelenít
// meg ilyen journey-t "akadálymentes" listaelemként.
const ACCESSIBILITY_RESULT_META: Record<Exclude<AccessibilityResultStatus, "KNOWN_NOT_ACCESSIBLE">, { text: string; className: string }> = {
  KNOWN_ACCESSIBLE: { text: "♿ Az elérhető adatok alapján lépcsőmentes", className: "bg-teal-100 text-teal-800" },
  PARTIALLY_UNKNOWN: { text: "♿ Az akadálymentesség egy része nem igazolt", className: "bg-gray-200 text-gray-700" },
};

const TRANSIT_MODE_LABELS: Record<string, string> = {
  SUBWAY: "Metró",
  TRAM: "Villamos",
  BUS: "Busz",
  RAIL: "Vasút",
  COACH: "Távolsági busz",
  FERRY: "Komp",
  AIRPLANE: "Repülő",
  ODM: "Igény szerinti közlekedés",
  FLEX: "Rugalmas járat",
};

function transitModeLabel(mode?: string): string {
  if (!mode) return "";
  return TRANSIT_MODE_LABELS[mode] ?? mode;
}

// Vizuális megkülönböztetés a felhasználó kérése alapján: kék busz, sárga
// villamos, zöld metró emoji + hozzáillő háttérszín. A többi (ritkább)
// MOTIS módra semleges szürke jelölést és egy odaillő emojit használunk,
// hogy azok se maradjanak jelölés nélkül.
const TRANSIT_MODE_BADGE: Record<string, { emoji: string; className: string }> = {
  BUS: { emoji: "🚌", className: "bg-blue-100 text-blue-800" },
  TRAM: { emoji: "🚊", className: "bg-yellow-100 text-yellow-800" },
  SUBWAY: { emoji: "🚇", className: "bg-green-100 text-green-800" },
  RAIL: { emoji: "🚆", className: "bg-gray-100 text-gray-700" },
  COACH: { emoji: "🚍", className: "bg-gray-100 text-gray-700" },
  FERRY: { emoji: "⛴️", className: "bg-gray-100 text-gray-700" },
  AIRPLANE: { emoji: "✈️", className: "bg-gray-100 text-gray-700" },
};

function transitModeBadge(mode?: string): { emoji: string; className: string } {
  return (mode && TRANSIT_MODE_BADGE[mode]) || { emoji: "🚏", className: "bg-gray-100 text-gray-700" };
}

// Egy gyalogló láb végpontja gyakran egy valódi megálló/állomás (pl. "Széll
// Kálmán tér" mint METRÓ-állomás, vagy "Budagyöngye" mint BUSZ-megálló) — de
// önmagában a helynévből ez nem derül ki, és mivel az induló/érkező pont
// köznyelvi neve gyakran megegyezik a megállóéval, összetéveszthetőnek tűnik
// (pl. "Budagyöngye → Budagyöngye"). Az alábbi a SZOMSZÉDOS, valós MOTIS
// legből (nem kitalálva) származó közlekedési módból képez egy magyar
// megálló-típus utótagot, hogy egyértelmű legyen: ez egy valódi, néhány
// száz méteres séta a megadott ponttól/pontig a legközelebbi megállóig.
const STOP_TYPE_SUFFIX: Record<string, string> = {
  SUBWAY: "metróállomás",
  TRAM: "villamosmegálló",
  BUS: "buszmegálló",
  RAIL: "vasútállomás",
  COACH: "távolsági buszmegálló",
  FERRY: "kikötő",
};

function stopTypeSuffix(mode?: string): string {
  if (!mode) return "";
  return STOP_TYPE_SUFFIX[mode] ?? "megálló";
}

// MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1 (2026-09-13) — a
// leg.rentalPropulsionType KIZÁRÓLAG akkor van jelen, ha a nyers MOTIS
// válasz ténylegesen tartalmazta (lásd orchestrator.ts mapLeg() és
// motisTypes.ts kommentje — jelenleg spekulatív mező). Hiányában a UI
// SOHA nem találgat/jelenít meg "electric"/"human" nyers stringet — egy
// semleges "MOL Bubi kerékpár" jelenik meg helyette (lásd lent a leg-kártya
// fejlécében). A két megnevezés KIZÁRÓLAG ez a két, felhasználó által kért
// szöveg lehet.
function bikePropulsionLabel(type?: "HUMAN" | "ELECTRIC_ASSIST"): string | undefined {
  if (type === "ELECTRIC_ASSIST") return "Elektromos kerékpár";
  if (type === "HUMAN") return "Hagyományos kerékpár";
  return undefined;
}

// MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1.1 HARDENING (2026-09-13) —
// KORÁBBI KÖR KORREKCIÓJA: a Round 8-ban itt egy "rentalAvailabilityText()"
// segédfüggvény jelenítette meg az aktuális kerékpár-darabszámot
// (a leg egy elérhetőségi darabszám-mezője alapján). A felhasználó explicit javította:
// a MOTIS /api/v6/plan válaszban NINCS bizonyított forrás erre a számra
// (lásd motisTypes.ts MotisPlace kommentje) — a ténylegesen bizonyított
// forrás a KÜLÖN GET /api/v1/rentals végpont, aminek bekötése Phase 2
// feladat. Ezért ez a függvény és minden darabszám-megjelenítés
// SZÁNDÉKOSAN eltávolítva — a Bubi leg-kártya csak a fix disclaimer
// mondatot mutatja, SOHA nem konkrét számot.

// Egyetlen megosztott térkép (UX módosítás, 2026-09-09) — a kártya saját,
// a session alatt ("Pihenőpont hozzáadása" gombbal) hozzáadott markereit ÉS a
// RestStopFlowPanel által jelentett discovery-markereket egyetlen listába
// egyesíti a közös <VedettUtvonalMap> számára, id szerint deduplikálva
// (ha ugyanaz a pont véletlenül mindkét forrásban szerepelne).
function mergeRestPointMarkers(base: RestPointMarker[], extra: RestPointMarker[]): RestPointMarker[] {
  if (extra.length === 0) return base;
  const seen = new Set(base.map((rp) => rp.id));
  const merged = [...base];
  for (const rp of extra) {
    if (seen.has(rp.id)) continue;
    seen.add(rp.id);
    merged.push(rp);
  }
  return merged;
}

// A jármű indulási idejét a megállóból — a MOTIS valós, ütemezett (vagy
// valós idejű, ha van) startTime mezőjéből, órás:perces formában. Ez segíti
// eldönteni, hogy pl. egy hosszabb várakozás után induló járatra érdemes-e
// várni, vagy inkább a gyalogos/másik alternatívát választani.
function splitSelectedAddressLabel(label: string): {
  street: string;
  city: string;
  postalOrDistrict: string;
  suffix: string;
} | null {
  // Az autocomplete API új, autizmusbarát címkéje determinisztikus:
  // "Utca [házszám], Település[, 1234]". Ebből szerkesztéskor vissza tudjuk
  // állítani a strukturált MANUAL mezőket anélkül, hogy a kiválasztott
  // település elveszne (korábban minden MAP_PICKED szerkesztés Budapestet
  // állított be, ami Sóskút/Budaörs/stb. esetén hibás újrakeresést okozott).
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const street = parts[0];
  const maybePostcode = parts[parts.length - 1];
  const hasPostcode = /^\d{4}$/.test(maybePostcode);
  const cityIndex = hasPostcode ? parts.length - 2 : parts.length - 1;
  const city = parts[cityIndex];
  if (!street || !city) return null;

  const postalOrDistrict = hasPostcode ? maybePostcode : "";
  const suffix = `, ${city}${postalOrDistrict ? `, ${postalOrDistrict}` : ""}`;
  return { street, city, postalOrDistrict, suffix };
}

function formatClockTime(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

function walkEndpointLabel(name: string, adjacentLeg: { mode: string; transitMode?: string; routeShortName?: string; routeLongName?: string } | undefined): string {
  if (!adjacentLeg || adjacentLeg.mode !== "TRANSIT") return name;
  const suffix = stopTypeSuffix(adjacentLeg.transitMode);
  const route = adjacentLeg.routeShortName ?? adjacentLeg.routeLongName;
  // A járatszámot zárójelbe tesszük, hogy egyértelmű legyen: ha ugyanaz a
  // kereszteződés-név szerepel mindkét oldalon, de más a zárójeles
  // járatszám, az KÉT KÜLÖNBÖZŐ, valós fizikai megállóoszlopot jelent
  // (pl. az 5-ös és a 32-es busznak külön megállója van ugyanannál a
  // kereszteződésnél) — nem ugyanoda-sétálást, hanem egy valódi, néhány
  // tíz-száz méteres átszállási gyaloglást a leg-adatban szereplő
  // (nem kitalált) táv alapján.
  return route ? `${name} ${suffix} (${route})` : `${name} ${suffix}`;
}

const FACTOR_LABELS: Record<string, string> = {
  transfers: "Átszállások száma",
  modeSwitches: "Közlekedési mód váltások",
  underground: "Földalatti (metró) arány",
  walking: "Gyaloglás",
  duration: "Teljes utazási idő",
  waiting: "Várakozás",
  crowding: "Jármű-foglaltság (valós idejő)",
  vehicleAccessibility: "Jármű-szintű akadálymentesség / érzékszervi terhelés",
};

// BKK Realtime integráció, 14. pont: pontosan azt jelenítjük meg, amit a
// MOTIS ténylegesen visszaadott — SOHA nem címkézünk statikus-only adatot
// realtime-ként. Három eset:
//   1) leg.cancelled === true -> törölt/kihagyott járat jelzése.
//   2) leg.realtime === true ÉS van ténylegesen kiszámított delayMinutes ->
//     "Menetrend szerint: HH:mm / Várható indulás: HH:mm / Késés: +-N perc".
//   3) minden más eset (nincs realtime, vagy realtime van de nem volt
//      számítható eltérés) -> csak "Menetrend szerinti indulás: HH:mm".
function TransitLegRealtimeNote({
  leg,
}: {
  leg: {
    realtime: boolean;
    cancelled?: boolean;
    departureTime?: string;
    scheduledDepartureTime?: string;
    delayMinutes?: number;
  };
}) {
  if (leg.cancelled) {
    return <span className="font-medium text-red-600">Ez a járat törölve / kihagyva (valós idejű BKK-adat alapján)</span>;
  }

  const scheduled = formatClockTime(leg.scheduledDepartureTime);
  const actual = formatClockTime(leg.departureTime);
  const hasGenuineRealtimeUpdate = leg.realtime && leg.delayMinutes !== undefined && scheduled;

  if (hasGenuineRealtimeUpdate) {
    const delay = leg.delayMinutes as number;
    return (
      <span className="text-xs">
        <span className="text-gray-400">Menetrend szerint: {scheduled}</span>
        {" · "}
        <span className="font-medium text-gray-700">Várható indulás: {actual}</span>
        {" · "}
        {delay === 0 ? (
          <span className="text-green-600">pontosan időben</span>
        ) : delay > 0 ? (
          <span className="text-amber-600">Késés: +{delay} perc</span>
        ) : (
          <span className="text-blue-600">Korábban indul: {delay} perc</span>
        )}
      </span>
    );
  }

  // Nincs bizonyítottan valós idejű eltérés -> csak a menetrend szerinti
  // időt mutatjuk, kifejezetten "menetrendi" jelöléssel, hogy sose tűnjön
  // realtime adatnak.
  return <span className="text-xs text-gray-400">Menetrend szerinti indulás: {scheduled ?? actual ?? "N/A"}</span>;
}

// VPS → Staging Integration Gate (2026-09-07), F) UI szabály — a teljes
// útvonalra (nem csak egy-egy lábra) vonatkozó realtime jelzés:
//   journey.realTime === false (vagy hiányzik)         -> "Menetrend szerinti indulás".
//   journey.realTime === true ÉS eltér a menetrenditől -> egyértelműen jelenjen meg
//     a valós idejű indulás/érkezés, a menetrend szerintivel együtt.
//   journey.realTime === true, de nincs eltérés         -> "pontosan a menetrend szerint indul" jelzés.
// SOHA nem címkéz statikus-only adatot realtime-ként — pontosan azt a
// mezőt olvassa, amit a MOTIS ténylegesen visszaadott.
function JourneyRealtimeSummary({ journey }: { journey: Journey }) {
  if (journey.cancelled) {
    return (
      <p className="mt-1 text-xs font-semibold text-red-600">
        Ez az útvonal törölt/kihagyott járatot tartalmaz (valós idejű BKK-adat alapján).
      </p>
    );
  }

  if (!journey.realTime) {
    const scheduled = formatClockTime(journey.scheduledDepartureTime ?? journey.departureTime);
    return <p className="mt-1 text-xs text-gray-400">Menetrend szerinti indulás: {scheduled ?? "N/A"}</p>;
  }

  const scheduledDep = formatClockTime(journey.scheduledDepartureTime);
  const actualDep = formatClockTime(journey.departureTime);

  if (scheduledDep && actualDep && scheduledDep !== actualDep) {
    return (
      <p className="mt-1 text-xs">
        <span className="text-gray-400">Menetrend szerint: {scheduledDep}</span>
        {" · "}
        <span className="font-semibold text-gray-700">Valós idejű indulás: {actualDep}</span>
      </p>
    );
  }

  return <p className="mt-1 text-xs text-green-700">Valós idejű adat szerint pontosan a menetrend szerint indul.</p>;
}

// Part B (2026-09-08) — inline per-kártya térkép-átalakítás. A korábbi
// mintázat (kártya -> "Térkép megnyitása" -> az ÖSSZES kártya alatt egy
// KÖYÖS globális térkép-blokk) helyett minden kártyának SAJÁT, a kártyán
// belül nyíló térkép-slotja van (lásd a komponens vége felé, az `isOpen`
// blokk). Ennek okai (spec, szó szerint):
//  - a felhasználó sose ugorjon az oldal aljára egy térképért,
//  - a MapLibre GL WebGL-kontextus (memória/mobil-teljesítmény miatt)
//    LEGFELJEBB EGYSZERRE fusson — ezt a szülő (VedettUtvonalSearchForm)
//    `openIndex` state-je garantálja: másik kártya nyitása automatikusan
//    zárja az előzőt, és mivel a <VedettUtvonalMap> csak `isOpen` esetén
//    kerül a JSX-be, bezáráskor ténylegesen UNMOUNT-olódik (nem csak
//    elrejtődik CSS-sel).
function RankedJourneyCard({
  ranked,
  isOpen,
  onToggleMap,
  serviceAlerts,
}: {
  ranked: RankedJourney;
  isOpen: boolean;
  onToggleMap: () => void;
  // SPRINT 8.5 (ROUTE-SPECIFIC DISRUPTION -> LIVE ALTERNATIVE, 2026-09-19) —
  // a LEGKISEBB adatút: a szülő `result` state-je (a keresési válasz) MÁR
  // tartalmazza a BKK Alerts.pb-ből származó `serviceAlerts`-t (lásd
  // orchestrator.ts OrchestratedSearchResult.serviceAlerts — ez a globális
  // alert-box eltávolítása óta is VÁLTOZATLANUL a válasz része, csak a
  // RENDERELÉSE szűnt meg, lásd a hívó oldali komment). Nincs Context/
  // store/új hook architektúra — EGY új prop.
  serviceAlerts: ServiceAlert[];
}) {
  const journey = ranked.journey;
  const sensory = journey.sensory;

  // Ez a state KIZÁRÓLAG ebben a kártyában él (nem a szülő formban):
  // amíg a kártya zárva van, ezek a hookok/state-ek passzívak (a
  // useGeolocation() csak explicit requestOnce()/startWatching() hívásra
  // kezd tényleges GPS-lekérdezést, lásd useGeolocation.ts fejléce), nem
  // indítanak semmilyen hálózati vagy szenzor-hívást pusztán a mounttól.
  //
  // displayedJourney: alapból a kártya SAJÁT itineraryje (ranked.journey)
  // — SOSEM az első/egy másik kártya útvonala. Sprint E "Pihenőre van
  // szükségem" resume folyamata felülírhatja egy ÚJ, frissen tervezett
  // itineraryre (lásd onRouteResumed lent) — ez is csak EBBEN a
  // kártyában él, nem szivárog át másik kártyára.
  const [displayedJourney, setDisplayedJourney] = useState<Journey>(journey);
  const [sessionRestPoints, setSessionRestPoints] = useState<RestPointCreatedPayload[]>([]);
  const geo = useGeolocation();

  // Explicit Navigation Mode (Mobil navigációs UX sprint, 5-14. pont).
  //
  // navigationMode: a felhasználó explicit "▶ Navigáció indítása" gombjára
  // aktiválódik — SOHA automatikusan (spec 8. pont, "foreground, explicit
  // indítású GPS-követés"). Amíg aktív, a térkép fullscreen (lásd
  // mapFullscreen lent) és a geo-t folyamatos watchPosition módban tartja.
  //
  // followMode: amíg true, a <VedettUtvonalMap> kamerája folyamatosan a
  // currentPosition-t követi (lásd a map komponens follow-effektjét).
  // navigationMode indításakor mindig true (auto-recenter az első fixre és
  // minden további GPS-tickre), a felhasználó saját pan/zoom/drag
  // gesztusára false-ra vált (handleUserGestureCancelFollow lent) — ekkor
  // egy "📍 Kövesd a helyzetem" gomb jelenik meg, ami vissza tudja
  // kapcsolni. FONTOS: navigationMode=false esetén followMode-nak is
  // false-nak KELL lennie (lásd stopNavigation) — nincs értelme "követni"
  // egy le nem navigáló nézetben, és ez zárja ki, hogy egy korábbi
  // navigáció maradék follow-állapota átszivárogjon egy újba.
  const [navigationMode, setNavigationMode] = useState(false);
  const [followMode, setFollowMode] = useState(false);

  // SCREEN WAKE LOCK (2026-09-15) — aktív navigáció közben best-effort
  // ébren tartjuk a kijelzőt. A hook progressive enhancement: ha a böngésző
  // nem támogatja / megtagadja a Wake Lock API-t, a navigáció változatlanul
  // működik. Háttérből visszatéréskor a hook újrakéri az elveszett lockot.
  useScreenWakeLock(navigationMode && isOpen);

  // AUTOMATIKUS ÚJRATERVEZÉS (2026-09-15) — a route-progress motor csak
  // megerősített OFF_ROUTE állapotánál indíthat új MOTIS-tervezést. A guard
  // refben él, ezért egy GPS-tick miatti render nem nullázza a cooldown/inFlight
  // állapotot. A session token kizárja, hogy egy régi async válasz egy már
  // leállított vagy újraindított navigáció itineraryjét felülírja.
  const rerouteGuardRef = useRef(createInitialRerouteGuardState());
  const rerouteSessionRef = useRef(0);
  const [automaticRerouteStatus, setAutomaticRerouteStatus] = useState<"IDLE" | "REROUTING" | "FAILED">("IDLE");
  const [automaticRerouteMessage, setAutomaticRerouteMessage] = useState<string | null>(null);

  // FOREGROUND REACQUISITION — SPRINT 8.1 (2026-09-18). `foregroundRecoveryRef`
  // a MEGLÉVŐ gpsFixGate.ts kimeneteit követi (lásd a wiring lentebb, a
  // gpsFixGateRef melletti effektekben) — `foregroundRecoveryPhase` a
  // React-oldali, render/effekt-függőségekhez szükséges tükör-state.
  const foregroundRecoveryRef = useRef(createInitialForegroundRecoveryState());
  const [foregroundRecoveryPhase, setForegroundRecoveryPhase] = useState<ForegroundRecoveryPhase>("IDLE");

  // SPRINT 8.2 (NAVIGATION SESSION PERSISTENCE, 2026-09-18) — restoreRecoveryRef
  // a foregroundReacquisition.ts UGYANAZON pure fázis-átmenet modulját
  // használja fel, DE KÜLÖN reffel/koncepcióként: a restore-recovery egy ÚJ/
  // mountolt JS-session storage-ból történő helyreállítása, NEM a
  // foreground-reacquisition (ugyanaz a session tér vissza háttérből) — a
  // kettő SOHA nem mosható össze (lásd navigationSessionPersistence.ts).
  const restoreRecoveryRef = useRef(createInitialForegroundRecoveryState());
  const [restoreRecoveryPhase, setRestoreRecoveryPhase] = useState<ForegroundRecoveryPhase>("IDLE");

  // LIVE ALTERNATIVE — SPRINT 8.4B (2026-09-18). A guard state (cooldown/
  // in-flight/decline-suppression) refben él, UGYANAZ az elv, mint
  // rerouteGuardRef-nél — egy GPS-tick miatti render nem nullázza. Az offer
  // state VISZONT React state, mert render-vezérelt UI-t hajt (OFFERED
  // kártya). `liveAlternativePreviewOpen` KIZÁRÓLAG UI-szintű "Megnézem"
  // toggle — nem cseréli a displayedJourney-t, csak a preview-kártyát nyitja.
  const liveAlternativeGuardRef = useRef(createInitialLiveAlternativeGuardState());
  const [liveAlternativeOffer, setLiveAlternativeOffer] = useState(createInitialLiveAlternativeOffer());
  const [liveAlternativePreviewOpen, setLiveAlternativePreviewOpen] = useState(false);

  // A navigációs "session" bármely megváltozása (kártya-bezárás navigáció
  // közben, navigáció leállítása, manuális/automatikus reroute) a MEGLÉVŐ
  // rerouteSessionRef-et bumpolja — ez EGYIDEJŰLEG érvényteleníti a
  // folyamatban lévő foreground-recovery ciklust is (spec 3. pont: "ha
  // recovery közben leáll a navigáció / másik journey indul / új route
  // kerül kiválasztásra, az ELŐZŐ async eredmény nem írhatja felül az új
  // állapotot") — UGYANAZT a MEGLÉVŐ session-mechanizmust bővíti, NEM egy
  // második, párhuzamos session-fogalmat hoz létre.
  const bumpNavigationSession = () => {
    rerouteSessionRef.current += 1;
    if (isForegroundRecoveryActive(foregroundRecoveryRef.current.phase)) {
      vedettRouteForegroundDebugLog("foreground_reacquisition_cancelled", {
        generation: foregroundRecoveryRef.current.generation,
      });
    }
    foregroundRecoveryRef.current = cancelForegroundRecovery(foregroundRecoveryRef.current);
    setForegroundRecoveryPhase(foregroundRecoveryRef.current.phase);
    // SPRINT 8.2 — session-váltás a restore-recovery ciklust is érvényteleníti.
    restoreRecoveryRef.current = cancelForegroundRecovery(restoreRecoveryRef.current);
    setRestoreRecoveryPhase(restoreRecoveryRef.current.phase);
  };

  // SPRINT 8.2 (NAVIGATION SESSION PERSISTENCE, 2026-09-18) — EXPLICIT,
  // NÉV SZERINT KÜLÖN belépési pont a navigationMode-ba, a startNavigation()
  // (friss, explicit user-akció) MELLETT — a régi safety invariant
  // VÁLTOZATLAN marad: a navigationMode bekapcsolása KIZÁRÓLAG ebből a KÉT
  // szemantikailag külön, explicit helyről futhat, SOHA egy sima mount/
  // effekt önmagában. Ezt a függvényt KIZÁRÓLAG a lenti mount-effekt hívja,
  // ÉS csak azután, hogy a persisted session runtime-validálva lett (schema/
  // TTL/navigationActive — lásd navigationSessionPersistence.ts — ÉS
  // fingerprint-egyezés a kártya saját journey-jével). Ez NEM egy "új
  // navigáció indítása" — egy KORÁBBAN, explicit user-akcióval (startNavigation)
  // elindított, MÉG érvényes session helyreállítása.
  const restorePersistedNavigation = (persisted: PersistedNavigationSession) => {
    bumpNavigationSession();
    rerouteGuardRef.current = resetRerouteGuard();
    setAutomaticRerouteStatus("IDLE");
    setAutomaticRerouteMessage(null);
    // A régi GPS/off-route/progress/realtime runtime állapotot SOHA nem
    // bízzuk el a storage-ból — a displayedJourney realtime-mezőit
    // sanitizeRestoredJourney() konzervatív alapállapotra állítja, a
    // MEGLÉVŐ useTransitRealtimeRefresh hook frissíti majd felül, ha van
    // friss adat (lásd lentebb, változatlan wiring).
    setDisplayedJourney(sanitizeRestoredJourney(persisted.displayedJourney));
    setNavigationMode(true);
    setFollowMode(true);
    restoreRecoveryRef.current = startForegroundRecovery(restoreRecoveryRef.current);
    setRestoreRecoveryPhase(restoreRecoveryRef.current.phase);
    geo.startWatching();
  };

  // Mount-once restore-KÍSÉRLET storage-ból (reload/tab-eviction/új
  // JS-session túlélése). Az effekt ÖNMAGA SOHA nem hívja setNavigationMode-ot
  // — kizárólag validál (fail-closed: érvénytelen/lejárt/hiányzó session,
  // vagy fingerprint-eltérés esetén nem csinál semmit), és csak érvényes
  // egyezés esetén adja át a döntést az explicit restorePersistedNavigation()
  // helpernek.
  useEffect(() => {
    const persisted = loadNavigationSession(Date.now());
    if (!persisted) return;
    if (!persisted.displayedJourney.fingerprint || !journey.fingerprint) return;
    if (persisted.displayedJourney.fingerprint !== journey.fingerprint) return;
    restorePersistedNavigation(persisted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manuális teljes képernyő (spec 7. pont) — a NORMÁL (nem navigáló) map
  // nézeten is elérhető "⛶ Teljes képernyő" gomb, KÜLÖN a navigationMode-tól:
  // ez nem indít GPS-követést, csak nagyobb nézetet ad. A kettő UNIÓJA
  // dönti el, hogy a térkép konténere fixed-fullscreen CSS-t kapjon-e (lásd
  // mapFullscreen lent) — navigationMode mindig fullscreen-t is jelent,
  // manualFullscreen önmagában is elég a nagy nézethez navigáció nélkül.
  const [manualFullscreen, setManualFullscreen] = useState(false);
  const mapFullscreen = navigationMode || manualFullscreen;

  // PIHENŐPONT PANEL BEZÁRÁSA (2026-09-11) — TISZTÁN UI-szintű
  // láthatóság-kapcsoló a fullscreen navigációban megjelenő pihenőpont
  // bottom sheethez (RestPointQuickAdd + RestStopFlowPanel). SZÁNDÉKOSAN
  // NEM a rest-stop-flow state machine-hez (lib/vedett-route/restStopFlow/
  // stateMachine.ts) tartozik, és SOHA nem dispatchol rá semmilyen eseményt
  // (CANCEL_REST_STOP-ot, RESET_TO_ROUTE_ACTIVE-t, stb.) — a "Bezárás" itt
  // KIZÁRÓLAG azt dönti el, hogy a bottom sheet DOM-ban látható-e
  // (display: none, sosem unmount), a folyamatban lévő pihenőpont-flow
  // (ha van) a háttérben változatlanul tovább fut, GPS-t/route-ot/
  // navigationMode-ot/followMode-ot nem érint. Alapértéke false — a panel
  // egy friss navigáció-indításkor mindig ZÁRT állapotból indul (a kompakt
  // "Pihenőpont hozzáadása" gombbal a fullscreen navigáció fölött), a
  // teljes képernyős térkép legyen az elsődleges nézet navigáció indításakor.
  const [restPanelVisible, setRestPanelVisible] = useState(false);

  // Desktop UX korrekció (2026-09-13) — a fullscreen navigáció alatt
  // desktopon (>= md) KÉT KÜLÖN, közvetlenül elérhető gomb van a
  // "Pihenőpont hozzáadása" lebegő CTA mellett: "Pihenőre van szükségem".
  // Ez a token KIZÁRÓLAG UI-wiring: a RestStopFlowPanel-nek küldött
  // `externalRequestRestToken` prop minden increment-je a panel BELSŐ,
  // meglévő REQUEST_REST eseményét dispatch-eli (lásd RestStopFlowPanel.tsx
  // "Desktop UX korrekció" kommentjeit) — nem hoz létre új
  // routing/state-machine logikát, csak elkerüli, hogy a felhasználónak
  // előbb meg kelljen nyitnia a panelt ahhoz, hogy ezt a MEGLÉVŐ funkciót
  // elérje.
  const [restRequestToken, setRestRequestToken] = useState(0);

  // UX HOTFIX (2026-09-13, ötödik kör) — "Rest Search és Rest Point Add mód
  // teljes szétválasztása". A negyedik kör `restRequestPending` flagje
  // CSAK a köztes, klikk→REQUEST_REST ablakig élt — ahogy a keresés
  // állapotgépe továbblépett (REST_POINTS_LOADING/READY), a flag visszaállt
  // false-ra, és a RestPointQuickAdd trigger (és vele a "Pihenőpont
  // hozzáadása" funkció) ÚJRA megjelent a már megnyílt találati lista
  // ALATT — ez volt a jelentett hiba ("miközben alatta már a megtalált
  // közeli pihenőhelyek láthatók"). A javítás: egy STABIL, a panel TELJES
  // megnyitott session-jére érvényes belépési mód, ami a panel megnyílásának
  // OKÁT rögzíti, nem csak egy átmeneti pillanatot.
  //
  // - Külső "Pihenőre van szükségem" → restPanelMode = "SEARCH": a panel
  //   KIZÁRÓLAG a pihenőpont-keresés UI-ját mutatja (RestStopFlowPanel saját
  //   belső állapotai szerint: keresés/betöltés/találati lista/"Ide megyek"
  //   stb.) — a RestPointQuickAdd (és a "Pihenőpont hozzáadása" cím/CTA)
  //   EGYÁLTALÁN nem jelenik meg, a session teljes hossza alatt, függetlenül
  //   attól, hogy a keresés melyik lépésénél tart.
  // - Külső "Pihenőpont hozzáadása" → restPanelMode = "ADD": változatlanul a
  //   jelenlegi hozzáadás-UI (RestPointQuickAdd) jelenik meg.
  //
  // Ez a mód UI-szintű elágazás — nem érinti a rest-stop-flow state
  // machine-t (lib/vedett-route/restStopFlow/stateMachine.ts), nem hoz
  // létre új eseményt/hálózati hívást. Bezáráskor és friss navigáció-
  // indításkor a mód mindig biztonságos alapállapotba ("ADD") áll vissza —
  // lásd handleCloseRestPanel/startNavigation lent.
  //
  // UX HOTFIX (2026-09-13, hatodik kör) — "ADD módból is tűnjön el a másik
  // funkció CTA-ja". Az ötödik kör verziójában restPanelMode-ot a
  // RestStopFlowPanel EGYÁLTALÁN nem ismerte — az KIZÁRÓLAG a RestPointQuickAdd
  // megjelenítését/rejtését és a sticky fejléc címét vezérelte ebben a
  // szülőben. Emiatt a RestStopFlowPanel SAJÁT belső idle-chooser gombja
  // ("Pihenőre van szükségem") ADD módban (külső "Pihenőpont hozzáadása")
  // is tovább látszott az add UI ALATT — ez volt a hatodik kör jelentett
  // hibája. A javítás: a `RestPanelMode` típus mostantól a
  // RestStopFlowPanel.tsx-ből van importálva (egyetlen forrás), és a
  // panel egy KÖTELEZŐ `mode` propként kapja meg — a saját belső
  // idle-chooser UI-ját (lásd RestStopFlowPanel.tsx render törzse) ez
  // alapján rendereli, MINDKÉT explicit módban elrejtve azt (a döntés
  // MINDIG a szülőben, a két külső CTA valamelyikének megnyomásával
  // történik).
  const [restPanelMode, setRestPanelMode] = useState<RestPanelMode>("ADD");

  const handleRequestRestCta = () => {
    setRestPanelMode("SEARCH");
    setRestPanelVisible(true);
    setRestRequestToken((token) => token + 1);
  };

  const handleAddRestPointCta = () => {
    setRestPanelMode("ADD");
    setRestPanelVisible(true);
  };

  const handleCloseRestPanel = () => {
    setRestPanelVisible(false);
    setRestPanelMode("ADD"); // bezáráskor mindig biztonságos alapállapotba áll vissza — a J. teszt szerint egyik mód sem "ragadhat be".
  };

  const startNavigation = () => {
    bumpNavigationSession();
    rerouteGuardRef.current = resetRerouteGuard();
    setAutomaticRerouteStatus("IDLE");
    setAutomaticRerouteMessage(null);
    setNavigationMode(true);
    setFollowMode(true);
    setManualFullscreen(false); // navigationMode már magában fullscreen — nincs szükség a külön manuális flagre is.
    setRestPanelVisible(false); // friss navigációs session mindig ZÁRT pihenőpont-panellel indul — a teljes képernyős térkép az elsődleges nézet.
    setRestPanelMode("ADD"); // friss navigációs session mindig alap ("ADD") pihenőpont-módból indul.
    geo.startWatching();
  };

  const stopNavigation = () => {
    bumpNavigationSession();
    rerouteGuardRef.current = resetRerouteGuard();
    setAutomaticRerouteStatus("IDLE");
    setAutomaticRerouteMessage(null);
    setNavigationMode(false);
    setFollowMode(false);
    geo.stopWatching();
    clearNavigationSession(); // SPRINT 8.2 — explicit navigáció leállítása törli a persisted sessiont.
  };

  // SPRINT 8.2 (NAVIGATION SESSION PERSISTENCE, 2026-09-18) — a navigáció
  // stabil alapját frissítjük storage-ban minden legitim displayedJourney-
  // váltáskor (automatikus reroute, rest-stop resume), amíg a navigáció
  // aktív — egy reload/tab-eviction ezért a LEGFRISSEBB stabil journey-t
  // állítja helyre, nem a kártya induló itineraryjét. Az ÚJ payload
  // felülírja a régit (nincs szükség külön "clear a régi session-t"
  // lépésre destination/journey-váltáskor).
  useEffect(() => {
    if (!navigationMode) return;
    saveNavigationSession(
      serializeNavigationSession({
        destination: deriveDestinationFromJourney(displayedJourney),
        displayedJourney,
        nowMs: Date.now(),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationMode, displayedJourney]);

  // WatchPosition lifecycle (spec 9. pont, "mandatory clearWatch on stop/
  // unmount") — ha a kártya BEZÁRUL (isOpen -> false) navigáció közben, a
  // GPS-követést AZONNAL le kell állítani, nem hagyhatjuk némán futni egy
  // olyan nézet mögött, ami már nem is látható. A useGeolocation() saját
  // unmount-cleanupja (lásd a hook fejléce) csak a TELJES komponens
  // unmountjára vonatkozik — ez a kártya viszont isOpen=false esetén NEM
  // unmountol (lásd a komponens fejléce elején), csak a JSX-blokkja tűnik
  // el, a geo/navigationMode state él tovább -> ezt itt explicit kell
  // kezelni.
  useEffect(() => {
    if (!isOpen && navigationMode) {
      bumpNavigationSession();
      rerouteGuardRef.current = resetRerouteGuard();
      setAutomaticRerouteStatus("IDLE");
      setAutomaticRerouteMessage(null);
      setNavigationMode(false);
      setFollowMode(false);
      geo.stopWatching();
      clearNavigationSession(); // SPRINT 8.2 — a kártya-bezárás közbeni navigáció-leállítás is törli a persisted sessiont.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // PWA install UX sprint, spec 23./25. pont — sitewide jelzés a
  // navigationModeSignal modulon keresztül (lásd ott a fejléc), hogy a
  // PWAInstallBanner (teljesen külön React-fa, app/layout.tsx) sose
  // jelenjen meg AKTÍV Navigation Mode fölött, és ha épp nyitva van,
  // amikor a Navigation Mode elindul, záródjon. Az effekt maga NEM ismer
  // semmit a PWA-ról — csak a saját navigationMode állapotát sugározza ki;
  // unmountkor (és minden más navigationMode=false átmenetkor, pl.
  // stopNavigation/isOpen-close) explicit false-ra állítja, hogy sose
  // maradjon "beragadva" true-n egy eltűnt kártya után.
  useEffect(() => {
    setNavigationModeActive(navigationMode);
    return () => {
      setNavigationModeActive(false);
    };
  }, [navigationMode]);

  // Egyetlen megosztott térkép (UX módosítás, 2026-09-09) — a
  // RestStopFlowPanel NEM hoz létre saját térképet, hanem ezen a callback-en
  // keresztül jelenti, hogy a "Pihenőre van szükségem" folyamat éppen milyen
  // (derived, primitív-barát) állapotban van; ez a kártya EZT egyesíti a
  // saját (displayedJourney/sessionRestPoints) állapotával az EGYETLEN
  // <VedettUtvonalMap> hívásban lent. Alapállapotban (nincs aktív
  // pihenőpont-folyamat) a térkép változatlanul a normál navigációs nézetet
  // mutatja — pontosan úgy, mint a Task A előtt.
  const [restStopMapState, setRestStopMapState] = useState<RestStopMapState>({
    active: false,
    legsOverride: undefined,
    restPoints: [],
    selectedRestPointId: null,
    onSelectRestPoint: undefined,
    focusOnRestPoints: false,
  });

  const currentPosition = useMemo(
    () =>
      geo.status === "granted" && geo.latitude !== null && geo.longitude !== null
        ? {
            latitude: geo.latitude,
            longitude: geo.longitude,
            headingDegrees: geo.headingDegrees,
            speedMetersPerSecond: geo.speedMetersPerSecond,
            timestampMs: geo.timestampMs,
            // SPRINT 7.1, Section D — a böngésző GeolocationPosition.coords.
            // accuracy értéke MÁR elérhető volt a useGeolocation() hookban
            // (accuracyMeters), csak eddig nem jutott el a navigációs
            // logikáig. Itt KIZÁRÓLAG a WALK→TRANSIT boundary resolver
            // olvassa (lásd lentebb) — a routeProgress/route-matching motor
            // globális toleranciáját ez NEM módosítja.
            accuracyMeters: geo.accuracyMeters,
          }
        : null,
    [geo.status, geo.latitude, geo.longitude, geo.headingDegrees, geo.speedMetersPerSecond, geo.timestampMs, geo.accuracyMeters],
  );

  // NAVIGATION FOUNDATION (2026-09-17) — GPS FIX FRESHNESS + FOREGROUND
  // REACQUISITION. `gpsFixUsable` a JELENLEGI currentPosition fixre
  // vonatkozik (nem egy külön state machine) — false, ha a fix STALE/
  // INVALID, VAGY ha a dokumentum épp visszatért láthatóra és MÉG NEM
  // érkezett egy, a visszatérés UTÁNI genuinely friss fix.
  const gpsFixGateRef = useRef(createInitialGpsFixGateState());
  const [gpsFixUsable, setGpsFixUsable] = useState(true);
  // TRANSIT STATE CONTINUITY + GPS REACQUISITION SPRINT (2026-09-18) — igaz
  // egy tényleges GPS LOST periódus UTÁN, amíg még nem gyűlt össze
  // GPS_REACQUISITION_STABLE_FIXES egymást követő GOOD fix (lásd
  // gpsFixGate.ts isGpsReacquiring()). A c4dfab5 camera-safety SZÁNDÉKOSAN
  // NEM ezt olvassa (lásd a térkép-komponens currentPosition propját
  // lentebb, ami változatlanul KIZÁRÓLAG gpsFixUsable-t nézi) — ez a jelző KIZÁRÓLAG a
  // route-progress/boarding pozitív bizonyítékot fagyasztja és a reroute-ot
  // tiltja le, a kamera/marker stabilitást nem érinti.
  const [gpsReacquiring, setGpsReacquiring] = useState(false);

  // FOREGROUND REACQUISITION — SPRINT 8.1 (2026-09-18). A `visibilitychange`
  // listener [] deps-szel regisztrálódik (mount-kor egyszer) — friss
  // navigationMode/displayedJourney értéket ezért refből olvas, nem a
  // closure-ből (spec 2. pont: "csak akkor induljon foreground
  // reacquisition, ha navigation aktív ÉS van aktuális journey/session").
  const navigationModeRef = useRef(navigationMode);
  navigationModeRef.current = navigationMode;
  const hasDisplayedJourneyRef = useRef(displayedJourney.legs.length > 0);
  hasDisplayedJourneyRef.current = displayedJourney.legs.length > 0;

  // COMMIT ELŐTTI CÉLZOTT KORREKCIÓ (2026-09-18) — a handleVisibilityChange
  // korábban KIZÁRÓLAG a JELENLEGI document.visibilityState-et nézte
  // ("=== visible"), és implicit módon bízott abban, hogy a böngésző
  // visibilitychange eseménye csak VALÓDI állapotváltozáskor tüzel. Ez egy
  // explicit, hívó-oldali "előző állapot" reffel most determinisztikusan
  // bizonyított — lásd isGenuineForegroundTransition() (pure, tesztelt).
  // Kezdőérték: a document TÉNYLEGES jelenlegi állapota (SSR/teszt alatt,
  // ahol `document` nem létezik, "visible" a biztonságos, semleges alapérték
  // — ott ez az effekt egyébként sem fut, lásd lentebb `typeof document`).
  const previousVisibilityStateRef = useRef<DocumentVisibilityState>(
    typeof document !== "undefined" ? (document.visibilityState as DocumentVisibilityState) : "visible",
  );

  // A gpsFixGate.ts KIMENETÉBŐL (usable/reacquiring) frissíti a
  // foregroundRecoveryRef fázisát — nem duplikál semmilyen freshness/
  // quality logikát, csak a MÁR kiszámolt eredményt adja tovább. Csak
  // akkor logol/renderel, ha a fázis TÉNYLEG változott (nincs zajos,
  // minden tick-en ismétlődő log/setState).
  const applyForegroundRecoveryPhaseUpdate = (gps: { usable: boolean; reacquiring: boolean }) => {
    const previous = foregroundRecoveryRef.current;
    const next = updateForegroundRecoveryPhase(previous, gps);
    if (next.phase === previous.phase) return;
    foregroundRecoveryRef.current = next;
    setForegroundRecoveryPhase(next.phase);
    if (next.phase === "STABLE") {
      vedettRouteForegroundDebugLog("foreground_reacquisition_stable", { generation: next.generation });
    }
  };

  // SPRINT 8.2 — a MEGLÉVŐ gpsFixGate.ts kimeneteiből frissíti a KÜLÖN
  // restoreRecoveryRef fázisát is (lásd a modul fejlécét a foreground/
  // restore recovery elkülönítéséről).
  const applyRestoreRecoveryPhaseUpdate = (gps: { usable: boolean; reacquiring: boolean }) => {
    const previous = restoreRecoveryRef.current;
    const next = updateForegroundRecoveryPhase(previous, gps);
    if (next.phase === previous.phase) return;
    restoreRecoveryRef.current = next;
    setRestoreRecoveryPhase(next.phase);
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibilityChange = () => {
      // A "előző állapot" reffel EXPLICITEN bizonyítjuk, hogy VALÓDI
      // hidden->visible átmenet történt — nem csak azt, hogy a JELENLEGI
      // állapot "visible" (lásd isGenuineForegroundTransition()). A refet
      // MINDEN hívásnál frissítjük, még akkor is, ha ez az esemény nem
      // genuine tranzitiont képvisel (pl. egy "hidden" esemény vagy egy
      // spurious, ismételt "visible" hívás) — így a KÖVETKEZŐ esemény is
      // helyesen ítélhető meg.
      const previousVisibilityState = previousVisibilityStateRef.current;
      const currentVisibilityState = document.visibilityState as DocumentVisibilityState;
      previousVisibilityStateRef.current = currentVisibilityState;
      if (!isGenuineForegroundTransition(previousVisibilityState, currentVisibilityState)) return;
      gpsFixGateRef.current = markVisibilityReturned(gpsFixGateRef.current, Date.now());
      // A KORÁBBAN tárolt fix nem válik automatikusan frissé a visszatéréskor
      // — azonnal usable=false, amíg a KÖVETKEZŐ genuinely friss fix megérkezik.
      setGpsFixUsable(false);
      // Foreground-reacquisition csak akkor indul, ha valóban aktív
      // navigáció folyik ÉS van megjelenített journey — máskor a
      // gpsFixUsable=false fentebbi mellékhatása ártalmatlan (nincs, ami
      // olvassa), de EXPLICIT recovery-ciklust/logolást nem indítunk.
      if (!navigationModeRef.current || !hasDisplayedJourneyRef.current) return;
      foregroundRecoveryRef.current = startForegroundRecovery(foregroundRecoveryRef.current);
      setForegroundRecoveryPhase(foregroundRecoveryRef.current.phase);
      vedettRouteForegroundDebugLog("foreground_reacquisition_started", {
        generation: foregroundRecoveryRef.current.generation,
      });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const result = evaluateGpsFixUsability(gpsFixGateRef.current, currentPosition?.timestampMs ?? null, Date.now());
    gpsFixGateRef.current = result.nextState;
    setGpsFixUsable(result.usable);
    setGpsReacquiring(isGpsReacquiring(result.nextState));
    applyForegroundRecoveryPhaseUpdate({ usable: result.usable, reacquiring: isGpsReacquiring(result.nextState) });
    applyRestoreRecoveryPhaseUpdate({ usable: result.usable, reacquiring: isGpsReacquiring(result.nextState) });
  }, [currentPosition?.timestampMs]);

  // METRO GPS LOSS + MAP CAMERA SAFETY SPRINT (2026-09-17) — a FENTI effekt
  // KIZÁRÓLAG új currentPosition.timestampMs érkezésekor fut. Ha a GPS
  // TELJESEN elnémul (pl. metróalagút — a watchPosition egyáltalán nem ad
  // több fixet), a fenti effekt SOHA nem futna újra, és gpsFixUsable örökre
  // az UTOLSÓ (jó) értéken ragadna, hiába telt el réges régen a
  // GPS_FIX_MAX_AGE_MS. Ez a periodikus újraértékelés UGYANAZT a pure
  // evaluateGpsFixUsability()-t hívja, a jelenlegi Date.now()-hoz képest —
  // NEM egy új heurisztika/threshold, csak a MEGLÉVŐ staleness-küszöb
  // órajel-vezérelt újraellenőrzése. Kizárólag AKTÍV navigáció alatt fut
  // (máskor nincs értelme), és SOSEM állítja vissza automatikusan a
  // followMode-ot vagy a kamerát — kizárólag a gpsFixUsable minőség-jelzőt
  // tartja naprakészen, amit a lenti <VedettUtvonalMap> pozíció-gate-je
  // (mapCurrentPosition) és a meglévő navigációs guardok olvasnak.
  useEffect(() => {
    if (!navigationMode) return;
    const intervalId = window.setInterval(() => {
      const result = evaluateGpsFixUsability(gpsFixGateRef.current, currentPosition?.timestampMs ?? null, Date.now());
      gpsFixGateRef.current = result.nextState;
      setGpsFixUsable(result.usable);
      setGpsReacquiring(isGpsReacquiring(result.nextState));
      applyForegroundRecoveryPhaseUpdate({ usable: result.usable, reacquiring: isGpsReacquiring(result.nextState) });
      applyRestoreRecoveryPhaseUpdate({ usable: result.usable, reacquiring: isGpsReacquiring(result.nextState) });
    }, 5_000);
    return () => window.clearInterval(intervalId);
  }, [navigationMode, currentPosition?.timestampMs]);

  // NAVIGATION SPRINT 2.1 — az EGYETLEN, ténylegesen megjelenített útvonal
  // geometriájából stabil koordinátalistát készítünk a route-progress motorhoz.
  // Ugyanazt a journeyLegsToGeoJson() normalizálást használjuk, mint maga a
  // térkép, ezért a progress engine és a kirajzolt útvonal ugyanazon a
  // geometrián dolgozik. useMemo szükséges: a useRouteNavigation route-váltásnak
  // tekinti a routeCoordinates referencia változását, ezért GPS-tickenként nem
  // szabad új tömböt létrehozni.
  const navigationLegs = restStopMapState.active && restStopMapState.legsOverride
    ? restStopMapState.legsOverride
    : displayedJourney.legs;

  // NAVIGATION INSTRUCTIONS SPRINT 2 (2026-09-16) — a koordinátalista ÉS a
  // leg-geometria tartományok (legRanges) MOST egyetlen, közös helperből
  // (lib/vedett-route/geometry.ts journeyLegsToNavigationRoute()) származnak,
  // hogy a routeProgress.matchedSegmentIndex és az instrukció-modell
  // UGYANARRA a flatten/dedup geometriára mutasson — lásd a helper
  // fejlécének dokumentációját a megosztott-határpont kezeléséről.
  const navigationRouteGeometry = useMemo(
    () => journeyLegsToNavigationRoute(navigationLegs),
    [navigationLegs]
  );
  const navigationRouteCoordinates = navigationRouteGeometry.coordinates;

  // TRANSIT STATE CONTINUITY + GPS REACQUISITION SPRINT (2026-09-18) — a
  // `gpsReacquiring` gate UGYANAZT a MEGLÉVŐ mintát követi, mint a c4dfab5
  // sprint gpsFixUsable-gate-je: egy LOST periódus utáni, még nem stabil
  // fixet a route-progress motor SOHA nem kap meg pozícióként, tehát nem
  // gyűjthet OFF_ROUTE-bizonyítékot/nem indíthat auto-reroute-ot belőle
  // (lásd rerouteGuard.ts gpsReacquiring bemenete is). A kamera/marker
  // (VedettUtvonalMap currentPosition prop) SZÁNDÉKOSAN nem ezt a gate-et
  // olvassa — c4dfab5 camera safety változatlan.
  const routeNavigationPosition = useMemo(
    () =>
      currentPosition && gpsFixUsable && !gpsReacquiring
        ? {
            latitude: currentPosition.latitude,
            longitude: currentPosition.longitude,
            speedMetersPerSecond: currentPosition.speedMetersPerSecond,
            timestampMs: currentPosition.timestampMs,
          }
        : null,
    [currentPosition, gpsFixUsable, gpsReacquiring],
  );

  const routeProgress = useRouteNavigation(
    navigationRouteCoordinates,
    routeNavigationPosition,
    {
      routeDurationSeconds: Math.max(0, displayedJourney.totalDurationMinutes * 60),
    },
    navigationMode,
  );

  // ETA V2: navigáció közben a lokális route-progress motor a GPS-pozícióból
  // számolja a hátralévő geometriai arányt, ebből a hátralévő időt és ETA-t.
  // Ez NEM forgalmi/realtime újratervezés: nincs GPS-tickenként hálózati kérés.
  // Amíg nincs használható GPS+route progress, visszaesünk a routing engine
  // eredeti arrivalTime értékére.
  const navigationEta = routeProgress.estimatedArrivalTimeMs !== null
    ? formatClockTime(new Date(routeProgress.estimatedArrivalTimeMs).toISOString())
    : formatClockTime(displayedJourney.arrivalTime);
  const navigationRemainingDistance = routeProgress.routeDistanceMeters > 0
    ? routeProgress.remainingDistanceMeters
    : null;
  const navigationRemainingMinutes = routeProgress.remainingDurationSeconds !== null
    ? Math.max(0, Math.ceil(routeProgress.remainingDurationSeconds / 60))
    : null;

  // NAVIGATION INSTRUCTIONS SPRINT 1 (2026-09-16) — a MEGLÉVŐ
  // displayedJourney.legs-ből (pure derivation, useMemo) épül fel az
  // instrukció-lista. SZÁNDÉKOSAN a displayedJourney.legs-ből, NEM a fenti
  // navigationLegs-ből (ami rest-stop legsOverride alatt egy
  // JourneyLegForGeometry[] lehet — lásd lib/vedett-route/geometry.ts —,
  // aminek NINCS fromName/toName/routeShortName mezője, tehát abból nem
  // épülne megbízható szöveg). Ez a KORLÁTOZÁS oka, hogy a kártya
  // rest-stop legsOverride aktív ideje alatt NEM jelenik meg (lásd
  // activeNavigationInstruction lentebb) — a MEGLÉVŐ rest-stop flow
  // (map/progress) ettől TELJESEN érintetlen marad.
  // Automatikus reroute kompatibilitás: setDisplayedJourney(...) után ez a
  // useMemo automatikusan újraépül (nincs külön, szinkronizálandó
  // instruction state — elkerülve a "stale navigation instruction"
  // problémát).
  const navigationInstructions = useMemo(
    () => buildNavigationInstructions({ legs: displayedJourney.legs }),
    [displayedJourney.legs]
  );
  // NAVIGATION INSTRUCTIONS SPRINT 2 (2026-09-16) — matchedSegmentIndex ->
  // legIndex -> leg-en belüli fázis. A navigationRouteGeometry.legRanges a
  // navigationLegs-ből épül, ami rest-stop legsOverride NÉLKÜL pontosan
  // megegyezik displayedJourney.legs-szel (lásd fent) — a kártya emiatt
  // CSAK abban az esetben él ezekkel az adatokkal, amikor a legIndex-ek
  // valóban a navigationInstructions-t felépítő legs tömbre mutatnak.
  const geometryActiveLegIndex = resolveActiveLegIndex(routeProgress.matchedSegmentIndex, navigationRouteGeometry.legRanges);
  const geometryActiveLeg = typeof geometryActiveLegIndex === "number" ? navigationLegs[geometryActiveLegIndex] : undefined;

  // SPRINT 7.1, Section B/C/E — WALK→TRANSIT BOUNDARY RESOLVER. A `geometryActiveLegIndex`
  // (fent) KIZÁRÓLAG a globális GPS-projekcióból jön (lásd a sprint audit-
  // riportját: ez okozta a "150 m felesleges gyaloglás" és a "WALK-on
  // ragadás felszállás után" hibákat). Ha a geometria épp WALK-ot jelez,
  // megkeressük a KÖVETKEZŐ TRANSIT leget és annak SAJÁT, lokális
  // geometriáját/boarding-koordinátáját — ez a legTransition.ts pure
  // resolver bemenete. A resolver EGY MÁSODIK, FÜGGETLEN GPS-bizonyítékot
  // ad (nem a globális matchedSegmentIndex-et), és csak TÖBB egymást követő,
  // konzisztens fix után finomítja az aktív leg indexét — sosem egyetlen
  // mintából, sosem idő alapján (lásd a modul fejlécét).
  const nextTransitLegForBoundary = useMemo(() => {
    if (geometryActiveLeg?.mode !== "WALK" || typeof geometryActiveLegIndex !== "number") return null;
    for (let i = geometryActiveLegIndex + 1; i < navigationLegs.length; i += 1) {
      if (navigationLegs[i].mode === "TRANSIT") {
        const leg = navigationLegs[i];
        const range = navigationRouteGeometry.legRanges.find((r) => r.legIndex === i) ?? null;
        return {
          legIndex: i,
          boardingCoordinate:
            typeof leg.fromLon === "number" && typeof leg.fromLat === "number"
              ? ([leg.fromLon, leg.fromLat] as const)
              : null,
          legCoordinates: range?.legCoordinates ?? null,
          // SAFETY SPRINT (2026-09-17) — a leg NORMALIZÁLT transitMode-ja
          // (lásd orchestrator.ts mapLeg(), JourneyLeg.transitMode), a
          // legTransition.ts gyenge-geometriás BOARDED_UNCERTAIN_GEOMETRY
          // fallbackjához.
          transitMode: leg.transitMode,
          // TRANSIT STATE CONTINUITY + ARRIVAL SPRINT (2026-09-18) — a leg
          // SAJÁT to-koordinátája (leszállási pont) a generikus ARRIVED
          // felismeréshez (lásd legTransition.ts), ÉS igaz/hamis jelző,
          // hogy van-e a Journey-ben egy KÖVETKEZŐ leg ez után (az ARRIVED
          // csak akkor léphet tovább — a végső megérkezést a MEGLÉVŐ
          // isAtRouteEnd() jelzi, ezt a modul azt nem helyettesíti).
          alightingCoordinate:
            typeof leg.toLon === "number" && typeof leg.toLat === "number"
              ? ([leg.toLon, leg.toLat] as const)
              : null,
          hasFollowingLeg: i + 1 < navigationLegs.length,
        };
      }
    }
    return null;
  }, [geometryActiveLeg?.mode, geometryActiveLegIndex, navigationLegs, navigationRouteGeometry.legRanges]);

  // Ugyanaz a reset-pont, mint a routeProgress motoré (új route vagy
  // navigáció ki/be) — lásd useRouteNavigation.ts. Stabil objektum-referencia
  // (useMemo), különben a hook minden renderen resetelne a hiszterézisen.
  const boundaryResetKey = useMemo(
    () => ({ coordinates: navigationRouteCoordinates, mode: navigationMode }),
    [navigationRouteCoordinates, navigationMode],
  );
  // Stabil objektum-referencia a GPS-pozícióhoz — KIZÁRÓLAG akkor változzon,
  // ha a tényleges lat/lon/accuracy is változott, különben egy React
  // re-render (a tényleges GPS-fixtől függetlenül) hamis, extra
  // hiszterézis-lépést okozna a boundary resolverben (lásd
  // useWalkToTransitBoundary.ts — az effect a `position` REFERENCIÁJÁRA
  // figyel).
  // Ugyanaz a gpsReacquiring-gate, mint routeNavigationPosition-nél fent —
  // egy LOST utáni instabil fix a boundary resolvernek se adjon SE
  // boarding-, SE (a legTransition.ts ARRIVED ágán) érkezés-bizonyítékot.
  const boundaryPosition = useMemo(
    () =>
      currentPosition && gpsFixUsable && !gpsReacquiring
        ? { latitude: currentPosition.latitude, longitude: currentPosition.longitude, accuracyMeters: currentPosition.accuracyMeters }
        : null,
    [currentPosition, gpsFixUsable, gpsReacquiring],
  );
  const walkToTransitBoundary = useWalkToTransitBoundary(
    {
      geometryActiveLegIndex,
      geometryActiveLegMode: (geometryActiveLeg?.mode as "WALK" | "TRANSIT" | "RENTAL" | undefined) ?? null,
      nextTransitLeg: nextTransitLegForBoundary,
      position: boundaryPosition,
      offRouteStatus: routeProgress.offRouteStatus,
      previous: null,
    },
    boundaryResetKey,
  );

  // A VÉGSŐ, a kártya/instrukciók/stop-progress által használt leg index —
  // normál esetben (WALKING/APPROACHING_BOARDING/AT_BOARDING_AREA/NOT_APPLICABLE)
  // byte-ra a geometriai értékkel egyezik; KIZÁRÓLAG BOARDED állapotban vált
  // a következő TRANSIT legre.
  const activeLegIndex = walkToTransitBoundary.resolvedLegIndex ?? geometryActiveLegIndex;
  const activeLegRange = navigationRouteGeometry.legRanges.find((range) => range.legIndex === activeLegIndex) ?? null;
  // TRANSIT STATE CONTINUITY + ARRIVAL SPRINT (2026-09-18) — ROOT CAUSE
  // FIX a "Szállj fel felszállás után is kiírva marad" hibára (Probléma A).
  // resolveLegPhaseFraction() a GLOBÁLIS routeProgress.matchedSegmentIndex-
  // et projektálja az AKTÍV (BOARDED esetén már a TRANSIT) leg saját
  // tartományára — de amíg a globális, összefűzött route-matching a
  // gyenge/rövid TRANSIT geometrián NEM tud jól illeszkedni (pont ez a
  // VPS-proven S40 eset), ez a fraction STRUKTURÁLISAN 0 marad, ezért az
  // instructions.ts selectActiveInstruction() mindig a leg ELSŐ
  // sub-instrukcióját ("Szállj fel") választja — FÜGGETLENÜL attól, hogy a
  // walkToTransitBoundary MÁR bizonyítottan BOARDED/BOARDED_UNCERTAIN_
  // GEOMETRY. Fix: ha a boundary resolver már felszállást (vagy gyenge-
  // geometriás felszállási bizonyítékot) jelez, a fraction-t egy
  // konzervatív, a "RIDE" sub-instrukciót garantáltan kiválasztó értékre
  // (0.5) emeljük — ez SOHA nem csökkenti a fractiont (Math.max), tehát
  // valódi geometriai előrehaladás (pl. jó geometriájú legeknél) továbbra
  // is elérheti az ALIGHT/TRANSFER sub-instrukciót. Nincs jármű-azonosítás,
  // nincs kitalált pozíció — kizárólag a MÁR MEGLÉVŐ, GPS-bizonyítékkal
  // igazolt fázisállapot.
  const isBoardedPhase =
    walkToTransitBoundary.phase === "BOARDED" || walkToTransitBoundary.phase === "BOARDED_UNCERTAIN_GEOMETRY";
  const activeLegPhaseFraction = isBoardedPhase
    ? Math.max(0.5, resolveLegPhaseFraction(routeProgress.matchedSegmentIndex, activeLegRange))
    : resolveLegPhaseFraction(routeProgress.matchedSegmentIndex, activeLegRange);
  const activeRouteEnd = isAtRouteEnd(routeProgress.matchedSegmentIndex, navigationRouteGeometry.coordinates.length);
  // NAVIGATION INSTRUCTIONS SPRINT 3 (2026-09-16) — megállópozíció-alapú
  // "Utazz még N megállót" / "A következő megállónál szállj le", a Sprint 2
  // geometriai fázis-fallback MEGTARTÁSÁVAL. Kizárólag a MÁR MEGLÉVŐ
  // displayedJourney.legs[activeLegIndex].intermediateStops-ot használjuk
  // (ugyanaz a leg, amiből navigationInstructions is épül — lásd fenti
  // komment), és a leg SAJÁT (activeLegRange.legCoordinates) geometriáját —
  // SOSEM a teljes route-ot — a köztes megállók vetítéséhez. Ha a
  // buildLegStopProgress()/resolveRemainingStops() bármely okból
  // megbízhatatlannak minősíti az adatot (hiányzó/túl messze lévő
  // koordináta, nem monoton sorrend, invalid matchedSegmentIndex — lásd
  // ott a dokumentációt), az eredmény null/reliable=false, és
  // selectActiveInstructionWithStopProgress() BYTE-RA a Sprint 2 fallbackra
  // esik vissza.
  const activeLeg = typeof activeLegIndex === "number" ? displayedJourney.legs[activeLegIndex] : undefined;
  // SAFETY SPRINT (2026-09-17) — igaz, HA az aktuális aktív leg sínhez/
  // vezetett pályához kötött (RAIL/REGIONAL_RAIL/SUBWAY/TRAM, a NORMALIZÁLT
  // JourneyLeg.transitMode alapján) ÉS a SAJÁT geometriája (activeLegRange.
  // legCoordinates) bizonyítottan "weak" (lásd transitGeometryConfidence.ts,
  // pl. a VPS-proven S40 2-pontos eset). Kizárólag ezt a MEGLÉVŐ, MÁR
  // kiszámolt geometriát nézi — nincs új mérés/becslés. Ez a jel az
  // automatikus reroute-ot tiltja le (lásd lent), a WALK OFF_ROUTE/reroute
  // logikát NEM érinti (activeLeg.mode === "TRANSIT" feltétel).
  const activeLegTransitGeometryUncertain =
    activeLeg?.mode === "TRANSIT" &&
    isRailGuidedTransitMode(activeLeg.transitMode) &&
    classifyTransitGeometryConfidence(activeLegRange?.legCoordinates ?? null) === "WEAK";
  const activeLegStopProgress = useMemo(
    () =>
      activeLeg && activeLegRange
        ? buildLegStopProgress(activeLeg.intermediateStops, activeLegRange.legIndex, activeLegRange.legCoordinates)
        : { stops: [], reliable: false },
    [activeLeg, activeLegRange]
  );
  const activeRemainingStops = activeLegStopProgress.reliable
    ? resolveRemainingStops(routeProgress.matchedSegmentIndex, activeLegRange, activeLegStopProgress.stops)
    : null;
  const activeNavigationInstruction = useMemo(
    () =>
      selectActiveInstructionWithStopProgress(navigationInstructions, {
        legIndex: activeLegIndex,
        legPhaseFraction: activeLegPhaseFraction,
        atRouteEnd: activeRouteEnd,
        remainingStops: activeRemainingStops,
      }),
    [navigationInstructions, activeLegIndex, activeLegPhaseFraction, activeRouteEnd, activeRemainingStops]
  );
  // NAVIGATION — WALK TURN-BY-TURN PROGRESS (Sprint 5, 2026-09-16). CSAK
  // akkor aktív, ha az activeLeg valóban WALK (nem érinti a
  // TRANSIT/RENTAL BOARD/RIDE/ALIGHT/TRANSFER/BIKE_* szövegeket, lásd
  // instructionsForLeg() a Sprint 1/2/3 modulban — VÁLTOZATLAN). A
  // manoeuvre-lista KIZÁRÓLAG az aktív leg SAJÁT, leg-lokális
  // geometriájából (activeLegRange.legCoordinates) épül — ugyanaz a
  // geometria, amit a Sprint 3 stop-progress is használ, tehát reroute
  // után (új displayedJourney -> új navigationRouteGeometry) automatikusan
  // ÚJ manoeuvre-listát ad, nincs stale state.
  const activeLegIsWalk = activeLeg?.mode === "WALK";
  const activeLegManoeuvres = useMemo(
    () => (activeLegIsWalk && activeLegRange ? detectWalkManoeuvres(activeLegRange.legCoordinates) : []),
    [activeLegIsWalk, activeLegRange]
  );
  const activeLegTotalDistanceMeters =
    activeLegManoeuvres.length > 0 ? activeLegManoeuvres[activeLegManoeuvres.length - 1].distanceFromStartMeters : 0;
  // A leg-lokális kumulatív távolság a MÁR MEGLÉVŐ, backward-tolerance
  // védett routeProgress.progressDistanceMeters-ből származik (nem
  // légvonal, nem legPhaseFraction-becslés) — lásd
  // walkManoeuvreProgress.ts resolveDistanceAlongLegMeters() fejléce.
  const activeLegDistanceAlongMeters = activeLegIsWalk
    ? resolveDistanceAlongLegMeters(
        routeProgress.progressDistanceMeters,
        navigationRouteGeometry.coordinates,
        activeLegRange,
        activeLegTotalDistanceMeters
      )
    : null;
  const activeWalkProgress =
    activeLegIsWalk && activeLegManoeuvres.length > 0 && activeLegDistanceAlongMeters !== null
      ? resolveWalkProgress(activeLegManoeuvres, activeLegDistanceAlongMeters)
      : null;
  // Ha nincs megbízható manoeuvre/progress adat (rövid/hiányzó geometria,
  // nincs GPS-match még), a Sprint 2/3 WALK fallback ("Gyalogolj: X")
  // marad — SOSEM jelenítünk meg technikai bizonytalanságot.
  //
  // SPRINT 7.1, Section C — BOARDING PROXIMITY. Ha a walkToTransitBoundary
  // resolver AT_BOARDING_AREA-t jelez (a user ésszerű közelségben van a
  // boarding ponthoz, lásd legTransition.ts), a maradék-méter alapú
  // "Haladj tovább X métert" szöveg félrevezető lenne (ez volt a mobilteszt
  // 1. hibája) — ehelyett egy konkrét, distance-mentes üzenetet mutatunk.
  // Ez NEM váltja a leget (a geometria még WALK-ot mutat), csak a SZÖVEGET
  // finomítja — a resolvedLegIndex-alapú BOARDED váltás továbbra is a
  // konzisztens, több-fixes bizonyíték után történik (lásd fentebb).
  const activeNavigationInstructionWithWalkProgress =
    activeLegIsWalk && walkToTransitBoundary.phase === "AT_BOARDING_AREA" && activeNavigationInstruction.current
      ? { ...activeNavigationInstruction.current, title: "Már a beszállási pont közelében vagy", detail: undefined }
      : activeNavigationInstruction.current?.kind === "WALK" && activeWalkProgress?.currentManoeuvre && activeWalkProgress.phase
        ? {
            ...activeNavigationInstruction.current,
            title: buildWalkInstructionText(
              activeWalkProgress.currentManoeuvre,
              activeWalkProgress.phase,
              activeWalkProgress.distanceToCurrentMeters ?? 0
            ),
          }
        : activeNavigationInstruction.current;
  // REST STOP KOMPATIBILITÁS — amíg egy rest-stop-indított útvonal
  // (legsOverride) aktív, a kártya NEM jelenik meg (lásd a fenti komment:
  // a JourneyLegForGeometry adatmodell nem elegendő megbízható szöveghez).
  //
  // OFF-ROUTE/REROUTING KOMPATIBILITÁS (Sprint 2, 10. pont) — amíg az
  // automatikus reroute folyamatban van (automaticRerouteStatus ===
  // "REROUTING"), a kártya ÁTMENETILEG elrejtve, hogy ne mutasson elavult
  // instrukciót a RÉGI útvonalról, amíg az ÚJ Journey (és a belőle épülő
  // instrukció-lista/geometria) meg nem érkezik. Ez NEM módosítja az
  // off-route felismerést vagy a rerouteGuardot — csak ennek a kártyának a
  // láthatóságát olvassa.
  const navigationInstructionForDisplay = (restStopMapState.active && restStopMapState.legsOverride) || automaticRerouteStatus === "REROUTING"
    ? null
    : activeNavigationInstructionWithWalkProgress;
  // NAVIGATION — NEXT-INSTRUCTION PREVIEW (Sprint 6, 2026-09-16). A
  // `navigationInstructionForDisplay`-t adjuk át `current`-ként — ez UGYANAZ
  // az érték, ami a kártya cím-szövegét is meghatározza, tehát a REROUTING/
  // rest-stop elnyomás (fent) a previewre IS automatikusan érvényes (null
  // current -> null preview, lásd instructionPreview.ts). A WALK-lokális
  // kanyar-preview csak akkor él, ha van megbízható aktív manőver-progress.
  const activeInstructionPreview = resolveInstructionPreview(
    navigationInstructions,
    navigationInstructionForDisplay,
    activeWalkProgress?.nextManoeuvre ?? null
  );
  // NAVIGATION — ACTIVE-LEG REALTIME INFO (Sprint 7, 2026-09-16). Ugyanazon
  // a gate-en megy át, mint a current instrukció/preview (REROUTING/
  // rest-stop legsOverride alatt navigationInstructionForDisplay === null
  // -> itt is null) — nincs önálló elnyomás-logika. Az `activeLeg` a MÁR
  // MEGLÉVŐ, Sprint 2 óta számolt aktív-leg deriváció (resolveActiveLegIndex),
  // NEM egy második leg-progress rendszer. WALK/RENTAL aktív legen a
  // resolver maga ad null-t (lásd realtimeInfo.ts).
  const activeRealtimeInfo = navigationInstructionForDisplay
    ? resolveNavigationRealtimeInfo(activeLeg ?? null)
    : null;
  // SPRINT 7.1, Section G/H — CURRENT/NEXT TRANSIT TRANSFER TIMING. Ugyanaz
  // a REROUTING/rest-stop elnyomás-gate, mint a többi navigációs mezőnél
  // (navigationInstructionForDisplay === null -> itt is null, nincs önálló
  // elnyomás-logika). `activeLegIndex` a VÉGSŐ (boundary-finomított) index —
  // átszállásnál emiatt a "current vehicle" a MÁR MEGLÉVŐ leget, a "next
  // vehicle" pedig a KÖVETKEZŐ TRANSIT leget mutatja, akkor is, ha a user
  // épp a köztes átszállási gyaloglást teszi meg.
  const activeTransferTiming = navigationInstructionForDisplay
    ? resolveNavigationTransferTiming(displayedJourney.legs, activeLegIndex)
    : { currentArrival: null, nextDeparture: null };

  const lastLeg = displayedJourney.legs.length > 0 ? displayedJourney.legs[displayedJourney.legs.length - 1] : undefined;
  const originalDestination =
    lastLeg && lastLeg.toLat !== undefined && lastLeg.toLon !== undefined
      ? { name: lastLeg.toName, lat: lastLeg.toLat as number, lon: lastLeg.toLon as number }
      : null;

  // AUTOMATIKUS ÚJRATERVEZÉS — ugyanazt a szerveroldali /resume végpontot
  // használjuk, mint a pihenőpont utáni folytatás: aktuális GPS -> eredeti
  // végcél -> friss MOTIS itinerary. A böngésző továbbra sem éri el közvetlenül
  // a route service-t. POSSIBLY_OFF_ROUTE itt nem elég: a guard kizárólag a
  // megerősített OFF_ROUTE állapotot engedi át. Sikertelen próbálkozás után a
  // 30 mp-es guard-cooldown védi a MOTIS-t a reroute-stormtól; ha továbbra is
  // letértünk, egy későbbi GPS-fix után újra próbálkozhat.
  useEffect(() => {
    const decision = shouldStartAutomaticReroute(rerouteGuardRef.current, {
      navigationActive: navigationMode,
      offRouteStatus: routeProgress.offRouteStatus,
      hasCurrentPosition: currentPosition !== null && gpsFixUsable,
      hasDestination: originalDestination !== null,
      nowMs: Date.now(),
      // SAFETY SPRINT (2026-09-17) — gyenge, sínhez kötött transit-geometria
      // esetén a geometria-eltérés önmagában nem lehet automatikus
      // újratervezés alapja (lásd rerouteGuard.ts). A globális 50 m-es
      // OFF_ROUTE küszöb és a WALK reroute-viselkedés VÁLTOZATLAN.
      transitGeometryUncertain: activeLegTransitGeometryUncertain,
      // TRANSIT STATE CONTINUITY + GPS REACQUISITION SPRINT (2026-09-18) —
      // egy LOST periódus utáni, még nem stabil GPS-fix (lásd
      // gpsFixGate.ts isGpsReacquiring()) SOSEM lehet automatikus reroute
      // alapja — UGYANAZ a FÜGGETLEN blokkoló elv, mint fent
      // transitGeometryUncertain-nél. A globális OFF_ROUTE-küszöb és a
      // WALK reroute-viselkedés VÁLTOZATLAN (routeNavigationPosition fent
      // már null-t ad ebben az ablakban, ez itt a plusz védelmi réteg).
      gpsReacquiring,
      // SPRINT 8.1 (FOREGROUND REACQUISITION, 2026-09-18) — amíg a hidden->
      // visible átmenet utáni recovery-ciklus folyamatban van (WAITING_FOR_
      // FRESH_GPS/REACQUIRING), auto-reroute TILOS, EXPLICIT, jól naplózható
      // reason-nel (spec 8. pont) — a globális OFF_ROUTE-küszöb és a
      // gpsReacquiring-guard VÁLTOZATLAN, ez egy plusz védelmi réteg.
      foregroundRecoveryActive: isForegroundRecoveryActive(foregroundRecoveryPhase),
      // SPRINT 8.2 — restore-recovery (storage-ból helyreállított session,
      // MÉG nincs stabil friss GPS) is FÜGGETLEN, plusz blokkoló feltétel.
      restoreRecoveryActive: isForegroundRecoveryActive(restoreRecoveryPhase),
    });
    if (!decision.shouldReroute || !currentPosition || !originalDestination) return;

    const sessionId = rerouteSessionRef.current;
    const attemptStartedAt = Date.now();
    const attemptPosition = { lat: currentPosition.latitude, lon: currentPosition.longitude };
    const attemptDestination = { ...originalDestination };
    rerouteGuardRef.current = markRerouteStarted(rerouteGuardRef.current, attemptStartedAt);
    setAutomaticRerouteStatus("REROUTING");
    setAutomaticRerouteMessage(null);

    void (async () => {
      try {
        const response = await fetch("/api/vedett-route/rest-stops/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPosition: attemptPosition,
            originalDestination: attemptDestination,
            departAt: new Date().toISOString(),
          }),
        });
        const data = (await response.json()) as
          | { ok: true; journey: Journey }
          | { ok: false; reason?: string; message?: string };

        if (rerouteSessionRef.current !== sessionId) return;
        if (data.ok) {
          setDisplayedJourney(data.journey);
          setAutomaticRerouteStatus("IDLE");
          setAutomaticRerouteMessage(null);
          return;
        }

        setAutomaticRerouteStatus("FAILED");
        setAutomaticRerouteMessage(data.message ?? "Az automatikus újratervezés most nem sikerült.");
      } catch {
        if (rerouteSessionRef.current !== sessionId) return;
        setAutomaticRerouteStatus("FAILED");
        setAutomaticRerouteMessage("Az automatikus újratervezés most nem sikerült.");
      } finally {
        // Csak ugyanennek a sessionnek a guardját oldjuk fel. Egy régi kérés
        // befejezése nem írhatja felül egy új navigáció guard-állapotát.
        if (rerouteSessionRef.current === sessionId) {
          rerouteGuardRef.current = markRerouteFinished(rerouteGuardRef.current);
        }
      }
    })();
  }, [
    navigationMode,
    routeProgress.offRouteStatus,
    currentPosition?.latitude,
    currentPosition?.longitude,
    gpsFixUsable,
    gpsReacquiring,
    foregroundRecoveryPhase,
    restoreRecoveryPhase,
    originalDestination?.name,
    originalDestination?.lat,
    originalDestination?.lon,
  ]);

  // LIVE TRANSIT REALTIME REFRESH (Sprint 7.2, 2026-09-16) — a hívó (itt)
  // építi a lekérdezési kontextust a MÁR MEGLÉVŐ displayedJourney saját
  // origin/destination/departAt adataiból, és a TRANSIT lábak stabil
  // (tripId) identitásából — a hook maga sosem lát/bíz a teljes Journey
  // objektumban, csak ebben a szűk kontextusban.
  const nextLegIndex = typeof activeLegIndex === "number" ? activeLegIndex + 1 : 0;
  const hasRelevantTransitLeg = Boolean(
    activeLeg?.mode === "TRANSIT" || displayedJourney.legs[nextLegIndex]?.mode === "TRANSIT"
  );
  const firstLeg = displayedJourney.legs.length > 0 ? displayedJourney.legs[0] : undefined;
  const realtimeRefreshContext = useMemo(() => {
    if (!navigationMode) return null;
    const transitLegIdentities = displayedJourney.legs
      .filter((leg) => leg.mode === "TRANSIT" && leg.tripId)
      .map((leg) => ({ tripId: leg.tripId as string, routeId: leg.routeId }));
    if (transitLegIdentities.length === 0) return null;
    if (firstLeg?.fromLat === undefined || firstLeg?.fromLon === undefined) return null;
    if (lastLeg?.toLat === undefined || lastLeg?.toLon === undefined) return null;
    return {
      from: { lat: firstLeg.fromLat, lon: firstLeg.fromLon },
      to: { lat: lastLeg.toLat, lon: lastLeg.toLon },
      departAt: displayedJourney.departureTime,
      legs: transitLegIdentities,
    };
  }, [navigationMode, displayedJourney, firstLeg, lastLeg]);

  // LIVE ALTERNATIVE — SPRINT 8.4B (2026-09-18). Egyetlen belépési pont a
  // 8.4A pure guard/engine felé — a hívó (React) SOHA nem duplikál guard-
  // logikát, csak a bemeneteket adja át és a döntést végrehajtja. Kizárólag
  // a MEGLÉVŐ, MÁR bekötött POST /api/admin/vedett-utvonal/search
  // planning endpointot hívja (a fő keresési form is ezt hívja, lásd fent
  // handleSubmit) — ez, ELLENTÉTBEN a /rest-stops/resume végponttal, TÖBB
  // ranked Journey candidate-et ad vissza (OrchestratedSearchResult.journeys),
  // ami a Live Alternative candidate-összehasonlításhoz szükséges. A
  // böngésző itt sem éri el közvetlenül a MOTIS-t. Origin: aktuális
  // megbízható GPS. Destination: az AKTÍV navigáció eredeti célja
  // (originalDestination), SOHA nem disruption-módosított. Planning time:
  // "innen MOST van-e jobb út" — explicit CURRENT time, NEM az eredeti,
  // frozen departAt (az továbbra is KIZÁRÓLAG a realtime-refresh identitás
  // számára marad érvényben, lásd realtimeRefreshContext fent).
  const maybeStartLiveAlternativeSearch = async (trigger: LiveAlternativeTrigger) => {
    const nowMs = Date.now();
    const decision = shouldStartLiveAlternativeSearch(liveAlternativeGuardRef.current, {
      navigationActive: navigationMode,
      offRouteConfirmed: routeProgress.offRouteStatus === "OFF_ROUTE",
      gpsReliable: currentPosition !== null && gpsFixUsable && !gpsReacquiring,
      foregroundRecoveryActive: isForegroundRecoveryActive(foregroundRecoveryPhase),
      restoreRecoveryActive: isForegroundRecoveryActive(restoreRecoveryPhase),
      hasDestination: originalDestination !== null,
      trigger,
      nowMs,
    });
    if (!decision.shouldSearch || !currentPosition || !originalDestination) return;

    const sessionGeneration = rerouteSessionRef.current;
    const currentRemaining = computeRemainingJourneyMetrics(displayedJourney, activeLegIndex ?? null);
    liveAlternativeGuardRef.current = markLiveAlternativeSearchStarted(liveAlternativeGuardRef.current, trigger, nowMs);
    setLiveAlternativePreviewOpen(false);
    setLiveAlternativeOffer(startLiveAlternativeOfferSearch(trigger, sessionGeneration));

    try {
      const response = await fetch("/api/admin/vedett-utvonal/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromCoordinates: { latitude: currentPosition.latitude, longitude: currentPosition.longitude },
          toCoordinates: { latitude: originalDestination.lat, longitude: originalDestination.lon },
          toName: originalDestination.name,
          departAt: new Date().toISOString(),
        }),
      });
      const data = (await response.json()) as OrchestratedSearchResult | { ok: false; reason?: string };

      if (rerouteSessionRef.current !== sessionGeneration) {
        setLiveAlternativeOffer((offer) => discardLiveAlternativeSearch(offer, sessionGeneration));
        return;
      }
      if (!data.ok || !Array.isArray(data.journeys) || data.journeys.length === 0) return;

      const candidates = data.journeys.map((ranked) => ranked.journey);
      const currentFingerprint = displayedJourney.fingerprint ?? computeJourneyFingerprint(displayedJourney);
      const best = selectBestLiveAlternativeCandidate(candidates, currentFingerprint);
      if (!best) return;

      const candidateRemaining = computeRemainingJourneyMetrics(best, 0);
      const switchingCost = computeSwitchingCost({ current: currentRemaining, candidate: candidateRemaining });
      const rawTimeDifferenceMinutes = currentRemaining.remainingDurationMinutes - candidateRemaining.remainingDurationMinutes;
      const netTimeBenefitMinutes = rawTimeDifferenceMinutes - switchingCost.totalPenaltyMinutes;
      const structuralImprovement = {
        fewerTransfers: candidateRemaining.remainingTransfers < currentRemaining.remainingTransfers,
        lessWalking: candidateRemaining.remainingWalkingMinutes < currentRemaining.remainingWalkingMinutes,
      };
      // Sensory/preferencia-alapú kapu KIZÁRÓLAG akkor aktiválódhat, ha
      // valós preferencia-adat áll rendelkezésre — ez a kártya jelenleg nem
      // kapja meg a `weights` state-et (a szülő formban él, lásd fent), így
      // itt SOHA nem fabrikálunk preferencia-előnyt (hasRealPreferenceData
      // mindig false) — ez SZÁNDÉKOSAN dokumentált, kis, biztonságos
      // egyszerűsítés, NEM hiba.
      const gate = evaluateMeaningfulImprovement({
        rawTimeDifferenceMinutes,
        netTimeBenefitMinutes,
        disruptionDriven: trigger.type === "PROVEN_RELEVANT_DISRUPTION",
        structuralImprovement,
        hasRealPreferenceData: false,
        preferenceFavorsStructuralImprovement: false,
      });
      if (!gate.meaningful) return;

      const bullets: string[] = [];
      // SPRINT 8.5 (12. pont) — KIZÁRÓLAG PROVEN_RELEVANT disruption esetén,
      // rövid, NEM nyers alert-szöveg, és NEM egy konkrét, a strukturált
      // adat által igazolatlan ok-feltételezés.
      if (trigger.type === "PROVEN_RELEVANT_DISRUPTION") bullets.push("Fennakadás érinti az útvonaladat.");
      if (rawTimeDifferenceMinutes >= 1) bullets.push(`${Math.round(rawTimeDifferenceMinutes)} perccel gyorsabb`);
      if (structuralImprovement.fewerTransfers) bullets.push("Kevesebb átszállás");
      if (structuralImprovement.lessWalking) bullets.push("Kevesebb gyaloglás");

      setLiveAlternativeOffer((offer) =>
        presentLiveAlternativeOffer(
          offer,
          best,
          { netTimeBenefitMinutes, reason: gate.reason, bullets: bullets.slice(0, 3) },
          sessionGeneration
        )
      );
    } catch {
      setLiveAlternativeOffer((offer) => discardLiveAlternativeSearch(offer, sessionGeneration));
    } finally {
      liveAlternativeGuardRef.current = markLiveAlternativeSearchFinished(liveAlternativeGuardRef.current);
    }
  };

  const handleLiveAlternativeDecline = () => {
    if (liveAlternativeOffer.trigger) {
      liveAlternativeGuardRef.current = markLiveAlternativeEventDeclined(
        liveAlternativeGuardRef.current,
        liveAlternativeOffer.trigger.eventId,
        Date.now()
      );
    }
    setLiveAlternativePreviewOpen(false);
    setLiveAlternativeOffer(declineLiveAlternativeOffer(liveAlternativeOffer));
  };

  // ACCEPT — az EGYETLEN hely, ahol egy Live Alternative candidate
  // displayedJourney-vé válhat. Stale-session ellenőrzés a MEGLÉVŐ
  // rerouteSessionRef generation-je alapján (spec 14. pont: "preferáld a
  // generation checket az agresszív useEffect láncok helyett" — NINCS külön
  // useEffect, csak ez az explicit, egyszeri ellenőrzés a kattintás
  // pillanatában). Explicit TILOS: a navigationMode bekapcsolása/
  // startNavigation() hívása — a navigáció már aktív, csak a journey
  // cserélődik.
  const handleLiveAlternativeAccept = () => {
    const accepted = acceptLiveAlternativeOffer(liveAlternativeOffer);
    if (!accepted) return;
    setLiveAlternativePreviewOpen(false);
    if (liveAlternativeOffer.sessionGeneration !== rerouteSessionRef.current) {
      setLiveAlternativeOffer(createInitialLiveAlternativeOffer());
      return;
    }
    setDisplayedJourney(accepted.acceptedJourney);
    bumpNavigationSession();
    setLiveAlternativeOffer(createInitialLiveAlternativeOffer());
  };

  // PROVEN_RELEVANT_DISRUPTION TRIGGER — SPRINT 8.5 (2026-09-19). UGYANAZ a
  // maybeStartLiveAlternativeSearch() pipeline fut, mint a
  // SIGNIFICANT_REALTIME_DEGRADATION triggernél (nincs második fetch-
  // kódút) — ez a hatás KIZÁRÓLAG a triggert azonosítja a MEGLÉVŐ 8.3
  // engine-en keresztül (buildDisruptionTriggers -> evaluateDisruptionRelevance),
  // a React réteg nem dönt relevanciáról. Render/új serviceAlerts object-
  // reference önmagában NEM okoz ismételt keresést: a buildDisruptionTriggers
  // stabil, alert.id-alapú eventId-t ad, a guard (cooldown/lastEventId/
  // decline-suppression) ugyanúgy dedupol, mint a degradation triggernél.
  useEffect(() => {
    if (!navigationMode || serviceAlerts.length === 0) return;
    const legs = toDisruptionRelevanceLegs(displayedJourney);
    const triggers = buildDisruptionTriggers(serviceAlerts, legs, activeLegIndex ?? null, Date.now());
    if (triggers.length === 0) return;
    // Legfeljebb 1 keresés — a guard (in-flight/cooldown) amúgy is csak
    // egyet engedne át; itt is csak az elsőt, bizonyítottan releváns
    // triggert próbáljuk.
    void maybeStartLiveAlternativeSearch(triggers[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationMode, serviceAlerts, displayedJourney, activeLegIndex]);

  useTransitRealtimeRefresh({
    navigationActive: navigationMode,
    hasRelevantTransitLeg,
    hasRestStopOverride: Boolean(restStopMapState.active && restStopMapState.legsOverride),
    isRerouting: automaticRerouteStatus === "REROUTING",
    context: realtimeRefreshContext,
    sessionId: rerouteSessionRef.current,
    onUpdates: (updates) => {
      // SIGNIFICANT_REALTIME_DEGRADATION TRIGGER — a MEGLÉVŐ ~30s realtime-
      // refresh kimenetéből, ÚJ POLLER NÉLKÜL (lásd liveAlternative.ts 7.
      // pont). A degradation-kiértékelés a MEGLÉVŐ displayedJourney (a jelen
      // render aktuális állapota) és az új updates összevetésével történik,
      // MIELŐTT a merge-updater fut — ez PONTOSAN a MEGLÉVŐ Sprint 7.2
      // hook-mintázat (onUpdatesRef mindig a legfrissebb closure-t hívja),
      // NEM egy második, párhuzamos GPS/realtime state machine.
      const degradation = evaluateRealtimeDegradation(buildRealtimeDegradationSamples(displayedJourney, updates));
      setDisplayedJourney((prev) => mergeRealtimeUpdates(prev, updates));
      if (degradation.degraded && degradation.worstLegTripId) {
        void maybeStartLiveAlternativeSearch({
          type: "SIGNIFICANT_REALTIME_DEGRADATION",
          // Stabil, tripId-hez kötött esemény-identitás — UGYANAZ a romlás
          // (pl. +2 -> +6 -> +7 perc) NEM generál minden pollozási ciklusban
          // új eventId-t, a cooldown/decline-suppression emiatt helyesen
          // véd az ismételt search ellen (lásd liveAlternative.ts 5. pont).
          eventId: `degradation:${degradation.worstLegTripId}`,
        });
      }
    },
  });

  return (
    <div className="card border-2" style={{ borderColor: ranked.labels.length > 0 ? "#93c5fd" : "#e5e7eb" }}>
      <div className="flex flex-wrap items-center gap-2">
        {ranked.labels.map((label) => (
          <span key={label} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LABEL_META[label].className}`}>
            {LABEL_META[label].text}
          </span>
        ))}
        {/* AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11) — journey.accessibilityStatus
            csak stepFreeRequired=true keresésnél van jelen, és a szerver már
            kiszűrte a KNOWN_NOT_ACCESSIBLE eredményeket (lásd orchestrator.ts) —
            ez a badge tehát KIZÁRÓLAG a két megjelenítendő állapotot ("KNOWN_ACCESSIBLE"/
            "PARTIALLY_UNKNOWN") kaphatja meg, sosem a "nem lépcsőmentes" állítást. */}
        {journey.accessibilityStatus && journey.accessibilityStatus !== "KNOWN_NOT_ACCESSIBLE" && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACCESSIBILITY_RESULT_META[journey.accessibilityStatus].className}`}
          >
            {ACCESSIBILITY_RESULT_META[journey.accessibilityStatus].text}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <p className="text-xl font-bold text-sni-text">{formatDurationMinutes(journey.totalDurationMinutes)}</p>
        <p className="text-sm text-gray-500">
          {new Date(journey.departureTime).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}
          {" → "}
          {new Date(journey.arrivalTime).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      <JourneyRealtimeSummary journey={journey} />

      <button type="button" onClick={onToggleMap} className="btn-secondary mt-2 text-xs">
        {isOpen ? "Térkép bezárása" : "Térkép megnyitása"}
      </button>

      <div className="mt-2 space-y-1">
        {journey.legs.map((leg, i) =>
          // MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1 (2026-09-13, spec
          // 4. pont) — SZÁNDÉKOSAN külön, vizuálisan megkülönböztetett
          // kártya-blokk a MOL Bubi lábaknak (nem az alábbi, WALK/TRANSIT
          // bináris egysoros formátumba erőltetve). Raw "RENTAL"/"GBFS"/
          // providerId/propulsionType string SOHA nem jelenik meg — csak a
          // felhasználóbarát "MOL Bubi" címke és a bikePropulsionLabel()
          // szerinti magyar megnevezés.
          leg.mode === "RENTAL" ? (
            <div key={i} className="flex flex-col gap-0.5 rounded border border-pink-200 bg-pink-50 px-2.5 py-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold text-pink-800">
                <span aria-hidden>🚲</span>
                {/* MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1.1 HARDENING
                    (2026-09-13) — a "MOL Bubi" felirat KIZÁRÓLAG akkor
                    jelenik meg, ha leg.rentalProvider ténylegesen "mol-bubi"
                    (vagyis a normalizer ezt a leget egy Bubi-enabled
                    kérés-kontextusból jelölte meg így, lásd orchestrator.ts
                    mapLeg()) — SOHA nem pusztán a leg.mode === "RENTAL"
                    alapján. Egy (Phase 1-ben elméleti) kontextus nélküli
                    RENTAL leg egy semleges, nem-provider-specifikus feliratot
                    kap — de raw "RENTAL"/"GBFS" string ekkor sem jelenik meg. */}
                {leg.rentalProvider === "mol-bubi" ? "MOL Bubi" : "Bérelt kerékpár"}
                {bikePropulsionLabel(leg.rentalPropulsionType) ? ` — ${bikePropulsionLabel(leg.rentalPropulsionType)}` : ""}
              </span>
              <span className="text-gray-700">
                {leg.fromName} – {leg.toName}
              </span>
              <span className="text-gray-500">
                {formatDurationMinutes(leg.durationMinutes)}
                {leg.distanceMeters !== undefined
                  ? ` • ${(leg.distanceMeters / 1000).toLocaleString("hu-HU", { maximumFractionDigits: 1 })} km`
                  : ""}
              </span>
              {/* MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1.1 HARDENING —
                  SZÁNDÉKOSAN NINCS itt semmilyen elérhető-darabszám sor: a
                  MOTIS /api/v6/plan válaszban nincs erre bizonyított
                  adatforrás (lásd motisTypes.ts). Phase 2 feladat egy külön
                  GET /api/v1/rentals adapter bekötése után. */}
              <span className="text-xs text-gray-400">A kerékpárok elérhetősége folyamatosan változhat.</span>
            </div>
          ) : (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              {leg.mode === "WALK" ? (
                <span className="font-medium">Gyaloglás</span>
              ) : (
                <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${transitModeBadge(leg.transitMode).className}`}>
                  <span aria-hidden>{transitModeBadge(leg.transitMode).emoji}</span>
                  {`${transitModeLabel(leg.transitMode)} ${leg.routeShortName ?? leg.routeLongName ?? "Járat"}`.trim()}
                </span>
              )}
              {leg.mode === "TRANSIT" && formatClockTime(leg.departureTime) ? (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
                  indul: {formatClockTime(leg.departureTime)}
                </span>
              ) : null}
              <span className="text-gray-500">
                {leg.mode === "WALK" ? walkEndpointLabel(leg.fromName, journey.legs[i - 1]) : leg.fromName}
                {" → "}
                {leg.mode === "WALK" ? walkEndpointLabel(leg.toName, journey.legs[i + 1]) : leg.toName}
                {" ("}
                {formatDurationMinutes(leg.durationMinutes)}
                {leg.mode === "WALK" && leg.distanceMeters !== undefined ? `, ${leg.distanceMeters} m` : ""}
                {")"}
              </span>
              {leg.mode === "TRANSIT" ? <TransitLegRealtimeNote leg={leg} /> : null}
            </div>
          )
        )}
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {journey.transfers} átszállás · {formatDurationMinutes(journey.walkingMinutes)} gyaloglás
        {journey.walkingDistanceMeters !== undefined ? ` (${journey.walkingDistanceMeters} m)` : ""} · {formatDurationMinutes(journey.waitingMinutes)} várakozás
      </p>

      {sensory && (
        <div className="mt-3 rounded bg-gray-50 p-2 text-xs text-gray-700">
          <p>
            Szenzoros terhelés becslés: <span className="font-semibold">{Math.round(100 - sensory.score)}/100</span>{" "}
            (magasabb = nyugodtabb) · Adatlefedettség:{" "}
            <span className="font-semibold">{Math.round(sensory.confidence * 100)}%</span>
          </p>
          {sensory.missingFactors.length > 0 && (
            <p className="mt-1 text-gray-500">
              Nem elérhető adat, ezért nem számít bele: {sensory.missingFactors.map((f) => FACTOR_LABELS[f] ?? f).join(", ")}.
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-sm text-sni-text">{ranked.explanation}</p>

      {journey.realtimeAvailable ? (
        <p className="mt-1 text-xs font-medium text-green-700">Valós idejű BKK-adatok figyelembevételével</p>
      ) : (
        <p className="mt-1 text-xs italic text-gray-400">Valós idejű adat nem áll rendelkezésre.</p>
      )}

      {/* Part B (2026-09-08) — a térkép és a hozzá tartozó GPS/pihenőpont
          vezérlők KIZÁRÓLAG akkor mountolódnak, amikor EZ a kártya van
          nyitva (isOpen) — a szülő form gondoskodik arról, hogy
          egyszerre csak egy kártya lehessen nyitva (lásd
          VedettUtvonalSearchForm openIndex state-je), így WebGL-kontextus
          és GPS-figyelés is legfeljebb egyszerre egy fut. Bezáráskor ez a
          blokk teljesen eltűnik a DOM-ból (unmount), az itt élő állapot
          (displayedJourney/sessionRestPoints/geo) a kártyával együtt él
          tovább — újranyitáskor ugyanide (a kártya saját, valós
          itineraryjéhez) tér vissza, sosem egy másik kártya vagy egy
          elavult globális állapot. */}
      {isOpen && (
        <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
          {/* Egyetlen megosztott térkép (UX módosítás, 2026-09-09): EZ az
              EGYETLEN <VedettUtvonalMap> instance a kártyához — normál
              navigáció ÉS a "Pihenőre van szükségem" folyamat egyaránt EZT
              a térképet használja, sosem nyílik meg második MapLibre
              instance. A `legs`/`restPoints`/`selectedRestPointId`/
              `onSelectRestPoint`/`restPointFocusMode` props-okat a
              restStopMapState (a RestStopFlowPanel onMapStateChange
              jelentése) és a kártya saját alap-állapota (displayedJourney,
              sessionRestPoints) EGYESÍTVE adja — amikor a pihenőpont-
              folyamat nem aktív (restStopMapState.active === false), ez
              pontosan a Task A előtti, normál navigációs nézetet
              eredményezi (A1). */}
          {/* Explicit Navigation Mode / manuális teljes képernyő (spec 6./7.
              pont) — EZ A KONTÉNER mindig ugyanaz a DOM-elem marad, csak a
              className vált fixed-fullscreen és normál között; a benne élő
              <VedettUtvonalMap> SOHA nem unmountolódik/remountolódik a
              fullscreen be/kikapcsolásakor (spec 13./14. pont — "no remount
              on navigation start/stop"), csak props/className változik.
              Fullscreen alatt `position: fixed; inset: 0` + `100dvh` (a
              dvh a mobil böngészők dinamikus cím/eszközsávjaival is
              helyesen viselkedik, nem csak a statikus vh). */}
          <div
            className={mapFullscreen ? "fixed inset-0 z-50 bg-black" : "relative"}
            style={mapFullscreen ? { height: "100dvh" } : undefined}
          >
            <VedettUtvonalMap
              legs={restStopMapState.active && restStopMapState.legsOverride ? restStopMapState.legsOverride : displayedJourney.legs}
              // METRO GPS LOSS + MAP CAMERA SAFETY SPRINT (2026-09-17) — a
              // térkép SOHA nem kap "aktuálisként" bemutatott pozíciót, ha a
              // gpsFixGate (lásd fent) a jelenlegi fixet NEM usable-nek
              // minősíti (STALE/INVALID, vagy foreground-reacquisition alatti
              // visszatérés-előtti fix). Ez tartja a kamerát/markert a
              // legutóbbi stabil állapotban ahelyett, hogy egy elavult/
              // bizonytalan fixet mutatnánk aktuálisként, vagy azzal
              // mozgatnánk a kamerát (lásd VedettUtvonalMap.tsx follow-
              // effektjének/marker-effektjének korai return-jét null pozícióra).
              currentPosition={gpsFixUsable ? currentPosition : null}
              restPoints={mergeRestPointMarkers(
                sessionRestPoints.map((rp) => ({ id: rp.id, name: rp.name, latitude: rp.latitude, longitude: rp.longitude })),
                restStopMapState.active ? restStopMapState.restPoints : []
              )}
              selectedRestPointId={restStopMapState.active ? restStopMapState.selectedRestPointId : null}
              onSelectRestPoint={restStopMapState.active ? restStopMapState.onSelectRestPoint : undefined}
              restPointFocusMode={restStopMapState.active && restStopMapState.focusOnRestPoints}
              className={mapFullscreen ? "h-full w-full" : "h-[300px] w-full rounded border border-gray-200 sm:h-[360px] md:h-[450px]"}
              followMode={followMode}
              navigationZoom={16}
              onUserGestureCancelFollow={() => setFollowMode(false)}
            />

            {navigationMode && navigationEta && (
              <div className="absolute bottom-3 left-3 z-10 w-[42vw] max-w-[180px] rounded-xl bg-white/95 px-3 py-2 text-center shadow-lg backdrop-blur md:bottom-4 md:left-1/2 md:w-auto md:min-w-[180px] md:-translate-x-1/2 md:px-4">
                {navigationRemainingDistance !== null && navigationRemainingMinutes !== null && (
                  <div className="mb-0.5 text-sm font-semibold tabular-nums text-sni-text">
                    {(navigationRemainingDistance / 1000).toLocaleString("hu-HU", { maximumFractionDigits: 1 })} km · {navigationRemainingMinutes} perc
                  </div>
                )}
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Várható érkezés</div>
                <div className="text-2xl font-bold tabular-nums text-sni-text">{navigationEta}</div>
                <div className="text-[10px] text-gray-500">GPS-alapú útvonalhaladás becslése</div>
              </div>
            )}

            {navigationMode && routeProgress.offRouteStatus === "OFF_ROUTE" && (
              <div
                role="status"
                aria-live="polite"
                className="pointer-events-none absolute left-1/2 top-[4.25rem] z-20 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50/95 px-4 py-3 text-center shadow-lg backdrop-blur"
              >
                <div className="text-sm font-bold text-amber-950">
                  {automaticRerouteStatus === "REROUTING" ? "Újratervezem az útvonalat…" : "Letértél az útvonalról."}
                </div>
                <div className="mt-0.5 text-xs leading-snug text-amber-900">
                  {automaticRerouteStatus === "REROUTING"
                    ? "Az aktuális helyzetedből új útvonalat keresek a célodhoz."
                    : automaticRerouteStatus === "FAILED"
                      ? automaticRerouteMessage ?? "Az automatikus újratervezés most nem sikerült."
                      : "Az aktuális helyzeted alapján már nem az útvonalon haladsz."}
                </div>
              </div>
            )}

            {/* LIVE ALTERNATIVE — SPRINT 8.4B (2026-09-18). KIZÁRÓLAG OFFERED
                állapotban jelenik meg, nyugodt, nem-modális, nem villogó
                kártya — valódi <button> elemek, nincs auto-fókusz. Az
                OFF_ROUTE bannerrel gyakorlatilag sosem jelenik meg egyszerre
                (a guard explicit blokkolja a keresést OFF_ROUTE alatt), de a
                pozíció szándékosan ugyanaz a "nem takarja az ETA-kártyát/
                gombsort" sáv. */}
            {navigationMode && liveAlternativeOffer.status === "OFFERED" && !liveAlternativePreviewOpen && (
              <div
                role="status"
                aria-live="polite"
                className="absolute left-1/2 top-[4.25rem] z-20 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 rounded-xl border border-sky-300 bg-sky-50/95 px-4 py-3 shadow-lg backdrop-blur"
              >
                <div className="text-sm font-bold text-sky-950">Találtunk egy kedvezőbb lehetőséget.</div>
                {liveAlternativeOffer.comparisonSummary && liveAlternativeOffer.comparisonSummary.bullets.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs leading-snug text-sky-900">
                    {liveAlternativeOffer.comparisonSummary.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
                    onClick={() => setLiveAlternativePreviewOpen(true)}
                  >
                    Megnézem
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900"
                    onClick={handleLiveAlternativeDecline}
                  >
                    Maradok ezen
                  </button>
                </div>
              </div>
            )}

            {navigationMode && liveAlternativeOffer.status === "OFFERED" && liveAlternativePreviewOpen && liveAlternativeOffer.candidateJourney && (
              <div
                role="status"
                aria-live="polite"
                className="absolute left-1/2 top-[4.25rem] z-20 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 rounded-xl border border-sky-300 bg-white/95 px-4 py-3 shadow-lg backdrop-blur"
              >
                <div className="text-sm font-bold text-sky-950">Alternatív útvonal előnézete</div>
                <div className="mt-1 text-xs leading-snug text-sky-900">
                  {Math.round(liveAlternativeOffer.candidateJourney.totalDurationMinutes)} perc ·{" "}
                  {liveAlternativeOffer.candidateJourney.transfers} átszállás ·{" "}
                  {Math.round(liveAlternativeOffer.candidateJourney.walkingMinutes)} perc gyaloglás
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
                    onClick={handleLiveAlternativeAccept}
                  >
                    Ezt választom
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900"
                    onClick={handleLiveAlternativeDecline}
                  >
                    Maradok az eredetin
                  </button>
                </div>
              </div>
            )}

            {/* NAVIGATION INSTRUCTIONS SPRINT 1 (2026-09-16) — egy fő teendő
                domináns megjelenítése: az aktuális instrukció nagy/félkövér,
                a "Következő" kisebb/másodlagos (5. pont, autizmusbarát UX:
                rövid, konkrét, nem sürgető szöveg — lásd
                lib/vedett-route/navigation/instructions.ts). CSAK
                navigationMode alatt és csak akkor jelenik meg, ha van
                értelmes aktuális instrukció (navigationInstructionForDisplay
                — rest-stop legsOverride alatt szándékosan null, lásd a
                fenti komment). A top offset OFF_ROUTE alatt lejjebb csúszik,
                hogy NE takarja a fenti off-route/rerouting figyelmeztetést;
                az ETA-kártyát (bottom) és a felső navigációs gombsort (z-10,
                top-2) sem fedi. */}
            {/* SPRINT 7.1, Section I — MAP CONTROL OVERLAP JAVÍTÁS. Root cause
                (lásd a sprint audit-riportját): a korábbi `right-2` (8px) a
                VedettUtvonalMap.tsx-ben `map.addControl(..., "top-right")`-tal
                elhelyezett MapLibre NavigationControl + CurrentLocationControl
                gombokkal ütközött (azok saját, MapLibre-alapértelmezett CSS-e
                is a jobb-felső sarokban ül). A javítás egy FIX, a MapLibre
                kontroll-oszlop ISMERT szélességéhez (nem egy konkrét
                telefonhoz!) méretezett jobb margót foglal (`right-14` =
                3.5rem), plusz a safe-area insetet — a kontrollok továbbra is
                láthatók/kattinthatók maradnak, csak a kártya nem fedi őket.
                Deskop nézetben a `mx-auto max-w-sm` miatt ez érdemi vizuális
                változást nem okoz. */}
            {navigationMode && navigationInstructionForDisplay && (
              <div
                role="status"
                aria-live="polite"
                className={`absolute right-14 z-20 mx-auto max-w-sm rounded-xl bg-white/95 px-4 py-3 text-center shadow-lg backdrop-blur ${
                  routeProgress.offRouteStatus === "OFF_ROUTE" ? "top-[11rem]" : "top-14"
                }`}
                style={{
                  left: "calc(0.5rem + env(safe-area-inset-left, 0px))",
                  right: "calc(3.5rem + env(safe-area-inset-right, 0px))",
                }}
              >
                <div className="text-base font-bold text-sni-text">{navigationInstructionForDisplay.title}</div>
                {navigationInstructionForDisplay.detail && (
                  <div className="mt-0.5 text-sm text-gray-600">{navigationInstructionForDisplay.detail}</div>
                )}
                {/* SPRINT 7.1, Section G/H — CURRENT VEHICLE ARRIVAL. Csak
                    akkor jelenik meg, ha van megbízható érkezési idő az
                    aktív TRANSIT leghez (lásd transferTiming.ts) — kompakt,
                    egysoros, a preview/realtime-sor stílusát követi. */}
                {activeTransferTiming.currentArrival && (
                  <div className="mt-1 text-xs text-gray-500">
                    Érkezés: {formatClockTime(activeTransferTiming.currentArrival.timeIso)}
                    {activeTransferTiming.currentArrival.isRealtime ? "" : " (menetrend szerint)"}
                  </div>
                )}
                {/* NAVIGATION — NEXT-INSTRUCTION PREVIEW (Sprint 6, 2026-09-16) —
                    a korábbi, puszta "Következő" + nyers next.title helyett
                    (ami WALK legen belül SOHA nem tudta a következő kanyart
                    megmutatni, és BOARD->RIDE-szerű triviális párokat is
                    kiírt) egy rövid, egysoros "Utána: ..." szöveg — lásd
                    lib/vedett-route/navigation/instructionPreview.ts. Nincs
                    új panel, nincs badge/ikon, nincs duplikált méter/ETA. */}
                {activeInstructionPreview && (
                  <div className="mt-2 border-t border-gray-200 pt-1.5 text-xs text-gray-500">
                    Utána: {activeInstructionPreview.phrase}
                  </div>
                )}
                {/* NAVIGATION — ACTIVE-LEG REALTIME INFO (Sprint 7, 2026-09-16) —
                    a MÁR MEGLÉVŐ leg.realtime/delayMinutes/cancelled mezők
                    rövid, nyugodt megjelenítése, a preview alatt, annál is
                    kisebb hangsúllyal. Nincs új panel/modal/toast, nincs
                    villogás, nincs duplikált ETA/méter. CANCELLED esetén a
                    meglévő JourneyRealtimeSummary/TransitLegRealtimeNote
                    piros jelölését követi (tényszerű, nem dramatizáló). */}
                {/* SPRINT 7.1, Section G/H — NEXT VEHICLE DEPARTURE. A
                    kompakt hierarchia (1. current action, 2. current
                    arrival, 3. next action a preview-sorban, 4. next
                    departure itt, 5. realtime/cancelled lent) betartva —
                    NEM duplikálja a "Utána: ..." preview-t, csak az
                    indulási időt adja hozzá, HA van megbízható adat. */}
                {activeTransferTiming.nextDeparture && (
                  <div className="mt-1 text-xs text-gray-500">
                    {activeTransferTiming.nextDeparture.cancelled ? (
                      <span className="font-medium text-red-600">
                        {activeTransferTiming.nextDeparture.routeLabel ?? "A következő járat"} törölve / kihagyva
                      </span>
                    ) : (
                      <>
                        {activeTransferTiming.nextDeparture.routeLabel ? `${activeTransferTiming.nextDeparture.routeLabel} — ` : ""}
                        indulás: {formatClockTime(activeTransferTiming.nextDeparture.timeIso as string)}
                        {activeTransferTiming.nextDeparture.isRealtime ? "" : " (menetrend szerint)"}
                      </>
                    )}
                  </div>
                )}
                {activeRealtimeInfo && (
                  <div
                    className={`mt-1 text-xs ${activeRealtimeInfo.kind === "CANCELLED" ? "font-medium text-red-600" : "text-gray-500"}`}
                  >
                    {activeRealtimeInfo.phrase}
                  </div>
                )}
              </div>
            )}

            {mapFullscreen && (
              <div className="absolute left-2 right-2 top-2 z-10 flex flex-wrap items-center gap-2">
                {navigationMode ? (
                  <button type="button" onClick={stopNavigation} className="btn-secondary bg-white text-xs shadow">
                    ✕ Navigáció befejezése
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => setManualFullscreen(false)} className="btn-secondary bg-white text-xs shadow">
                      ✕ Kis nézet
                    </button>
                    <button type="button" onClick={startNavigation} className="btn-primary text-xs shadow">
                      ▶ Navigáció indítása
                    </button>
                  </>
                )}
                {navigationMode && geo.status === "requesting" && (
                  <span className="rounded bg-white/90 px-2 py-1 text-xs text-gray-700 shadow">Helyzet meghatározása…</span>
                )}
                {navigationMode && geo.status === "denied" && (
                  <span className="rounded bg-white/90 px-2 py-1 text-xs text-amber-700 shadow">
                    A navigációhoz engedélyezd a helymeghatározást a böngésződben.
                  </span>
                )}
                {navigationMode && (geo.status === "unavailable" || geo.status === "timeout") && (
                  <span className="rounded bg-white/90 px-2 py-1 text-xs text-amber-700 shadow">
                    A jelenlegi hely most nem érhető el.
                  </span>
                )}
                {navigationMode && !followMode && (
                  <button type="button" onClick={() => setFollowMode(true)} className="btn-primary text-xs shadow">
                    📍 Kövesd a helyzetem
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!navigationMode && (
              <>
                <button type="button" onClick={geo.startWatching} className="btn-secondary text-xs" disabled={geo.isWatching}>
                  {geo.isWatching ? "Aktuális hely követése be van kapcsolva" : "Aktuális hely megjelenítése"}
                </button>
                {geo.isWatching && (
                  <button type="button" onClick={geo.stopWatching} className="text-xs text-gray-500 underline">
                    Követés leállítása
                  </button>
                )}
                <button type="button" onClick={startNavigation} className="btn-primary text-xs">
                  ▶ Navigáció indítása
                </button>
                {!manualFullscreen && (
                  <button type="button" onClick={() => setManualFullscreen(true)} className="btn-secondary text-xs">
                    ⛶ Teljes képernyő
                  </button>
                )}
              </>
            )}
            {!navigationMode && geo.status === "denied" && <span className="text-xs text-amber-700">GPS engedély elutasítva.</span>}
            {!navigationMode && (geo.status === "unavailable" || geo.status === "timeout") && (
              <span className="text-xs text-amber-700">A jelenlegi hely most nem elérhető — az útvonaltervezés ettől függetlenül működik.</span>
            )}
          </div>

          {/* Fullscreen pihenőpont integráció (2026-09-10, spec 1-6./24-27.
              pont) — KORÁBBAN ez a két blokk (RestPointQuickAdd,
              RestStopFlowPanel) a fullscreen térkép MÖGÖTT rendereleődött:
              a fullscreen map wrapper (fenn) `position: fixed; inset: 0;
              z-50`, ez a két blokk pedig utána, a normál dokumentum-
              folyamban következett — fullscreen (navigationMode VAGY
              manualFullscreen) alatt emiatt A FELHASZNÁLÓ SOSEM ÉRTE EL
              ŐKET a fullscreen map alól kilépés nélkül. Ez a wrapper <div>
              ezt oldja meg: fullscreen alatt `position: fixed`, a
              képernyő aljára rögzítve, magasabb z-indexszel, mint a
              fullscreen map (z-[60] > z-50) — VIZUÁLISAN a térkép fölé
              kerül, de a REACT FA-POZÍCIÓJA nem változik (a wrapper MINDIG
              itt, ugyanebben a pozícióban van, csak a className vált) —
              ezért a benne élő <RestPointQuickAdd>/<RestStopFlowPanel>
              SOHA nem remountol a fullscreen be/kikapcsolásakor, pontosan
              úgy, mint a fenti <VedettUtvonalMap> instance. Egy folyamatban
              lévő "Pihenőre van szükségem" flow (RestStopFlowPanel saját
              állapotgépe) így egy fullscreen-váltás közben sem vész el.
              A KÉT KOMPONENS MAGA NEM DUPLIKÁLÓDIK — egyetlen JSX-elem van
              mindkettőből, nincs második, párhuzamos flow/state machine.

              PIHENŐPONT PANEL BEZÁRÁSA (2026-09-11) — a production fizikai
              teszt (Kelenföld) kimutatta, hogy fullscreen navigáció alatt
              ennek a sheetnek KORÁBBAN nem volt semmilyen bezárási
              lehetősége: mindig látható volt, kitakarva a teljes képernyős
              navigációt, és a felhasználó nem tudott "visszatérni" hozzá. A
              javítás: fullscreen alatt egy sticky fejléc jelenik meg
              ("Pihenőpont hozzáadása" cím + "✕ Bezárás", legalább 44x44 px,
              aria-label="Pihenőpontok bezárása"), ami a `restPanelVisible`
              UI-state-et false-ra állítja. A tartalom (RestPointQuickAdd +
              RestStopFlowPanel) EKKOR IS a DOM-ban marad (a külső wrapper
              className vált "hidden"-re, a belső komponensek SOHA nem
              unmountolnak) — pontosan ugyanaz az elv, mint a fenti
              fullscreen map wrapper esetében, hogy egy folyamatban lévő
              "Pihenőre van szükségem" flow (state machine + esetleges async
              /nearby vagy /route-to-rest-point kérés) a panel bezárása után
              is zavartalanul folytatódjon a háttérben — a bezárás SOSEM
              hívja a stateMachine.ts semelyik eseményét (nincs
              CANCEL_REST_STOP, nincs RESET_TO_ROUTE_ACTIVE), SOSEM érinti a
              navigationMode/followMode/GPS-watch/journey állapotot, és egy
              async válasz megérkezése SEM nyitja vissza automatikusan a
              sheetet (a `restPanelVisible` state ettől függetlenül,
              KIZÁRÓLAG a felhasználó explicit kattintására vált). Bezárt
              állapotban egy kompakt, ugyanígy legalább 44x44 px-es
              "Pihenőpont hozzáadása" gomb marad elérhető (lásd lent), amivel
              bármikor újranyitható — ez NEM indít új keresést/eseményt, csak
              visszaállítja a láthatóságot.

              UX-frissítés (2026-09-11, második kör): a `restPanelVisible`
              alapértéke — és a startNavigation() reset-je — false-ra
              változott. Minden friss navigáció-indítás ZÁRT panellel
              indul: a teljes képernyős térkép az elsődleges nézet, a
              kompakt "Pihenőpont hozzáadása" gomb rögtön elérhető, és a
              felhasználó explicit kattintására nyílik meg a panel. A
              zárás/nyitás/GPS/journey-érintetlenség szabályai fentebb
              változatlanok. */}
          <div
            className={
              mapFullscreen
                ? restPanelVisible
                  ? "fixed inset-x-0 bottom-0 z-[60] flex max-h-[45dvh] flex-col rounded-t-2xl border-t border-gray-200 bg-white shadow-2xl"
                  : "hidden"
                : "space-y-3"
            }
          >
            {mapFullscreen && (
              <div className="sticky top-0 z-10 flex flex-shrink-0 items-center justify-between rounded-t-2xl border-b border-gray-100 bg-white px-3 py-1">
                <span className="text-sm font-semibold text-sni-text">
                  {restPanelMode === "SEARCH" ? "Közeli pihenőhelyek" : "Pihenőpont hozzáadása"}
                </span>
                <button
                  type="button"
                  onClick={handleCloseRestPanel}
                  aria-label="Pihenőpontok bezárása"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-lg text-gray-600"
                >
                  ✕
                </button>
              </div>
            )}
            <div
              className={mapFullscreen ? "space-y-3 overflow-y-auto px-3 pt-3" : "space-y-3"}
              style={mapFullscreen ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" } : undefined}
            >
              {/* UX HOTFIX (2026-09-13, ötödik kör) — "Rest Search és Rest
                  Point Add mód teljes szétválasztása". A RestPointQuickAdd
                  trigger/UI KIZÁRÓLAG restPanelMode === "ADD" esetén
                  rendereződik — SEARCH módban (külső "Pihenőre van
                  szükségem") a teljes session alatt, a keresés MINDEN
                  fázisában (loading/results/kiválasztás/stb.) egyáltalán
                  nem jelenik meg, nem csak egy rövid, köztes ablakban (ez
                  a negyedik kör `restRequestPending` megoldásának
                  hiányossága volt). A komponens MAGA nem unmountol
                  ismételten mode-váltáskor sem a saját belső logikáját nem
                  módosítottuk — csak a szülő dönt arról, hogy a JSX-fába
                  egyáltalán belekerüljön-e. */}
              {restPanelMode === "ADD" && (
                <RestPointQuickAdd onCreated={(rp) => setSessionRestPoints((points) => [...points, rp])} />
              )}

              {/* Sprint E — "Pihenőre van szükségem": az eredeti célt a
                MEGJELENÍTETT (nem feltétlenül az eredeti) itinerary utolsó
                lábának valós MOTIS koordinátáiból származtatjuk — ha a
                felhasználó már folytatta az utat egy pihenő után, a
                displayedJourney már a friss, resume utáni itinerary, és
                ÍGY egy újabb "Pihenőre van szükségem" is a helyes,
                aktuális célra vonatkozik. Ha ez a koordináta hiányzik, a
                panel nem jelenik meg (lásd ORIGINAL_DESTINATION_MISSING,
                Sprint E spec 9. pont).
                A trackedPosition forrása VÁLTOZATLAN: a `geo` prop UGYANAZ
                a shared useGeolocation()-instance, amit navigationMode
                indításakor a startNavigation() már elindított
                (geo.startWatching()) — a panel saját belső effektje
                (lásd RestStopFlowPanel.tsx REST_REQUESTED ága) csak akkor
                hívna geo.requestOnce()-t, ha geo.status === "idle", ami
                aktív navigáció alatt SOSEM igaz (már "granted"/"requesting"
                státuszban van) — tehát a "Pihenőre van szükségem" gomb
                explicit megnyomása SOSEM indít MÁSODIK watchPosition-t,
                a legfrissebb, memóriában élő GPS-pozíciót használja. */}
              <RestStopFlowPanel
                originalDestination={originalDestination}
                originalDepartAt={displayedJourney.departureTime}
                geo={geo}
                onRouteResumed={(nextJourney) => {
                  // Sprint 7.2, 8. pont — a rest-stop resume is ÚJ Journey-t
                  // hoz be, ezért ez is új realtime-refresh sessiont kell
                  // nyitnia (ugyanaz a rerouteSessionRef, amit az automatikus
                  // reroute effekt is használ a staleness-guardhoz).
                  bumpNavigationSession();
                  setDisplayedJourney(nextJourney);
                }}
                onMapStateChange={setRestStopMapState}
                externalRequestRestToken={restRequestToken}
                mode={restPanelMode}
              />
            </div>
          </div>

          {/* Bezárt pihenőpont-panel újranyitása (2026-09-11, majd desktop UX
              korrekció 2026-09-13) — csak fullscreen alatt, amíg
              restPanelVisible === false, jelenik meg. Jobb alsó sarok, a
              biztonsági (safe-area) sáv figyelembevételével, hogy
              notch/browser chrome alá sose kerüljön.

              MOBIL + PWA KIBŐVÍTÉS (2026-09-13, második kör) — a korábbi
              kör a "Pihenőre van szükségem" desktop CTA-t `hidden md:flex`-
              fel < md alatt elrejtette, így mobilon/telepített PWA-ban
              továbbra is csak a "Pihenőpont hozzáadása" volt elérhető (a
              másik funkciót csak a panel megnyitása UTÁN, a RestStopFlowPanel
              saját belső gombjával lehetett elérni — pontosan az az extra
              lépés, amit a desktop-kör megszüntetett, de mobilon addig
              megmaradt). A `hidden`/`md:flex` ELTÁVOLÍTVA: EGYETLEN, közös
              JSX-blokk (nincs külön duplikált mobil/desktop <button> pár)
              MINDEN viewporton megjeleníti mindkét gombot, KIZÁRÓLAG a
              wrapper flex-irányát váltja md-nél (`flex-col` mobilon —
              egymás alatt, a felhasználó explicit "egymás fölött" kérése
              szerint —, `md:flex-row` desktopon — egymás mellett,
              VÁLTOZATLANUL). Egyik gomb sem függ a másiktól egyik
              viewporton sem: mindkettő önállóan, közvetlenül elérhető és
              önállóan hívja a saját (MEGLÉVŐ) handlerét.

              VIZUÁLIS PRIORITÁS — "Pihenőre van szükségem" az elsődleges
              action. KONTRASZT-HOTFIX (2026-09-13, harmadik kör): az
              EREDETI .btn-primary színpár (bg-sni-brand-teal + fehér
              szöveg) auditálva ~1.8:1 kontrasztarányt ad normál méretű
              gombszövegre — ez NEM felel meg a WCAG AA 4.5:1 minimumnak.
              A javítás bg-sni-brand-navy (#123A5C, sötét navy) + fehér
              szöveget használ — ez jóval sötétebb, mint a teal, a fehér
              szöveggel messze a 4.5:1 fölötti kontrasztot ad. Hover/focus
              állapot a projekt meglévő, valós tokenjeire épül
              (hover:bg-sni-brand-blue, focus-visible:ring-sni-brand-teal —
              ugyanaz a minta, mint a .btn-primary/.btn-secondary
              osztályokban, lásd app/globals.css). "Pihenőpont hozzáadása"
              a másodlagos action, VÁLTOZATLAN (fehér háttér + sni-brand-
              teal szegély + sni-brand-blue szöveg, a .btn-secondary
              színpárja). MINDKÉT szín valós, a tailwind.config.ts-ben
              ténylegesen definiált token (sni.brand.navy/teal/blue) — NEM
              használ "sni-primary"-t (az soha nem létezett token volt).

              PWA/FULLSCREEN + SAFE-AREA — a wrapper továbbra is
              `position: fixed`, a fullscreen map (z-50) FÖLÖTT (z-[60]),
              az ALSÓ pozíciója a MÁR MEGLÉVŐ `env(safe-area-inset-bottom,
              0px)` mintát használja (ugyanaz, mint a "Bezárás" utáni
              content-padding és a bottom sheet — lásd feljebb —, nincs
              párhuzamos safe-area rendszer bevezetve). Ez a minta
              standalone (telepített) PWA módban IS működik: a
              `env(safe-area-inset-bottom)` a PWA manifest
              display:"standalone" módjában is érvényes CSS env()
              változó, nem böngésző-specifikus API. A `100dvh` a fullscreen
              map wrapper-én (feljebb, `style={mapFullscreen ? { height:
              "100dvh" } : undefined}`) SZINTÉN változatlan — ez a blokk
              csak a rá épülő overlay-t bővíti.

              MÉRET/OLVASHATÓSÁG — mindkét gomb legalább 44px magas
              (min-h-[44px]), teljes felirattal (nincs csak-ikon gomb),
              elég vízszintes paddinggel (px-4) ahhoz, hogy keskeny (~360px)
              mobil viewporton se törjön/lógjon ki — a `right-3`
              jobbra-igazítás (`items-end` mobilon) a leghosszabb feliratú
              gomb szélességéhez igazodik, sosem feszíti túl a viewport
              szélességét. */}
          {mapFullscreen && !restPanelVisible && (
            <div
              className="fixed right-3 z-[60] flex flex-col items-end gap-2 md:flex-row md:items-center"
              style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
            >
              <button
                type="button"
                onClick={handleRequestRestCta}
                aria-label="Pihenőpontok keresése a közelemben"
                className="flex min-h-[44px] items-center rounded-full bg-sni-brand-navy px-4 text-sm font-semibold text-white shadow-2xl transition-colors duration-200 hover:bg-sni-brand-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal focus-visible:ring-offset-2"
              >
                Pihenőre van szükségem
              </button>
              <button
                type="button"
                onClick={handleAddRestPointCta}
                aria-label="Pihenőpont hozzáadása"
                className="flex min-h-[44px] items-center rounded-full border-2 border-sni-brand-teal bg-white px-4 text-sm font-semibold text-sni-brand-blue shadow-2xl"
              >
                Pihenőpont hozzáadása
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// „Aktuális helyzetem" mint indulási pont (UX módosítás, 2026-09-09), B5.
// pont — a hiba-szövegek a felhasználó által megadott PONTOS magyar
// szöveggel (nem a useGeolocation.ts saját, általánosabb hibaüzeneteivel,
// amik más helyeken — pl. RestStopFlowPanel ERROR_COPY — más
// megfogalmazást használnak; itt a specifikáció szó szerinti szövegét
// használjuk). SOSEM jelenít meg nyers technikai kivételt.
const ORIGIN_GEOLOCATION_ERROR_COPY: Record<string, string> = {
  denied: "A helyzeted használatához engedélyezd a helymeghatározást.",
  unavailable: "Az aktuális helyzeted most nem érhető el.",
  timeout: "Nem sikerült időben meghatározni a helyzeted. Próbáld újra.",
  error: "Az aktuális helyzeted most nem érhető el.",
};

const WEIGHT_FIELDS: { key: keyof PersonalizationWeights; label: string }[] = [
  { key: "transfers", label: "Átszállások zavarnak" },
  { key: "modeSwitches", label: "Közlekedési mód váltása zavar" },
  { key: "underground", label: "Földalatti (metró) szakasz zavar" },
  { key: "walking", label: "Sok gyaloglás zavar" },
  { key: "duration", label: "Hosszú utazási idő zavar" },
  { key: "waiting", label: "Várakozás zavar" },
];

// Szenzoros prioritás UX (8-11. pont) — a felhasználó SOSEM lát nyers 0/1/2
// technikai értéket, és SOSEM lát "súly"/"weight"/"score"/"multiplier"
// szavakat; a Sensory Engine/ranking felé küldött ÉRTÉK (weights[key])
// azonban PONTOSAN ugyanaz a 0/1/2 marad, mint korábban — csakis a
// MEGJELENÍTÉS (emoji + magyar szöveg) változik, calculateSensoryScore/
// ranking/weight-interpretáció NEM módosul. A slider lépésköze a korábbi
// folytonos (0.25) helyett 1-re szűkült, hogy a belső érték MINDIG pontosan
// a három megengedett állapot (0/1/2) egyike legyen, sosem egy köztes,
// emberi nyelven nem értelmezhető törtérték.
const SENSORY_PRIORITY_LEVELS: { value: 0 | 1 | 2; emoji: string; label: string }[] = [
  { value: 0, emoji: "🙅", label: "Nem fontos" },
  { value: 1, emoji: "🙂", label: "Fontos" },
  { value: 2, emoji: "⭐", label: "Nagyon fontos" },
];

// aria-valuetext (10. pont) — screen reader SOSEM a nyers 0/1/2 számot
// mondja be, hanem ezt az emberi megfogalmazást.
function sensoryPriorityLabel(value: number): string {
  return SENSORY_PRIORITY_LEVELS.find((level) => level.value === value)?.label ?? SENSORY_PRIORITY_LEVELS[1].label;
}

// Android PWA slider scroll-jump — FIZIKAILAG BIZONYÍTOTT root cause
// célzott javítása (2026-09-10, mobil UX sprint folytatása, fizikai
// telepített Android PWA teszt alapján). A korábban azonosított label-
// layout-shift (flex justify-between -> grid grid-cols-3) VALÓS hardening
// volt, de a fizikai reprodukció bebizonyította: a tényleges root cause
// az, hogy a felhasználó a "Utca, házszám" (vagy bármely más strukturált
// cím-) mezőben hagyja a kurzort/fókuszt, legörget, majd megérinti a
// sensory slider-t — Android Chromium (telepített, standalone PWA-ban) a
// viewporton kívülre görgetett, FÓKUSZBAN maradt text inputot "focus
// anchor"-ként kezeli, és a slider pointer-interakciója UTÁN
// visszagörgeti a viewportot pontosan ahhoz a mezőhöz. Ez egy BÖNGÉSZŐ-
// szintű, fókusz-vezérelt scroll-anchoring viselkedés, amit KIZÁRÓLAG a
// fókusz FORRÁSÁNÁL (a régi text input explicit blur-ölésével) javítunk —
// NEM utólagos scroll-kompenzációval (window.scrollTo, scrollIntoView,
// scrollTop-manipuláció, setTimeout-os visszagörgetés vagy globális
// "blur minden scrollkor"/body overflow-anchor-kikapcsolás nincs itt).
//
// KIZÁRÓLAG akkor fut, amikor a felhasználó ténylegesen POINTER/TAP
// interakcióval elkezdi használni a sensory range slidert (onPointerDown-
// Capture a range inputon) — NEM minden slider onChange-nél, NEM minden
// rendernél, NEM egy useEffect-alapú automatikus blur-rel. Ha a fókuszban
// lévő elem maga a range input (pl. Tab-bal ért oda billentyűzettel),
// nem történik semmi — a billentyűzetes használat és a nyíl-billentyűs
// vezérlés változatlan marad.
function releasePreviousTextInputFocus(target: EventTarget | null): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (active === target) return;

  const isTextLikeControl =
    active instanceof HTMLInputElement
      ? active.type !== "range" &&
        active.type !== "checkbox" &&
        active.type !== "radio" &&
        active.type !== "button" &&
        active.type !== "submit"
      : active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        active.isContentEditable;

  if (isTextLikeControl) {
    active.blur();
  }
}

export default function VedettUtvonalSearchForm({
  disabled,
  initialDestination = null,
  initialFavoritePreset = null,
}: {
  disabled: boolean;
  // Védett Hely "Navigálj oda" -> Védett Útvonal integráció (2026-09-09).
  // Az /vedett-utvonal oldal (app/vedett-utvonal/page.tsx) adja át, MÁR
  // validáltan (lásd routeDestinationDeepLinkSchema) — ez a komponens
  // nem végez saját validációt a bemeneten, csak megbízik a hívóban
  // (ugyanaz a minta, mint a `disabled` prop esetén).
  initialDestination?: { name: string; latitude: number; longitude: number } | null;
  // Kedvenc útvonalak integráció (2026-09-09) — a VedettUtvonalWorkspace
  // adja át, amikor a felhasználó egy kedvenc útvonal "Útvonal
  // megtervezése" gombjára kattint (lásd FavoriteRoutesPanel.tsx). EZ a
  // komponens EBBŐL a presetből seedeli az origin/destination/weights
  // KEZDŐÁLLAPOTÁT — a preset SOHA nem tartalmaz konkrét journey-t, csak
  // a "route preset" adatait, ezért egy friss mount mindig friss keresést
  // igényel (nincs elavult journey visszatöltve). CURRENT_LOCATION induló
  // mód esetén a presetben SOHA nincs koordináta (lásd a migráció GPS
  // PRIVACY megjegyzését) — az origin state ilyenkor MANUAL/üres marad, és
  // a `pendingFavoriteOriginLabel` state jelzi a "Aktuális helyzetem →
  // [cél]" szándékot, amíg a felhasználó explicit nem kattint az "Aktuális
  // helyzetem" gombra (SOSEM automatikus GPS-kérés csak a preset betöltése
  // miatt).
  initialFavoritePreset?: {
    originMode: "MANUAL" | "CURRENT_LOCATION";
    originManual: { city: string; districtOrPostalCode: string; street: string } | null;
    destinationMode: "MANUAL" | "KNOWN_PLACE";
    destinationManual: { city: string; districtOrPostalCode: string; street: string } | null;
    destinationKnownPlace: { name: string; latitude: number; longitude: number; placeId: string | null } | null;
    weights: PersonalizationWeights;
  } | null;
}) {
  // „Aktuális helyzetem" mint indulási pont (UX módosítás, 2026-09-09) —
  // TASK B. A `from` szabadszöveges mező helyett/mellett egy explicit,
  // két módot (MANUAL / CURRENT_LOCATION) megkülönböztető RouteOrigin
  // state — lásd a fájl elején lévő típusdefiníciót és indoklást.
  const [origin, setOrigin] = useState<RouteOrigin>(
    initialFavoritePreset && initialFavoritePreset.originMode === "MANUAL" && initialFavoritePreset.originManual
      ? {
          type: "MANUAL",
          city: initialFavoritePreset.originManual.city,
          districtOrPostalCode: initialFavoritePreset.originManual.districtOrPostalCode,
          street: initialFavoritePreset.originManual.street,
        }
      : { type: "MANUAL", city: "Budapest", districtOrPostalCode: "", street: "" }
  );
  // Kedvenc útvonalak integráció — CURRENT_LOCATION preset esetén (lásd
  // fenti prop-magyarázat) ez a state mutatja a "Aktuális helyzetem →
  // [cél]" szándékot, amíg a felhasználó explicit nem kéri le a
  // pozícióját. NEM az origin state része — az origin ilyenkor
  // szándékosan MANUAL/üres marad (nincs koordináta a presetben).
  const [pendingFavoriteOriginLabel, setPendingFavoriteOriginLabel] = useState<string | null>(
    initialFavoritePreset && initialFavoritePreset.originMode === "CURRENT_LOCATION" ? "Aktuális helyzetem" : null
  );
  // Védett Hely "Navigálj oda" integráció — ha van előre validált
  // initialDestination, a "Hová?" mező KNOWN_PLACE módban indul (a hely
  // neve már ki van töltve); egyébként, ha van kedvenc-preset, ABBÓL
  // seedelünk (MANUAL strukturált cím VAGY KNOWN_PLACE); egyébként a régi,
  // VÁLTOZATLAN MANUAL/"" kezdőállapot (lásd M. regressziós teszt:
  // "existing manual destination search továbbra is működik").
  const [destination, setDestination] = useState<RouteDestination>(
    initialDestination
      ? {
          type: "KNOWN_PLACE",
          name: initialDestination.name,
          latitude: initialDestination.latitude,
          longitude: initialDestination.longitude,
        }
      : initialFavoritePreset && initialFavoritePreset.destinationMode === "KNOWN_PLACE" && initialFavoritePreset.destinationKnownPlace
        ? {
            type: "KNOWN_PLACE",
            name: initialFavoritePreset.destinationKnownPlace.name,
            latitude: initialFavoritePreset.destinationKnownPlace.latitude,
            longitude: initialFavoritePreset.destinationKnownPlace.longitude,
          }
        : initialFavoritePreset && initialFavoritePreset.destinationMode === "MANUAL" && initialFavoritePreset.destinationManual
          ? {
              type: "MANUAL",
              city: initialFavoritePreset.destinationManual.city,
              districtOrPostalCode: initialFavoritePreset.destinationManual.districtOrPostalCode,
              street: initialFavoritePreset.destinationManual.street,
            }
          : { type: "MANUAL", city: "Budapest", districtOrPostalCode: "", street: "" }
  );
  const [when, setWhen] = useState<"now" | "scheduled">("now");
  const [datetime, setDatetime] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchApiResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Geocoding hardening (2026-09-10) — a térképes célpont-kijelölő NYITOTT/
  // ZÁRT állapota, és a rá induláshoz szükséges közelítő koordináta (a
  // szerver address_approximate válaszából, lásd handleSubmit). Tisztán UI
  // állapot — nem érinti az állapotgépet vagy a routing kérést, amíg a
  // felhasználó nem hagyja jóvá a kijelölt pontot (lásd handleMapPickerConfirm).
  const [destinationMapPickerOpen, setDestinationMapPickerOpen] = useState(false);
  const [approximateDestination, setApproximateDestination] = useState<{ name: string; lat: number; lon: number } | null>(null);
  // GEOCODING GENERALIZÁCIÓ / SZIMMETRIA (2026-09-11, 8-9. pont) — az
  // indulási oldal ugyanazt a nyitott/zárt + közelítő-koordináta állapotot
  // kapja, mint a fenti destination-oldali pár, hogy a térképes
  // pontosítás NE legyen destination-only funkció.
  const [originMapPickerOpen, setOriginMapPickerOpen] = useState(false);
  const [approximateOrigin, setApproximateOrigin] = useState<{ name: string; lat: number; lon: number } | null>(null);
  // GEOCODING KORREKCIÓ (2026-09-11, C4.1, "többértelmű találatok" pont) —
  // a szerver "address_ambiguous" válaszából kapott, MINIMÁLIS jelölt-lista
  // (max 5 elem) — origin/destination mezőnként külön, szimmetrikusan,
  // ugyanazt a mintát követve, mint a fenti approximate{Origin,Destination}
  // pár. Amíg null, nincs választólista megjelenítve.
  const [ambiguousOriginCandidates, setAmbiguousOriginCandidates] = useState<GeocodePlaceCandidate[] | null>(null);
  const [ambiguousDestinationCandidates, setAmbiguousDestinationCandidates] = useState<GeocodePlaceCandidate[] | null>(null);
  // STREET-LEVEL FALLBACK (2026-09-12) — "house_number_not_resolved" API
  // válasz esetén a biztosan feloldott utca közelítő koordinátáját tároljuk
  // (szimmetrikusan, origin/destination oldalon). Az inline kártya ezekből
  // olvas; amíg null, nincs kártya megjelenítve. A routing KIZÁRÓLAG
  // explicit felhasználói jóváhagyás után indul (lásd handleStreetLevel*).
  const [streetLevelFrom, setStreetLevelFrom] = useState<{
    name: string; lat: number; lon: number; resolvedStreet?: string; resolvedCity?: string;
  } | null>(null);
  const [streetLevelTo, setStreetLevelTo] = useState<{
    name: string; lat: number; lon: number; resolvedStreet?: string; resolvedCity?: string;
  } | null>(null);
  // STREET-LEVEL FALLBACK — re-submit flag: mikor a felhasználó az
  // "Az utca közelítő helyével tervezek" gombot nyomja, az origin/destination
  // state-et MAP_PICKED-re frissítjük, majd EZZEL a flag-gel jelezzük, hogy
  // a form-ot a React render után újra kell küldeni — a useEffect kezeli
  // (lásd lent), azután a flag-et nullázzuk.
  const [pendingStreetLevelResubmit, setPendingStreetLevelResubmit] = useState(false);
  // formRef — a street-level re-submit useEffect-ből hívja requestSubmit()-ot
  const formRef = useRef<HTMLFormElement>(null);
  const [weights, setWeights] = useState<PersonalizationWeights>(
    initialFavoritePreset?.weights ?? {
      transfers: 1,
      modeSwitches: 1,
      underground: 1,
      walking: 1,
      duration: 1,
      waiting: 1,
    }
  );
  // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C) — explicit,
  // tisztán UI-szintű preferencia-kapcsoló. Alapértéke false (spec 3.
  // pont: "Default: false. Ha false: a jelenlegi routing működés
  // SEMMILYEN módon ne változzon."). KÜLÖN marad a `weights`
  // (Sensory Engine) állapottól — ez EGY DIMENZIÓ, nem egy szenzoros
  // szempont (spec 10. pont).
  const [stepFreeRequired, setStepFreeRequired] = useState(false);
  // MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1 (2026-09-13) — UGYANAZ a
  // "tisztán UI-szintű preferencia-kapcsoló, alapérték false, hiányában a
  // jelenlegi routing működés SEMMILYEN módon nem változik" mintázat, mint
  // a fenti stepFreeRequired-nál. bikePropulsion csak akkor kap bármilyen
  // hatást, ha molBubiEnabled === true (lásd handleSubmit body-ja lent).
  const [molBubiEnabled, setMolBubiEnabled] = useState(false);
  const [bikePropulsion, setBikePropulsion] = useState<"ANY" | "HUMAN" | "ELECTRIC_ASSIST">("ANY");
  // Part B (2026-09-08) — melyik kártya térképe van éppen nyitva (index a
  // result.journeys tömben, vagy null, ha egyik sincs nyitva). Ez az
  // EGYETLEN helye annak, hogy "melyik kártya aktív" — nincs másik,
  // globális "activeJourney"/"aktív útvonal" állapot többé (lásd a régi,
  // most eltávolított "Aktív útvonal a térképen" blokkot). Új kártya
  // nyitása automatikusan zárja az előzőt, mert csak EGY index lehet
  // "nyitva" egyszerre.
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // „Aktuális helyzetem" mint indulási pont (UX módosítás, 2026-09-09) —
  // ez a useGeolocation()-instance KIZÁRÓLAG a form induló-mezőjéhez
  // tartozik (nem osztozik semelyik kártya saját, per-kártya geo
  // hookjával) — a koordináta ugyanúgy csak React state-ben, memóriában
  // él (lásd useGeolocation.ts fejléce), NEM perzisztálódik/logolódik.
  const originGeo = useGeolocation();
  const [originError, setOriginError] = useState<string | null>(null);

  // CÍM AUTOCOMPLETE (2026-09-14, kiterjesztve a transit "Cím vagy hely"
  // mezőkre) — a MEGLÉVŐ, autós ágon már bevezetett közös hookot használja
  // (lib/vedett-route/useAddressAutocomplete.ts), amely a MEGLÉVŐ
  // /api/admin/vedett-utvonal/address-search végpontot (és a MEGLÉVŐ
  // geocodert) hívja. A geokódolás/routing logika VÁLTOZATLAN — ez
  // KIZÁRÓLAG a "Cím vagy hely" input UX-ét bővíti.
  //
  // EXPLICIT VÁROS/KERÜLET (2026-09-14, "transit külön Város mező"
  // hardening) — a transit UI-nak KÜLÖN Város és Irányítószám/kerület
  // mezője van a "Cím vagy hely" mellett; ezeket KÖTELEZŐEN átadjuk a
  // hooknak, hogy a Nominatim-keresés MAGÁBAN a kérésben a megadott
  // településre korlátozódjon (ne csak utólag rangsoroljon) — pl.
  // Város="Budaörs" + Cím="Szabadság út" -> budaörsi találatok, nem
  // Csömör/Pécs.
  // KOORDINÁTA-ÁTADÁS (2026-09-14, "Mapbox autocomplete koordináta a
  // routingnak" sprint) — a hook 3./4. visszatérési eleme (sessionToken,
  // resetSession) a kiválasztott suggestion /retrieve hívásához kell:
  // UGYANAZZAL a sessionTokennel kérjük le a pontos koordinátát, amivel a
  // /suggest javaslat érkezett (lásd retrieveAddressSuggestion hívása
  // lejjebb, a suggestion-választó onMouseDown-okban).
  const [originStreetSuggestions, setOriginStreetSuggestions, originAutocompleteSessionToken, resetOriginAutocompleteSession] = useAddressAutocomplete(
    origin.type === "MANUAL" ? origin.street : "",
    disabled,
    {
      city: origin.type === "MANUAL" ? origin.city : undefined,
      postalOrDistrict: origin.type === "MANUAL" ? origin.districtOrPostalCode : undefined,
    }
  );
  const [destinationStreetSuggestions, setDestinationStreetSuggestions, destinationAutocompleteSessionToken, resetDestinationAutocompleteSession] = useAddressAutocomplete(
    destination.type === "MANUAL" ? destination.street : "",
    disabled,
    {
      city: destination.type === "MANUAL" ? destination.city : undefined,
      postalOrDistrict: destination.type === "MANUAL" ? destination.districtOrPostalCode : undefined,
    }
  );

  // KOORDINÁTA-ÁTADÁS — suggestion kiválasztásakor a MEGLÉVŐ MAP_PICKED
  // origin/destination módot használjuk (UGYANAZ a wire-invariáns, mint a
  // "térképen kijelölt pont" flow-nál: MAP_PICKED → fromCoordinates/
  // toCoordinates, a szerver SOSEM geokódolja újra — lásd
  // searchRequestBuilder.ts). Ha a retrieve bármi okból (hiányzó id,
  // hiányzó MAPBOX_ACCESS_TOKEN, hálózati hiba) nem ad koordinátát, a
  // MEGLÉVŐ, VÁLTOZATLAN manuális-mező-kitöltés a fallback — a
  // felhasználó ekkor is választhat, csak a cím szövegesen kerül a
  // mezőbe, és a szerver a régi geocodeAddress()-t hívja rá.
  async function selectOriginSuggestion(s: { id?: string; label: string; lat?: number; lon?: number }) {
    const retrieved =
      typeof s.lat === "number" && typeof s.lon === "number"
        ? { lat: s.lat, lon: s.lon, label: s.label }
        : s.id
          ? await retrieveAddressSuggestion(s.id, originAutocompleteSessionToken)
          : null;
    if (retrieved) {
      setOrigin({ type: "MAP_PICKED", name: s.label, latitude: retrieved.lat, longitude: retrieved.lon });
    } else {
      updateOriginManualField("street", s.label);
    }
    // Új session a KÖVETKEZŐ keresési interakcióhoz (Mapbox Search Box
    // session-szabály — lásd useAddressAutocomplete.ts fejléce).
    resetOriginAutocompleteSession();
  }

  async function selectDestinationSuggestion(s: { id?: string; label: string; lat?: number; lon?: number }) {
    const retrieved =
      typeof s.lat === "number" && typeof s.lon === "number"
        ? { lat: s.lat, lon: s.lon, label: s.label }
        : s.id
          ? await retrieveAddressSuggestion(s.id, destinationAutocompleteSessionToken)
          : null;
    if (retrieved) {
      setDestination({ type: "MAP_PICKED", name: s.label, latitude: retrieved.lat, longitude: retrieved.lon });
    } else {
      updateDestinationManualField("street", s.label);
    }
    resetDestinationAutocompleteSession();
  }
  const [showOriginStreetSuggestions, setShowOriginStreetSuggestions] = useState(false);
  const [showDestinationStreetSuggestions, setShowDestinationStreetSuggestions] = useState(false);
  // B5 — "nem indítható el ugyanaz a kérés párhuzamosan": ez a ref jelzi,
  // hogy EZ a form ténylegesen kezdeményezett-e egy "Aktuális helyzetem"
  // kérést (megkülönböztetve attól, ha originGeo valamiért más okból
  // "requesting" állapotba kerülne) — csak akkor reagálunk a
  // granted/hiba átmenetre, ha mi kértük.
  const originRequestedRef = useRef(false);

  useEffect(() => {
    if (!originRequestedRef.current) return;
    if (originGeo.status === "granted" && originGeo.latitude !== null && originGeo.longitude !== null) {
      setOrigin({ type: "CURRENT_LOCATION", latitude: originGeo.latitude, longitude: originGeo.longitude });
      setOriginError(null);
      // A kedvenc-preset "Aktuális helyzetem → [cél]" előzetes jelzése
      // (pendingFavoriteOriginLabel) innentől felesleges — az origin state
      // már a valódi, most lekért koordinátát tartja.
      setPendingFavoriteOriginLabel(null);
      originRequestedRef.current = false;
    } else if (originGeo.status === "denied" || originGeo.status === "timeout" || originGeo.status === "unavailable" || originGeo.status === "error") {
      setOriginError(ORIGIN_GEOLOCATION_ERROR_COPY[originGeo.status] ?? ORIGIN_GEOLOCATION_ERROR_COPY.error);
      originRequestedRef.current = false;
    }
    // "requesting" közben nincs teendő — a gomb loading state-et mutat.
  }, [originGeo.status, originGeo.latitude, originGeo.longitude]);

  // STREET-LEVEL FALLBACK (2026-09-12) — re-submit useEffect: miután a
  // felhasználó az "Az utca közelítő helyével tervezek" gombot nyomta,
  // az origin/destination state már MAP_PICKED-re frissült. Ez az effect
  // az állapotfrissítés UTÁNI renderben fut le (React guarantee), ezért
  // a formRef.current.requestSubmit() már az ÚJ state-et olvasó
  // handleSubmit-et hívja. A pendingStreetLevelResubmit flag egyszeri
  // elsütés — azonnal nullázzuk, hogy ne induljon végtelen loop.
  useEffect(() => {
    if (!pendingStreetLevelResubmit) return;
    setPendingStreetLevelResubmit(false);
    formRef.current?.requestSubmit();
  }, [pendingStreetLevelResubmit]);

  function handleUseCurrentLocation() {
    // B5 — ha már fut egy kérés, egy újabb kattintás nem indít párhuzamos
    // másikat (a böngésző Geolocation API-ja amúgy sem szereti a
    // párhuzamos getCurrentPosition hívásokat, de itt explicit védjük).
    if (originGeo.status === "requesting") return;
    setOriginError(null);
    // B2 — ha a hook-nak MÁR van friss ("granted") pozíciója (pl. a
    // felhasználó korábban ugyanebben a formban már engedélyezte), azt
    // azonnal újrahasználjuk geokódolás/új engedélykérés nélkül; egyébként
    // egy friss lekérdezést indítunk.
    if (originGeo.status === "granted" && originGeo.latitude !== null && originGeo.longitude !== null) {
      setOrigin({ type: "CURRENT_LOCATION", latitude: originGeo.latitude, longitude: originGeo.longitude });
      setPendingFavoriteOriginLabel(null);
      return;
    }
    originRequestedRef.current = true;
    originGeo.requestOnce();
  }

  function updateOriginManualField(field: "city" | "districtOrPostalCode" | "street", value: string) {
    // B4 (kiterjesztve a strukturált címre) — bármilyen kézi gépelés
    // BÁRMELYIK manuális címmezőbe (Város / Irányítószám vagy kerület /
    // Utca, házszám) AZONNAL visszaállítja MANUAL módra, SOSEM használ
    // elavult GPS-koordinátát a routing kéréshez ezután. A már kitöltött
    // többi mezőt megőrizzük — egyetlen mező módosítása nem törli a
    // többit.
    setOrigin((prev) => {
      const base = prev.type === "MANUAL" ? prev : { type: "MANUAL" as const, city: "Budapest", districtOrPostalCode: "", street: "" };
      return { ...base, type: "MANUAL", [field]: value };
    });
    // A felhasználó explicit MANUAL címet kezdett gépelni — a kedvenc
    // preset "Aktuális helyzetem" jelzése innentől nem releváns.
    setPendingFavoriteOriginLabel(null);
  }

  function updateDestinationManualField(field: "city" | "districtOrPostalCode" | "street", value: string) {
    // Ugyanaz a szabály, mint az induló mezőknél. Ha épp KNOWN_PLACE volt
    // aktív, ez a függvény csak a strukturált mezőkből hívódik (azok csak
    // MANUAL módban látszanak) — a KNOWN_PLACE -> MANUAL átváltást a "Hová?"
    // egyetlen mezős KNOWN_PLACE nézetéhez lásd handleDestinationOverrideChange.
    setDestination((prev) => {
      const base = prev.type === "MANUAL" ? prev : { type: "MANUAL" as const, city: "Budapest", districtOrPostalCode: "", street: "" };
      return { ...base, type: "MANUAL", [field]: value };
    });
  }

  function handleDestinationOverrideChange(value: string) {
    // Autocomplete-ból kiválasztott MAP_PICKED cím szerkesztésekor megőrizzük
    // a kiválasztott települést/irányítószámot. Példa:
    // "Kőszikla utca, Sóskút, 2038" -> a felhasználó beszúrja a 12-t ->
    // MANUAL: street="Kőszikla utca 12", city="Sóskút", postcode="2038".
    // A régi viselkedés minden ilyen szerkesztést Budapestre állított vissza,
    // ezért a házszámos újrakeresés Sóskútnál szükségszerűen félrement.
    setDestination((prev) => {
      if (prev.type === "MAP_PICKED") {
        const selected = splitSelectedAddressLabel(prev.name);
        if (selected) {
          const street = value.endsWith(selected.suffix)
            ? value.slice(0, -selected.suffix.length).trim()
            : value;
          return {
            type: "MANUAL" as const,
            city: selected.city,
            districtOrPostalCode: selected.postalOrDistrict,
            street,
          };
        }
      }

      // KNOWN_PLACE deep linknél nincs garantált strukturált cím-metaadat,
      // ezért ott a korábbi biztonságos MANUAL fallback marad.
      return { type: "MANUAL" as const, city: "Budapest", districtOrPostalCode: "", street: value };
    });
  }

  // Geocoding hardening (2026-09-10), 11-13. pont — a felhasználó a
  // térképen jóváhagyta a pontos célt: a kijelölt lat/lon MOSTANTÓL
  // közvetlenül a MEGLÉVŐ toCoordinates útvonalon megy (lásd
  // destinationFields handleSubmit-ben) — SOHA nem geokódoljuk újra, SOHA
  // nem küldünk reverse-geocode kérést, SOHA nem perzisztáljuk ezt a
  // koordinátát (sem adatbázisba, sem analyticsbe) — kizárólag a jelenlegi
  // React state-ben él, amíg a felhasználó újra nem keres.
  function handleMapPickerConfirm(lat: number, lon: number) {
    setDestination({
      type: "MAP_PICKED",
      name: "Térképen kijelölt célpont",
      latitude: lat,
      longitude: lon,
    });
    setDestinationMapPickerOpen(false);
  }

  function handleMapPickerCancel() {
    setDestinationMapPickerOpen(false);
  }

  // GEOCODING GENERALIZÁCIÓ / SZIMMETRIA (2026-09-11, 8-9. pont) — az
  // indulási oldal PONTOSAN ugyanazt a mintát követi, mint a fenti
  // handleMapPickerConfirm/handleMapPickerCancel: kizárólag React state-et
  // (setOrigin) állít, nincs benne fetch/localStorage/adatbázis-hívás,
  // nincs re-geokódolás.
  function handleOriginMapPickerConfirm(lat: number, lon: number) {
    setOrigin({
      type: "MAP_PICKED",
      name: "Térképen kijelölt induló hely",
      latitude: lat,
      longitude: lon,
    });
    setOriginMapPickerOpen(false);
  }

  function handleOriginMapPickerCancel() {
    setOriginMapPickerOpen(false);
  }

  // STREET-LEVEL FALLBACK (2026-09-12) — "Az utca közelítő helyével tervezek"
  // gomb handlerei (destination + origin szimmetrikusan):
  //   1. A már feloldott koordinátával MAP_PICKED-re állítjuk az origin/dest state-et.
  //   2. A street-level state-et töröljük (kártya eltűnik).
  //   3. A pendingStreetLevelResubmit flag-et igazra állítjuk → useEffect
  //      a következő render után requestSubmit()-ot hív.
  // BIZTONSÁGI garantia: NEM geokódoljuk újra a hibás házszámos input-ot.
  // A koordináta a szerver által visszaadott, már validált utca-koordináta.
  function handleStreetLevelAcceptTo() {
    if (!streetLevelTo) return;
    const label = [streetLevelTo.resolvedStreet, streetLevelTo.resolvedCity]
      .filter(Boolean)
      .join(", ") || "Utca közelítő helye";
    setDestination({ type: "MAP_PICKED", name: label, latitude: streetLevelTo.lat, longitude: streetLevelTo.lon });
    setStreetLevelTo(null);
    setPendingStreetLevelResubmit(true);
  }

  function handleStreetLevelModifyTo() {
    setStreetLevelTo(null);
    setResult(null);
  }

  function handleStreetLevelAcceptFrom() {
    if (!streetLevelFrom) return;
    const label = [streetLevelFrom.resolvedStreet, streetLevelFrom.resolvedCity]
      .filter(Boolean)
      .join(", ") || "Utca közelítő helye";
    setOrigin({ type: "MAP_PICKED", name: label, latitude: streetLevelFrom.lat, longitude: streetLevelFrom.lon });
    setStreetLevelFrom(null);
    setPendingStreetLevelResubmit(true);
  }

  function handleStreetLevelModifyFrom() {
    setStreetLevelFrom(null);
    setResult(null);
  }

  // GEOCODING KORREKCIÓ (2026-09-11, C4.1, "többértelmű találatok" pont) —
  // a felhasználó egy AMBIGUOUS válasz jelölt-listájából választott —
  // pontosan úgy kezeljük, mint egy térképen kijelölt pontot (MAP_PICKED):
  // a candidate koordinátája/neve AUTHORITATIVE, SOHA nem geokódoljuk
  // újra, nincs fetch/localStorage-hívás ezekben a handlerekben. A
  // `fromName`/`toName` mezőn keresztül (lásd handleSubmit originFields/
  // destinationFields) a kiválasztott hely SAJÁT NEVE jut el a szerverhez —
  // ez SOHA nem a statikus "Jelenlegi hely"/"Kiválasztott cél" alapérték.
  function handleSelectOriginCandidate(candidate: GeocodePlaceCandidate) {
    setOrigin({
      type: "MAP_PICKED",
      name: candidate.displayName,
      latitude: candidate.lat,
      longitude: candidate.lon,
    });
    setAmbiguousOriginCandidates(null);
  }

  function handleSelectDestinationCandidate(candidate: GeocodePlaceCandidate) {
    setDestination({
      type: "MAP_PICKED",
      name: candidate.displayName,
      latitude: candidate.lat,
      longitude: candidate.lon,
    });
    setAmbiguousDestinationCandidates(null);
  }

  // A jelölt-lista bezárása kiválasztás nélkül — csak a lokális UI
  // állapotot törli, az origin/destination state-et NEM módosítja (a
  // felhasználó ezután szabadon szerkesztheti a mezőt egy új kereséshez).
  function handleDismissOriginCandidates() {
    setAmbiguousOriginCandidates(null);
  }

  function handleDismissDestinationCandidates() {
    setAmbiguousDestinationCandidates(null);
  }

  // Kedvenc útvonalak — mentés UI állapota (Favorites CTA UX sprint,
  // 2026-09-10, spec 8. pont: "idle" -> "♡ Kedvencekhez adom" nagy,
  // hangsúlyos másodlagos CTA; "open" -> névadó mini-form, mentés közben
  // "♡ Kedvenc mentése…"; sikeres mentés után "saved" -> "♥ Kedvenc
  // útvonal"; ha a preset már létezik, "duplicate" -> "♥ Már a
  // kedvenceid között". A "duplicate" ÚJ állapot ehhez a sprinthez — a
  // MEGLÉVŐ backend duplicate-detekciót (lásd handleSaveFavorite lent,
  // data.duplicate) használja, NEM hoz létre új backend-logikát; csak a
  // UI-állapotot bontja szét külön, kulturált megjelenésre a korábbi
  // "nyitva marad + hibaszöveg" viselkedés helyett.
  const [favoriteSaveState, setFavoriteSaveState] = useState<"idle" | "open" | "saved" | "duplicate">("idle");
  const [favoriteNameInput, setFavoriteNameInput] = useState("");
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [favoriteSaveMessage, setFavoriteSaveMessage] = useState<string | null>(null);

  // Determinisztikus névjavaslat (spec 21. pont: "Ne használj AI-t
  // ehhez") — UGYANAZ az elv, mint a szerver oldali
  // lib/vedett-route/favorites/queries.ts buildDefaultFavoriteName()
  // (az a szerver-only adatbázis-klienst importáló modul nem hívható
  // "use client" komponensből, ezért a logika szándékosan duplikált itt,
  // egyszerű string-összeállítás, nem üzleti szabály).
  function currentFavoriteOriginLabel(): string {
    if (origin.type === "CURRENT_LOCATION") return "Aktuális helyzetem";
    // GEOCODING GENERALIZÁCIÓ / SZIMMETRIA (2026-09-11) — a térképen
    // kijelölt induló pontnak (MAP_PICKED) nincs .street/.city mezője
    // (azok csak a MANUAL cím-ágon léteznek), pontosan úgy, mint a
    // destination oldali MAP_PICKED/KNOWN_PLACE esetben (lásd
    // currentFavoriteDestinationLabel) — a saját .name mezője a helyes
    // megjelenítési forrás.
    if (origin.type === "MAP_PICKED") return origin.name;
    return origin.street || origin.city || "Induló hely";
  }

  function currentFavoriteDestinationLabel(): string {
    // Geocoding hardening (2026-09-10) — a MAP_PICKED cél (térképen
    // kijelölt, korábban APPROXIMATE geokódolási találat után pontosított
    // pont, lásd DestinationMapPicker.tsx) egy MÁR ISMERT koordinátájú cél,
    // pontosan úgy mint a KNOWN_PLACE (Védett Hely deep link) — mindkettőnek
    // van .name mezője, nincs .street/.city (azok csak a MANUAL cím-ágon
    // léteznek), ezért ugyanabba az ágba tartoznak itt is.
    if (destination.type === "KNOWN_PLACE" || destination.type === "MAP_PICKED") return destination.name;
    return destination.street || destination.city || "Cél";
  }

  async function handleSaveFavorite() {
    setFavoriteSaveMessage(null);
    // Ugyanaz a kulturált, magyar validációs hiba, mint a fő keresésnél —
    // nem küldünk el egy nyilvánvalóan hiányos MANUAL címet a szervernek.
    if (origin.type === "MANUAL" && !isManualAddressComplete(origin)) {
      setFavoriteSaveMessage("Add meg a várost, az irányítószámot vagy kerületet és az utcát.");
      return;
    }
    // GEOCODING GENERALIZÁCIÓ / SZIMMETRIA (2026-09-11) — a kedvenc-mentés
    // meglévő wire-formátuma (favoritesMode: "CURRENT_LOCATION" | "MANUAL")
    // nem ismer induló-oldali "MÁR ISMERT hely" módot (a destination
    // oldalon ez a KNOWN_PLACE deep-linkből származik, az originnak nincs
    // ilyen forrása) — egy térképen kijelölt, EGYSZERI induló pont
    // kedvencként mentése ezért SZÁNDÉKOSAN nem támogatott, amíg a
    // szerver oldali séma ezt nem definiálja; ez KIZÁRÓLAG a kedvenc-
    // MENTÉS funkciót érinti, a keresést/routingot nem.
    if (origin.type === "MAP_PICKED") {
      setFavoriteSaveMessage("A térképen kijelölt induló pont mentése kedvencként jelenleg nem támogatott.");
      return;
    }
    if (destination.type === "MANUAL" && !isManualAddressComplete(destination)) {
      setFavoriteSaveMessage("Add meg a várost, az irányítószámot vagy kerületet és az utcát.");
      return;
    }

    setFavoriteSaving(true);
    try {
      const originFields =
        origin.type === "CURRENT_LOCATION"
          ? { originMode: "CURRENT_LOCATION" as const }
          : {
              originMode: "MANUAL" as const,
              originManual: { city: origin.city, districtOrPostalCode: origin.districtOrPostalCode, street: origin.street },
            };
      // Geocoding hardening (2026-09-10) — a kedvenc-mentés favoritesMode-ja
      // szempontjából a MAP_PICKED cél (térképen pontosított, korábban
      // APPROXIMATE eredmény, lásd DestinationMapPicker.tsx) egy MÁR ISMERT
      // koordinátájú cél, UGYANÚGY mint a KNOWN_PLACE (Védett Hely deep
      // link) — nincs külön "MAP_PICKED" favoritesMode a szerver oldali
      // sémában (nem is kell: a kedvenc szempontjából csak a koordináta és
      // egy megjelenítési név számít, a "honnan jött a koordináta" nem
      // releváns adat, amit el kellene tárolni), ezért ide is
      // KNOWN_PLACE-ként megy.
      const destinationFields =
        destination.type === "KNOWN_PLACE" || destination.type === "MAP_PICKED"
          ? {
              destinationMode: "KNOWN_PLACE" as const,
              destinationKnownPlace: { name: destination.name, latitude: destination.latitude, longitude: destination.longitude },
            }
          : {
              destinationMode: "MANUAL" as const,
              destinationManual: { city: destination.city, districtOrPostalCode: destination.districtOrPostalCode, street: destination.street },
            };
      const body = {
        name: favoriteNameInput.trim() || undefined,
        ...originFields,
        ...destinationFields,
        weights,
      };
      const res = await fetch("/api/vedett-route/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; duplicate?: boolean; message?: string };
      if (data.ok) {
        setFavoriteSaveState("saved");
      } else if (data.duplicate) {
        // Favorites CTA UX sprint, spec 8. pont — a duplicate a MEGLÉVŐ
        // backend detekció eredménye (data.duplicate), csak a UI most egy
        // önálló, kulturált "♥ Már a kedvenceid között" állapotot mutat
        // ehelyett, hogy a névadó mini-form nyitva marad egy hibaszöveggel.
        setFavoriteSaveMessage(data.message ?? "Ez az útvonal már a kedvenceid között van.");
        setFavoriteSaveState("duplicate");
      } else {
        setFavoriteSaveMessage(data.message ?? "Nem sikerült elmenteni a kedvenc útvonalat.");
      }
    } catch {
      setFavoriteSaveMessage("Nem sikerült elmenteni a kedvenc útvonalat.");
    } finally {
      setFavoriteSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setResult(null);
    setOpenIndex(null);

    // 6. pont — kulturált, magyar validációs hiba a nyers Zod/technikai
    // hibaüzenet helyett; a szerver felé csak akkor megy a kérés, ha a
    // strukturált cím mindhárom kötelező része (város, irányítószám VAGY
    // kerület, utca) ki van töltve.
    if (origin.type === "MANUAL" && !isManualAddressComplete(origin)) {
      setFormError("Add meg a várost, az irányítószámot vagy kerületet és az utcát.");
      return;
    }
    if (destination.type === "MANUAL" && !isManualAddressComplete(destination)) {
      setFormError("Add meg a várost, az irányítószámot vagy kerületet és az utcát.");
      return;
    }

    setLoading(true);
    try {
      // B2/B3 — CURRENT_LOCATION esetén a szerver felé a STRUKTURÁLT
      // lat/lon megy (fromCoordinates), SOHA nem az "Aktuális helyzetem"
      // felirat mint geokódolandó cím-string (lásd
      // app/api/admin/vedett-utvonal/search/route.ts — ez a mező
      // KIHAGYJA a geocodeAddress() hívást). A célhelyre (to/toCoordinates)
      // ugyanez a szimmetrikus szabály vonatkozik a Védett Hely "Navigálj
      // oda" integráció óta (2026-09-09): KNOWN_PLACE esetén a MÁR ISMERT
      // koordináta megy, nincs felesleges újra-geokódolás.
      // GEOCODING GENERALIZÁCIÓ / SZIMMETRIA (2026-09-11, 8-9. pont) — a
      // térképen kijelölt induló pont (MAP_PICKED, lásd
      // handleOriginMapPickerConfirm) UGYANAZON fromCoordinates ágon megy,
      // mint a CURRENT_LOCATION — mindkettő egy MÁR ISMERT, nem
      // geokódolandó koordináta. A meglévő CURRENT_LOCATION feltétel (és a
      // rá épülő 17. eset regressziós teszt EXAKT string-mintája) SZÁNDÉKOSAN
      // változatlan marad, a MAP_PICKED egy ÚJ, KÜLÖN ternary-ágként bővíti.
      // GEOCODING KORREKCIÓ (2026-09-11, C4.1, "origin map picker label"
      // pont) — a MAP_PICKED ág MOSTANTÓL a `fromName` mezőn keresztül a
      // kijelölt/választott hely SAJÁT NEVÉT is elküldi (lásd
      // route.ts: `name: fromName ?? "Jelenlegi hely"`), hogy a szerver
      // válasza SOHA ne mutassa a statikus "Jelenlegi hely" nevet egy
      // MAP_PICKED induló pontra — a CURRENT_LOCATION ág (fentebb)
      // SZÁNDÉKOSAN nem küld fromName-et, ott marad a régi, VÁLTOZATLAN
      // "Jelenlegi hely" alapérték.
      // STREET-LEVEL FALLBACK (2026-09-12) — a request-body mezőit
      // searchRequestBuilder.ts pure függvényei állítják össze.
      // Wire-invariáns: MAP_PICKED/CURRENT_LOCATION → fromCoordinates,
      // MANUAL → from: string; KNOWN_PLACE/MAP_PICKED → toCoordinates,
      // MANUAL → to: string. Ez tesztelhetővé vált React nélkül.
      const originFields = buildSearchRequestOriginFields(origin);
      const destinationFields = buildSearchRequestDestinationFields(destination);
      const body = {
        ...originFields,
        ...destinationFields,
        departAt: when === "now" ? new Date().toISOString() : new Date(datetime).toISOString(),
        weights,
        // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11) — mindig explicit
        // boolean-ként megy (nem csak igaz esetén), hogy a szerver oldali
        // cache-kulcs (lásd route.ts) és a request értelmezése egyértelmű
        // legyen; alapértéke false, ami a jelenlegi routing viselkedést
        // változatlanul hagyja.
        stepFreeRequired,
        // MOL BUBI PHASE 1 — mindig explicit érték megy, mint stepFreeRequired-nél.
        molBubiEnabled,
        bikePropulsion,
      };
      const res = await fetch("/api/admin/vedett-utvonal/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as SearchApiResponse;
      setResult(data);
      // Geocoding hardening (2026-09-10), 11-12. pont — az address_approximate
      // válasz esetén elmentjük a szerver által adott közelítő koordinátát,
      // hogy a térképes kijelölő ERRE fókuszálva induljon el (nem
      // Budapest-szintű alapnézettel). A CTA gomb (lásd lent) hívja meg a
      // {destination,origin}MapPickerOpen(true)-t, ez itt csak az adatot
      // készíti elő.
      //
      // GEOCODING GENERALIZÁCIÓ / SZIMMETRIA (2026-09-11, 8-9. pont) — a
      // szerver (route.ts) MINDIG szimmetrikusan adja a `field`/
      // `approximateLocation`-t ("from" VAGY "to", lásd route.ts fejléce) —
      // ez a korábbi verzióban KIZÁRÓLAG a "to" esetet kezelte kliens
      // oldalon (data.field === "to" hardcoded feltétel), az origin oldali
      // "from" eset kliens-oldalon KEZELETLEN maradt. Mostantól mindkét
      // mezőre külön, egymástól független state-et állítunk be — pontosan
      // egy ág lehet aktív egyszerre, mert a szerver egyetlen `field`-et ad
      // vissza válaszonként.
      if (!data.ok && data.reason === "address_approximate" && data.field === "to" && data.approximateLocation) {
        setApproximateDestination(data.approximateLocation);
      } else {
        setApproximateDestination(null);
      }
      if (!data.ok && data.reason === "address_approximate" && data.field === "from" && data.approximateLocation) {
        setApproximateOrigin(data.approximateLocation);
      } else {
        setApproximateOrigin(null);
      }
      // GEOCODING KORREKCIÓ (2026-09-11, C4.1, "többértelmű találatok"
      // pont) — az address_ambiguous válasz jelölt-listáját (max 5,
      // GeocodePlaceCandidate[]) ugyanúgy mezőnkénti, egymástól független
      // state-ben tároljuk, mint a fenti approximate{Origin,Destination}
      // párt — origin/destination szimmetrikusan, pontosan egy ág lehet
      // aktív egyszerre.
      if (!data.ok && data.reason === "address_ambiguous" && data.field === "from" && data.candidates) {
        setAmbiguousOriginCandidates(data.candidates);
      } else {
        setAmbiguousOriginCandidates(null);
      }
      if (!data.ok && data.reason === "address_ambiguous" && data.field === "to" && data.candidates) {
        setAmbiguousDestinationCandidates(data.candidates);
      } else {
        setAmbiguousDestinationCandidates(null);
      }
      // STREET-LEVEL FALLBACK (2026-09-12) — "house_number_not_resolved"
      // válasz esetén elmentjük az utca közelítő koordinátáját. Pontosan
      // egy ág lehet aktív (origin VAGY destination), szimmetrikusan.
      // A routing SOSEM indul automatikusan — kizárólag explicit UI gomb
      // (handleStreetLevelAccept*) váltja ki a pendingStreetLevelResubmit
      // flag-et, ami az useEffect-en keresztül requestSubmit()-ot hív.
      if (!data.ok && data.reason === "house_number_not_resolved" && data.field === "to" && data.approximateLocation) {
        setStreetLevelTo({ ...data.approximateLocation, resolvedStreet: data.resolvedStreet, resolvedCity: data.resolvedCity });
      } else {
        setStreetLevelTo(null);
      }
      if (!data.ok && data.reason === "house_number_not_resolved" && data.field === "from" && data.approximateLocation) {
        setStreetLevelFrom({ ...data.approximateLocation, resolvedStreet: data.resolvedStreet, resolvedCity: data.resolvedCity });
      } else {
        setStreetLevelFrom(null);
      }
    } catch {
      setResult({ ok: false, reason: "routing_engine_unavailable", message: "Az útvonaltervezés átmenetileg nem érhető el." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-sni-text">Útvonalkeresés</h2>

      <form ref={formRef} onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Indulási hely</label>
          {/* Task B — „Aktuális helyzetem" mint indulási pont: jól látható,
              mobilon is könnyen érinthető opció az induló mező felett. A
              gomb loading state-et mutat kérés közben (B5), és a
              feliratban SOHA nem jelenik meg nyers technikai kivétel —
              csak a specifikáció szerinti, magyar hibaszövegek. */}
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={disabled || originGeo.status === "requesting"}
            className="mt-1 flex items-center gap-1 rounded border border-sni-primary/30 bg-sni-primary/5 px-2 py-1 text-xs font-medium text-sni-primary disabled:opacity-50"
          >
            <span aria-hidden="true">📍</span>
            {originGeo.status === "requesting" ? "Helyzet meghatározása…" : "Aktuális helyzetem"}
          </button>
          {origin.type === "CURRENT_LOCATION" && (
            <p className="mt-1 text-xs text-green-700">Az induló pont: aktuális helyzeted.</p>
          )}
          {/* GEOCODING GENERALIZÁCIÓ / SZIMMETRIA (2026-09-11, 8-9. pont) —
              a térképen kijelölt induló pont UGYANAZT a "már ismert, nem
              geokódolandó koordináta" jelzést kapja, mint a fenti
              CURRENT_LOCATION ág — a lenti 3 mező (Város/Kerület/Utca)
              ilyenkor is látható marad (ürex, lásd updateOriginManualField:
              bármelyik mezőbe gépelés visszaállít MANUAL módra), de a
              felhasználó egyértelmű visszajelzést kap, hogy már van egy
              érvényes, kijelölt induló pontja. */}
          {origin.type === "MAP_PICKED" && (
            <p className="mt-1 text-xs text-green-700">
              Induló pont: {origin.name} (a térképen kijelölt koordináta alapján — nincs szükség újbóli keresésre).
            </p>
          )}
          {/* Kedvenc útvonalak integráció — CURRENT_LOCATION kedvenc preset
              betöltésekor SOHA nem indul automatikus GPS-kérés; ez a
              jelzés mutatja a szándékot, amíg a felhasználó explicit nem
              kattint az "Aktuális helyzetem" gombra. */}
          {pendingFavoriteOriginLabel && origin.type !== "CURRENT_LOCATION" && (
            <p className="mt-1 text-xs text-sni-primary">
              Ez egy kedvenc: {pendingFavoriteOriginLabel} → kattints az &quot;Aktuális helyzetem&quot; gombra a legfrissebb helyzeted lekéréséhez.
            </p>
          )}
          {originError && <p className="mt-1 text-xs text-amber-700">{originError}</p>}

          {/* Strukturált címbevitel (2. pont) — MANUAL módban három, külön
              kezelt mező (a "Kossuth utca" jellegű, Budapesten több helyen
              is előforduló utcanév-ütközések csökkentésére). CURRENT_LOCATION
              módban ezeket nem kell kitöltenie a felhasználónak (a fenti
              "Az induló pont: aktuális helyzeted." üzenet jelzi az
              állapotot); ha ezután BÁRMELYIK mezőbe gépel, a
              updateOriginManualField azonnal visszaállít MANUAL módra. */}
          {/* RESZPONZÍV LAYOUT KORREKCIÓ (2026-09-11, "Cím vagy hely" mező
              placeholder/helper-text kilógás javítása kör) — KIZÁRÓLAG
              layout/szöveg/responsive CSS, funkcionális logika (state,
              geokódolás, validáció) VÁLTOZATLAN. A grid mostantól három
              lépcsőben törik: mobil (alap, grid-cols-1) = Város / Kerület /
              Cím vagy hely egymás alatt, egy oszlopban; tablet (sm:, ≥640px,
              grid-cols-2) = Város és Kerület egy sorban, a "Cím vagy hely"
              mező pedig sm:col-span-2 miatt saját, teljes szélességű sort
              kap alattuk; desktop (lg:, ≥1024px, grid-cols-3) = a jelenlegi
              hárommezős, egy sorba rendezett elrendezés (Város | Kerület |
              Cím vagy hely), a lg:col-span-1 visszaállítja az egyenlő
              oszlopszélességet. */}
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <SettlementAutocomplete
              id="vedett-route-origin-city"
              label="Város"
              value={origin.type === "MANUAL" ? origin.city : ""}
              onChange={(value) => updateOriginManualField("city", value)}
              placeholder="Budapest"
              disabled={disabled}
            />
            <div className="min-w-0">
              <label className="block text-xs text-gray-500">Irányítószám vagy kerület</label>
              <input
                type="text"
                value={origin.type === "MANUAL" ? origin.districtOrPostalCode : ""}
                onChange={(e) => updateOriginManualField("districtOrPostalCode", e.target.value)}
                placeholder="pl. 1136 vagy XIII. kerület"
                disabled={disabled}
                className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
              />
            </div>
            {/* UI/SZÖVEGEZÉSI KORREKCIÓ (2026-09-11, "utolsó, kizárólag
                UI/szövegezési módosítás" kör, 1. pont) — a mező neve/
                placeholdere/segítő szövege KIZÁRÓLAG szöveg, NEM érinti a
                geokódolási/routing logikát: a mögötte álló state
                (origin.street) és a szerver felé küldött adat VÁLTOZATLAN
                (lásd updateOriginManualField/buildStructuredAddress). A
                cél, hogy a felhasználó easy-language módon értse, hogy a
                mezőbe cím ÉS hely/POI név is beírható, ne csak "utca,
                házszám". A placeholder és a helper text 2026-09-11-én,
                a reszponzív layout javítás körben rövidebbre/tördelhetőre
                cserélve, hogy ne lógjon ki a keskenyebb konténerből. */}
            <div className="min-w-0 sm:col-span-2 lg:col-span-1">
              <label className="block text-xs text-gray-500">Cím vagy hely</label>
              <div className="relative">
                <input
                  type="text"
                  value={origin.type === "MANUAL" ? origin.street : ""}
                  onChange={(e) => updateOriginManualField("street", e.target.value)}
                  onFocus={() => setShowOriginStreetSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowOriginStreetSuggestions(false), 150)}
                  placeholder="pl. Astoria vagy Váci utca 12"
                  disabled={disabled}
                  className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                />
                {/* CÍM AUTOCOMPLETE (2026-09-14) — a MEGLÉVŐ address-search
                    végpontból kapott javaslatok, kattintásra a teljes cím
                    kerül a mezőbe (updateOriginManualField). */}
                {showOriginStreetSuggestions && originStreetSuggestions.length > 0 && (
                  <ul className="absolute z-10 mt-0.5 w-full rounded border border-gray-200 bg-white text-sm shadow-sm">
                    {originStreetSuggestions.map((s, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onMouseDown={() => {
                            void selectOriginSuggestion(s);
                            setOriginStreetSuggestions([]);
                            setShowOriginStreetSuggestions(false);
                          }}
                          className="block w-full px-2 py-1 text-left hover:bg-gray-50"
                        >
                          {s.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="mt-0.5 w-full whitespace-normal break-words text-[11px] text-gray-400">
                Írhatsz címet vagy helyet is, pl. Déli pályaudvar.
              </p>
            </div>
          </div>
          {/* A korábbi, Budapest-korlátra utaló diszkrét szöveges
              tesztüzem-jelzés a "Béta" megjelölés teljes eltávolítása kör
              keretében MEGSZŰNT (lásd a végső riport 6. pontját) — a mezők
              funkciója/state-je ettől VÁLTOZATLAN. */}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Hová?</label>
          {destination.type === "KNOWN_PLACE" || destination.type === "MAP_PICKED" ? (
            <>
              <input
                type="text"
                value={destination.name}
                onChange={(e) => handleDestinationOverrideChange(e.target.value)}
                placeholder="Cím vagy VédettSarok hely"
                disabled={disabled}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
              />
              {destination.type === "KNOWN_PLACE" ? (
                <p className="mt-1 text-xs text-green-700">
                  Úti cél: {destination.name} (a VédettSarok adatbázisából, koordináta alapján — nincs szükség újbóli keresésre).
                </p>
              ) : (
                // Geocoding hardening (2026-09-10) — a térképen kijelölt cél
                // ugyanúgy már ismert koordináta, mint a KNOWN_PLACE ág (13.
                // pont), csak külön szöveggel jelezve az eredetét.
                <p className="mt-1 text-xs text-green-700">
                  Úti cél: {destination.name} (a térképen kijelölt koordináta alapján — nincs szükség újbóli keresésre).
                </p>
              )}
            </>
          ) : (
            <>
              {/* Strukturált címbevitel (3. pont) — MANUAL célhely esetén
                  UGYANAZ a három mező, mint az induló helynél. KNOWN_PLACE
                  (Védett Hely deep link) esetén ez az ág NEM jelenik meg —
                  a hely neve marad az egyetlen, előretöltött mező, nincs
                  újbóli geokódolás. */}
              {/* RESZPONZÍV LAYOUT KORREKCIÓ (2026-09-11) — az origin
                  blokkal szimmetrikus grid-törés, lásd ott a részletes
                  komment (mobil: 1 oszlop; tablet sm: Város+Kerület egy
                  sorban, "Cím vagy hely" saját teljes sorban; desktop lg:
                  visszaáll a hárommezős, egy soros elrendezés). */}
              <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <SettlementAutocomplete
                  id="vedett-route-destination-city"
                  label="Város"
                  value={destination.city}
                  onChange={(value) => updateDestinationManualField("city", value)}
                  placeholder="Budapest"
                  disabled={disabled}
                />
                <div className="min-w-0">
                  <label className="block text-xs text-gray-500">Irányítószám vagy kerület</label>
                  <input
                    type="text"
                    value={destination.districtOrPostalCode}
                    onChange={(e) => updateDestinationManualField("districtOrPostalCode", e.target.value)}
                    placeholder="pl. 1136 vagy XIII. kerület"
                    disabled={disabled}
                    className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                  />
                </div>
                {/* UI/SZÖVEGEZÉSI KORREKCIÓ (2026-09-11) — az origin
                    blokkal szimmetrikus szöveg-változás, lásd ott a
                    komment. A placeholder és a helper text a reszponzív
                    layout javítás körben rövidebbre/tördelhetőre cserélve. */}
                <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                  <label className="block text-xs text-gray-500">Cím vagy hely</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={destination.street}
                      onChange={(e) => updateDestinationManualField("street", e.target.value)}
                      onFocus={() => setShowDestinationStreetSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowDestinationStreetSuggestions(false), 150)}
                      placeholder="pl. Astoria vagy Váci utca 12"
                      disabled={disabled}
                      className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                    />
                    {/* CÍM AUTOCOMPLETE (2026-09-14) — lásd az origin mezőnél
                        lévő komment, ugyanaz a MEGLÉVŐ address-search
                        végpont/hook, csak a célcím mezőre. */}
                    {showDestinationStreetSuggestions && destinationStreetSuggestions.length > 0 && (
                      <ul className="absolute z-10 mt-0.5 w-full rounded border border-gray-200 bg-white text-sm shadow-sm">
                        {destinationStreetSuggestions.map((s, i) => (
                          <li key={i}>
                            <button
                              type="button"
                              onMouseDown={() => {
                                void selectDestinationSuggestion(s);
                                setDestinationStreetSuggestions([]);
                                setShowDestinationStreetSuggestions(false);
                              }}
                              className="block w-full px-2 py-1 text-left hover:bg-gray-50"
                            >
                              {s.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p className="mt-0.5 w-full whitespace-normal break-words text-[11px] text-gray-400">
                    Írhatsz címet vagy helyet is, pl. Déli pályaudvar.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Indulás</label>
          <div className="mt-1 flex items-center gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" checked={when === "now"} onChange={() => setWhen("now")} disabled={disabled} /> Most
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" checked={when === "scheduled"} onChange={() => setWhen("scheduled")} disabled={disabled} /> Időpont
            </label>
            {when === "scheduled" && (
              <input
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                disabled={disabled}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            )}
          </div>
        </div>

        <div
          className="rounded border border-sni-primary/30 bg-sni-primary/5 p-3"
          // Slider UX kompaktálás (2026-09-10, easy-language + kompakt
          // slider sprint) — a LEGSZŰKEBB érintett konténeren (kizárólag
          // ezen a szenzoros/"Ami nekem fontos" blokkon, NEM globálisan a
          // body-n) továbbra is kikapcsoljuk a böngésző scroll-anchoring
          // heurisztikáját, másodlagos védelmi rétegként. A korábbi,
          // bizonyított root cause (per-slider bold/nem-bold label-váltás
          // okozta layout-shift, majd a fizikailag azonosított fókusz-
          // vezérelt scroll-anchoring — lásd releasePreviousTextInputFocus)
          // javításai ettől függetlenül, a maguk helyén megmaradtak; ez a
          // hardening itt nem kerül eltávolításra, mert nincs bizonyított
          // mellékhatása, és a blokk szerkezete (közös fejléc + kompakt
          // sliderek) továbbra is profitálhat belőle.
          style={{ overflowAnchor: "none" }}
        >
          <h3 className="text-sm font-semibold text-sni-text">Ami nekem fontos</h3>
          <p className="mt-1 text-xs text-gray-500">Mi számít neked utazás közben?</p>
          <p className="mt-1 text-xs text-gray-500">
            Állítsd be, hogy neked mi fontos. Így olyan útvonalakat tudunk mutatni, amelyek jobban megfelelnek neked.
          </p>

          {/* Kompakt slider UX sprint (2026-09-10) — a 3 állapot (🙅/🙂/⭐)
              magyarázó skálája KORÁBBAN minden egyes slider alatt
              megismétlődött (6 szempont × 3 label sor), ami mobilon
              feleslegesen nyújtotta meg a blokkot függőlegesen. Mostantól
              ez a közös, fejléc alatti skála CSAK EGYSZER jelenik meg —
              nagyobb, jobban olvasható betűmérettel, mint a korábbi,
              soronként ismételt, kisebb változat — és stabil, azonos
              szélességű grid-cols-3 elrendezést használ (ugyanaz a
              root-cause-szintű, bizonyítottan layout-shift-mentes
              elrendezés, amit korábban minden sliderhez külön-külön
              alkalmaztunk). A skála NEM a ténylegesen kiválasztott
              slider-értékhez van kötve (statikus jelmagyarázat, nem egy
              adott szempont állapota) — a konkrét, aktuális értéket
              minden slideren továbbra is az aria-valuetext adja meg
              screen reader számára (lásd lent), vizuálisan pedig maga a
              csúszka pozíciója. */}
          <div
            className="mt-3 grid grid-cols-3 items-center gap-1 rounded border border-sni-primary/20 bg-white/70 px-2 py-2 text-center text-xs font-medium text-sni-text"
            role="presentation"
          >
            {SENSORY_PRIORITY_LEVELS.map((level) => (
              <span key={level.value} className="flex flex-col items-center justify-center gap-0.5">
                <span aria-hidden="true" className="text-base leading-none">
                  {level.emoji}
                </span>
                {level.label}
              </span>
            ))}
          </div>

          <div className="mt-3 space-y-3">
            {WEIGHT_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs text-gray-700">{label}</label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={weights[key]}
                  disabled={disabled}
                  // Android PWA slider scroll-jump, fizikailag bizonyított
                  // root cause javítása — lásd releasePreviousTextInputFocus
                  // fenti kommentje. Capture fázisban fut, mielőtt a
                  // böngésző natív pointerdown/focus-follow viselkedése
                  // (ami a scroll-jumpot okozná) lefutna. A slider UX
                  // kompaktálás NEM távolította el ezt a javítást.
                  onPointerDownCapture={(e) => releasePreviousTextInputFocus(e.currentTarget)}
                  onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                  aria-valuetext={sensoryPriorityLabel(weights[key])}
                  className="mt-1 w-full"
                />
              </div>
            ))}
          </div>
        </div>

        {/* AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C, spec 4.
            pont) — SZÁNDÉKOSAN KÜLÖN kártya a fenti "Ami nekem fontos"
            (Sensory Engine) blokktól, mert ez EGY KÜLÖN DIMENZIÓ (spec 10.
            pont), nem egy szenzoros szempont. Alapértéke false (nem
            bejelölt) — a jelenlegi routing viselkedés csak akkor változik,
            ha a felhasználó EXPLICIT bejelöli. A szöveg SZÁNDÉKOSAN nem
            ígér semmilyen garanciát a kerekesszékkel/lépcső nélkül való
            használhatóságról (lásd spec 4. pont TILALMI listáját a
            feature riportban) — csak azt állítja, amit a tényleges
            (jelenleg még hiányos) adat bizonyít. */}
        <div className="rounded border border-sni-primary/30 bg-sni-primary/5 p-3">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={stepFreeRequired}
              disabled={disabled}
              onChange={(e) => setStepFreeRequired(e.target.checked)}
              className="mt-0.5 h-5 w-5 flex-shrink-0"
              aria-describedby="vedett-step-free-help"
            />
            <span>
              <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-sni-text">
                <span aria-hidden="true">♿</span> Lépcsőmentes útvonal
              </span>
            </span>
          </label>
          {/* UI/SZÖVEGEZÉSI KORREKCIÓ (2026-09-11, "utolsó, kizárólag
              UI/szövegezési módosítás" kör, 2. pont) — a korábbi, a
              kapcsoló felirata mellett megjelenő kis kiemelt jelvény
              (a "teszt/előzetes verzió" jelölés) ETTŐL a kapcsolótól
              teljesen eltávolítva (a kapcsoló FUNKCIÓJA, a
              stepFreeRequired state és a routing logika VÁLTOZATLAN); a
              korábbi, két külön mondatra bontott disclaimer helyett EGY,
              easy-language, a specifikáció szó szerinti szövegét adó
              figyelmeztetés — SZÁNDÉKOSAN nem ígér garantált
              akadálymentességet, és nem állítja, hogy a liftek aktuális
              működését valós időben ismerjük. */}
          <p id="vedett-step-free-help" className="mt-2 text-xs text-gray-500">
            Az ismert akadálymentességi adatok alapján keresünk. Nem minden megállóról, járműről és útvonalszakaszról
            van teljes adat, és a liftek aktuális működését sem látjuk. Ezért nem tudjuk garantálni, hogy az egész út
            lépcsőmentes.
          </p>
        </div>

        {/* MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1 (2026-09-13) —
            SZÁNDÉKOSAN KÜLÖN kártya, ugyanazt a vizuális/interakciós
            mintázatot követve, mint a fenti "Lépcsőmentes útvonal" kapcsoló
            (min-h-[44px], aria-describedby, mt-0.5 h-5 w-5 checkbox).
            Alapértéke false (nem bejelölt) — a jelenlegi routing viselkedés
            csak akkor változik, ha a felhasználó EXPLICIT bejelöli. A
            kerékpár-típus <select> KIZÁRÓLAG akkor jelenik meg, ha a
            checkbox be van jelölve — ez az ELSŐ enum-select beállítási
            lehetőség ebben a kódbázisban, nincs korábbi minta rá, ezért a
            meglévő checkbox-kártya vizuális nyelvét (border/label/help-szöveg)
            követi, natív <select>-tel. */}
        <div className="rounded border border-sni-primary/30 bg-sni-primary/5 p-3">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={molBubiEnabled}
              disabled={disabled}
              onChange={(e) => setMolBubiEnabled(e.target.checked)}
              className="mt-0.5 h-5 w-5 flex-shrink-0"
              aria-describedby="vedett-mol-bubi-help"
            />
            <span>
              <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-sni-text">
                <span aria-hidden="true">🚲</span> MOL Bubi használata
              </span>
            </span>
          </label>
          <p id="vedett-mol-bubi-help" className="mt-2 text-xs text-gray-500">
            Az útvonaltervezés MOL Bubi kerékpárt is felajánlhat egyes szakaszokra. A kerékpárok elérhetősége
            folyamatosan változhat.
          </p>
          {molBubiEnabled && (
            <div className="mt-3">
              <label htmlFor="vedett-bike-propulsion" className="block text-sm font-medium text-sni-text">
                Kerékpár típusa
              </label>
              <select
                id="vedett-bike-propulsion"
                value={bikePropulsion}
                disabled={disabled}
                onChange={(e) => setBikePropulsion(e.target.value as "ANY" | "HUMAN" | "ELECTRIC_ASSIST")}
                className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
              >
                <option value="ANY">Mindegy</option>
                <option value="HUMAN">Hagyományos kerékpár</option>
                <option value="ELECTRIC_ASSIST">Elektromos kerékpár</option>
              </select>
            </div>
          )}
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <button type="submit" disabled={disabled || loading} className="btn-primary disabled:opacity-50">
          {loading ? "Keresés…" : "Útvonal keresése"}
        </button>

        {/* Kedvenc útvonalak — mentés (Favorites CTA UX sprint, 2026-09-10,
            eredetileg spec 21. pont, most a 7-10. pont szerint nagyobb,
            hangsúlyosabb CTA-vá alakítva). SZÁNDÉKOSAN a preset (origin/
            destination/weights) mentése, SOHA a konkrét kiszámolt journey
            — lásd handleSaveFavorite; a backend/RLS/duplicate-logika
            VÁLTOZATLAN, kizárólag a UI-megjelenés bővült. A ▶ Navigáció
            indítása marad az elsődleges CTA (btn-primary, a submit gomb
            alatt) — ez itt egy ERŐS MÁSODLAGOS CTA, vizuálisan
            visszafogottabb, de mobilon is jól érinthető (≥44px touch
            target, közel teljes szélesség), sosem apró link-jellegű. */}
        <div className="rounded border border-dashed border-gray-300 p-3">
          {favoriteSaveState === "saved" ? (
            // Mentés után (spec 10. pont): a szív ÖNMAGÁBAN nem hordoz
            // információt — mindig szöveg is kíséri; az aria-label a
            // screen reader számára a teljes, kulturált mondatot mondja be.
            <p
              className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-sni-primary/10 px-3 py-2 text-sm font-semibold text-sni-primary"
              role="status"
              aria-label="Ez az útvonal a kedvenceid között van"
            >
              <span aria-hidden="true">♥</span> Kedvenc útvonal
            </p>
          ) : favoriteSaveState === "duplicate" ? (
            <p
              className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-sni-primary/10 px-3 py-2 text-sm font-semibold text-sni-primary"
              role="status"
              aria-label="Ez az útvonal már a kedvenceid között van"
            >
              <span aria-hidden="true">♥</span> Már a kedvenceid között
            </p>
          ) : favoriteSaveState === "open" ? (
            <div className="space-y-2">
              <label className="block text-xs text-gray-500">Kedvenc útvonal neve</label>
              <input
                type="text"
                value={favoriteNameInput}
                onChange={(e) => setFavoriteNameInput(e.target.value)}
                disabled={favoriteSaving}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveFavorite}
                  disabled={favoriteSaving}
                  aria-label={favoriteSaving ? "Kedvenc mentése…" : "Kedvenc útvonal mentése"}
                  aria-busy={favoriteSaving}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-sni-primary/40 bg-white px-4 text-sm font-semibold text-sni-primary shadow-sm disabled:opacity-50"
                >
                  <span aria-hidden="true">♡</span> {favoriteSaving ? "Kedvenc mentése…" : "Mentés"}
                </button>
                <button type="button" onClick={() => setFavoriteSaveState("idle")} disabled={favoriteSaving} className="text-xs text-gray-500 underline disabled:opacity-50">
                  Mégse
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setFavoriteSaveState("open");
                setFavoriteNameInput(`${currentFavoriteOriginLabel()} → ${currentFavoriteDestinationLabel()}`);
                setFavoriteSaveMessage(null);
              }}
              aria-label="Kedvenc útvonal mentése"
              // Mobil UX: legalább 44px magas, jól látható, közel teljes
              // szélességű touch target — NEM apró link (spec 9. pont).
              // Desktopon is jól látható, de nem kötelező full-width.
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-sni-primary/40 bg-white px-4 py-2.5 text-sm font-semibold text-sni-primary shadow-sm sm:w-auto sm:justify-start"
            >
              <span aria-hidden="true">♡</span> Kedvencekhez adom
            </button>
          )}
          {favoriteSaveMessage && favoriteSaveState !== "duplicate" && (
            <p className="mt-1 text-xs text-amber-700">{favoriteSaveMessage}</p>
          )}
        </div>

        {disabled && (
          <p className="text-sm text-amber-700">
            A funkció ki van kapcsolva (feature flag: VEDETT_ROUTE_ENABLED=false).
          </p>
        )}
      </form>

      {result && !result.ok && (
        <div className="mt-4 rounded bg-gray-50 p-3 text-sm text-gray-700">
          <p>{result.message}</p>
          {/* Geocoding hardening (2026-09-10), 10-12. pont — ADDRESS_APPROXIMATE
              KÜLÖN, saját segítő szöveget és CTA-t kap, megkülönböztetve az
              ADDRESS_NOT_FOUND és NO_ROUTE_FOUND állapotoktól (10. pont: "ne
              mosódjon össze").
              GEOCODING GENERALIZÁCIÓ / SZIMMETRIA (2026-09-11, 8-9. pont) — a
              térképes kijelölés CTA-ja MOSTANTÓL mindkét mezőre (origin/
              destination) épül, szimmetrikusan — a szerver egyetlen
              `field`-et ad vissza válaszonként, ezért a két CTA SOHA nem
              jelenik meg egyszerre. Touch target: min. 44px magas (mobil/
              PWA first, 12. pont). */}
          {/* STREET-LEVEL FALLBACK (2026-09-12) — HOUSE_NUMBER_NOT_RESOLVED
              inline figyelmeztetőkártya. NE használ modal ablakot — az
              inline kártya természetesebben illeszkedik a jelenlegi UX-be.
              Két egyértelmű művelet: megerősítés (koordináta elfogadása +
              automatikus re-submit) VAGY módosítás (hibaállapot törlése).
              A routing SOHA nem indul automatikusan — kizárólag a
              "Az utca közelítő helyével tervezek" gomb váltja ki.
              Touch target: min. 44px magas (mobil/PWA first).
              UI/KONTRASZT HOTFIX (2026-09-13) — Preview acceptance során
              jelzett hiba: az elfogadó CTA a `border-sni-primary
              bg-sni-primary ... hover:bg-sni-primary/90` osztályokat
              használta. A `sni-primary` szín NINCS definiálva sehol
              (tailwind.config.ts theme.extend.colors.sni csak bg/blue/
              bluedark/green/greendark/beige/text/warn/brand.teal/
              brand.blue/brand.navy kulcsokat ismer) — Tailwind ezért
              EGYETLEN szabályt sem generált hozzá, a gomb háttere
              transzparens maradt, a `text-white` felirat pedig fehér
              szövegként fehér/átlátszó alapon majdnem láthatatlanná vált
              (UGYANAZ a root cause, mint a DestinationMapPicker.tsx
              tetején dokumentált korábbi "Ez legyen a cél" hibánál — lásd
              ott a részletes elemzést). A gomb SOHA nem volt ténylegesen
              `disabled` (nem volt rajta `disabled` prop) — kizárólag
              vizuálisan tűnt annak.
              Javítás: a `sni-primary` helyett a MEGLÉVŐ, tailwind.config.ts-
              ben már definiált `sni-brand-navy` (#123A5C) valós token,
              fehér szöveggel — SZÁMOLT kontraszt kb. 11.8:1 (WCAG AAA
              szintet is túlteljesíti 14px félkövér szövegen, jóval a
              normál szöveghez előírt 4.5:1 felett). Megfontoltuk a
              megosztott `.btn-primary` osztály (globals.css) újrahasznosítását
              is — ezt használja pl. lejjebb a fő "Tervezem az útvonalat"
              submit gomb is, és a `sni-brand-teal` háttéren valóban
              LÁTHATÓ, nem-transzparens gombot adna —, DE a `.btn-primary`
              ALAP (nem hover) állapotának SZÁMOLT kontrasztja
              (sni-brand-teal #34D8C3 háttéren fehér szöveg) mindössze
              kb. 1.8:1, ami messze a WCAG AA 4.5:1 minimuma alatt marad
              (a 14px, font-semibold szöveg NEM minősül WCAG "nagy
              szövegnek", ahhoz legalább 700-as, azaz explicit "bold"
              súly kellene) — vagyis a `.btn-primary` egy MÁSIK,
              szélesebb körű (az egész appot érintő, ezért a jelenlegi,
              "kizárólag a street-level fallback CTA" hatókörön kívül eső)
              kontraszt-kérdés, amit ez a hotfix explicit NEM módosít
              (lásd a végső riport "root cause" pontját). A most választott
              `sni-brand-navy` megoldás ugyanakkor MEGTARTJA a kártya
              eredeti, "rounded-lg"/"px-4 py-2.5"/"text-sm font-semibold"
              méretezését (vizuálisan illeszkedik a mellette lévő
              "Módosítom a címet" másodlagos gombhoz), és KIZÁRÓLAG ezt a
              két gombot érinti. Emellett MOSTANTÓL explicit
              `disabled={disabled || loading}` a gombon — genuine disabled
              állapot KIZÁRÓLAG akkor, ha a feature-flag (`disabled` prop)
              vagy a ténylegesen folyamatban lévő submit (`loading` state,
              lásd handleSubmit) aktív; a `disabled:opacity-50
              disabled:cursor-not-allowed` KIZÁRÓLAG a natív `disabled`
              attribútum jelenlétekor fut le (Tailwind `disabled:`
              variáns), tehát a normál, elfogadható állapotban a gomb
              100%-ban enabled és teljes kontrasztú marad. */}
          {result.reason === "house_number_not_resolved" && (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">
                A pontos házszámot nem tudtuk azonosítani, de az utcát megtaláltuk.
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Az útvonal ezért az utca közelítő helyéhez vezethet, nem feltétlenül a megadott házszámhoz.
              </p>
              {(result.resolvedStreet || result.resolvedCity) && (
                <p className="mt-1 text-xs text-amber-700">
                  Feloldott utca:{" "}
                  <span className="font-medium">
                    {[result.resolvedStreet, result.resolvedCity].filter(Boolean).join(", ")}
                  </span>
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {result.field === "to" && streetLevelTo && (
                  <button
                    type="button"
                    onClick={handleStreetLevelAcceptTo}
                    disabled={disabled || loading}
                    aria-label="Útvonaltervezés az utca közelítő helyével"
                    className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-sni-brand-navy bg-sni-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sni-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    Az utca közelítő helyével tervezek
                  </button>
                )}
                {result.field === "from" && streetLevelFrom && (
                  <button
                    type="button"
                    onClick={handleStreetLevelAcceptFrom}
                    disabled={disabled || loading}
                    aria-label="Útvonaltervezés az utca közelítő helyével"
                    className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-sni-brand-navy bg-sni-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sni-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    Az utca közelítő helyével tervezek
                  </button>
                )}
                <button
                  type="button"
                  onClick={result.field === "to" ? handleStreetLevelModifyTo : handleStreetLevelModifyFrom}
                  aria-label="Cím módosítása"
                  className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-amber-400 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100 sm:w-auto"
                >
                  Módosítom a címet
                </button>
              </div>
            </div>
          )}
          {result.reason === "address_approximate" && (
            <>
              {result.helperMessage && <p className="mt-1 text-gray-600">{result.helperMessage}</p>}
              {result.field === "from" && approximateOrigin && (
                <button
                  type="button"
                  onClick={() => setOriginMapPickerOpen(true)}
                  aria-label="Induló hely kijelölése a térképen"
                  className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-lg border border-sni-primary/40 bg-white px-4 py-2.5 text-sm font-semibold text-sni-primary shadow-sm sm:w-auto"
                >
                  Induló hely kijelölése a térképen
                </button>
              )}
              {result.field === "to" && approximateDestination && (
                <button
                  type="button"
                  onClick={() => setDestinationMapPickerOpen(true)}
                  aria-label="Célpont kijelölése a térképen"
                  className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-lg border border-sni-primary/40 bg-white px-4 py-2.5 text-sm font-semibold text-sni-primary shadow-sm sm:w-auto"
                >
                  Célpont kijelölése a térképen
                </button>
              )}
            </>
          )}
          {/* GEOCODING KORREKCIÓ (2026-09-11, C4.1, "többértelmű találatok"
              pont) — ADDRESS_AMBIGUOUS egy kis, közvetlenül a mezőhöz
              kapcsolódó választólistát kap, max 5 jelölttel. Origin ÉS
              destination oldalon UGYANAZ a viselkedés (szimmetrikus,
              lásd lent a két, egymástól független ágat). Csak a
              fő név + (ha van) másodlagos helyinformáció jelenik meg —
              SOHA nyers OSM class/type. */}
          {result.reason === "address_ambiguous" && (
            <>
              {result.field === "from" && ambiguousOriginCandidates && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500">Válassz az induló hely jelöltjei közül:</p>
                  <ul role="listbox" aria-label="Induló hely jelöltek" className="mt-1 space-y-1">
                    {ambiguousOriginCandidates.map((candidate, index) => (
                      <li key={`${candidate.lat}-${candidate.lon}-${index}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => handleSelectOriginCandidate(candidate)}
                          className="flex min-h-[44px] w-full items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="font-medium text-gray-800">{candidate.displayName}</span>
                          {candidate.secondary && <span className="ml-1 text-xs text-gray-500">— {candidate.secondary}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={handleDismissOriginCandidates}
                    className="mt-1 text-xs text-gray-500 underline"
                  >
                    Mégsem, új keresés
                  </button>
                </div>
              )}
              {result.field === "to" && ambiguousDestinationCandidates && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500">Válassz a célpont jelöltjei közül:</p>
                  <ul role="listbox" aria-label="Célpont jelöltek" className="mt-1 space-y-1">
                    {ambiguousDestinationCandidates.map((candidate, index) => (
                      <li key={`${candidate.lat}-${candidate.lon}-${index}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => handleSelectDestinationCandidate(candidate)}
                          className="flex min-h-[44px] w-full items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="font-medium text-gray-800">{candidate.displayName}</span>
                          {candidate.secondary && <span className="ml-1 text-xs text-gray-500">— {candidate.secondary}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={handleDismissDestinationCandidates}
                    className="mt-1 text-xs text-gray-500 underline"
                  >
                    Mégsem, új keresés
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {originMapPickerOpen && approximateOrigin && (
        <DestinationMapPicker
          mode="origin"
          initialLat={approximateOrigin.lat}
          initialLon={approximateOrigin.lon}
          onConfirm={handleOriginMapPickerConfirm}
          onCancel={handleOriginMapPickerCancel}
        />
      )}

      {destinationMapPickerOpen && approximateDestination && (
        <DestinationMapPicker
          initialLat={approximateDestination.lat}
          initialLon={approximateDestination.lon}
          onConfirm={handleMapPickerConfirm}
          onCancel={handleMapPickerCancel}
        />
      )}

      {result?.ok && result.journeys.length === 0 && (
        <p className="mt-4 text-sm text-gray-600">Nem található útvonal a megadott feltételekkel.</p>
      )}

      {result?.ok && result.journeys.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-gray-500">
            Adatforrás: BKK · Átlagos adatlefedettség: {Math.round(result.dataCoverage.sensoryConfidenceAvg * 100)}%
            {result.dataCoverage.motisImportedAt && ` · MOTIS adat frissessége: ${new Date(result.dataCoverage.motisImportedAt).toLocaleString("hu-HU")}`}
          </p>

          {/* MOTIS LAST-MILE OFFSET FALLBACK (2026-09-11) — CSAK akkor
              jelenik meg, ha az útvonal a kontrollált last-mile fallback
              keresés miatt került elő (lásd orchestrator.ts). A szöveg
              SZÁNDÉKOSAN nem tartalmaz konkrét métert/sugarat. */}
          {result.expandedAccessSearch && result.accessWarning && (
            <p className="rounded border border-sni-bluedark/30 bg-sni-bluedark/5 p-2 text-xs text-sni-bluedark">
              {result.accessWarning}
            </p>
          )}

          {/* BKK Realtime integráció, 10. pont — GLOBÁLIS, útvonalhoz nem
              kötött service-alert blokk SZÁNDÉKOSAN ELTÁVOLÍTVA a
              felhasználói UI-ból (2026-09-18, Védett Útvonal UX hibajegy):
              a BKK Alerts.pb feedből érkező riasztások válogatás nélkül,
              nyers HTML markuppal (leírás mezőben <ul>/<li>/<strong> stb.)
              jelentek meg, akkor is, ha nem érintik a lenti útvonalakat —
              ez ellentétes a Védett Útvonal UX-ével, különösen autista
              felhasználók számára. A `result.serviceAlerts` adat/backend
              (orchestrator.ts, BKK Alerts.pb lekérés) VÁLTOZATLAN marad —
              KIZÁRÓLAG ennek a globális blokknak a RENDERELÉSE szűnt meg.
              Jövőbeli irány (KÜLÖN feature, MOST NEM implementálva): csak
              a kiválasztott útvonal konkrét járatához/szakaszához
              bizonyíthatóan kapcsolódó riasztás jelenhet meg; bizonytalan
              relevancia esetén nem jelenítünk meg figyelmeztetést. */}

          {result.journeys.map((r, i) => (
            <RankedJourneyCard
              key={i}
              ranked={r}
              isOpen={openIndex === i}
              onToggleMap={() => setOpenIndex((prev) => (prev === i ? null : i))}
              serviceAlerts={result.serviceAlerts}
            />
          ))}
        </div>
      )}
    </div>
  );
}
