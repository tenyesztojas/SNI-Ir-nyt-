"use client";

import { useEffect, useRef, useState } from "react";
import type { Journey, OrchestratedSearchResult, PersonalizationWeights, RankedJourney, RankingLabel } from "@/lib/vedett-route/types";
import type { AccessibilityResultStatus } from "@/lib/vedett-route/accessibility";
import dynamic from "next/dynamic";
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import RestPointQuickAdd, { type RestPointCreatedPayload } from "./RestPointQuickAdd";
import RestStopFlowPanel, { type RestStopMapState } from "./RestStopFlowPanel";
import type { RestPointMarker } from "./VedettUtvonalMap";
import { setNavigationModeActive } from "@/lib/pwa/navigationModeSignal";
import type { GeocodePlaceCandidate } from "@/lib/vedett-route/geocode";

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
type RouteOrigin =
  | { type: "MANUAL"; city: string; districtOrPostalCode: string; street: string }
  | { type: "CURRENT_LOCATION"; latitude: number; longitude: number }
  | { type: "MAP_PICKED"; name: string; latitude: number; longitude: number };

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
type RouteDestination =
  | { type: "MANUAL"; city: string; districtOrPostalCode: string; street: string }
  | { type: "KNOWN_PLACE"; name: string; latitude: number; longitude: number }
  | { type: "MAP_PICKED"; name: string; latitude: number; longitude: number };

// Strukturált címbevitel (UX feladat, 2026-09-XX) — a Város / Irányítószám
// vagy kerület / Utca, házszám mezőket a KLIENS külön kezeli (kevesebb
// utcanév-ütközés Budapesten, pl. több "Kossuth utca" is létezik), de a
// szerver felé — és a MEGLÉVŐ geocodeAddress() Nominatim-hívás felé — végül
// EGYETLEN, jól formázott cím-stringet küldünk. NEM hozunk létre új
// wire-formátumot/schemát: lib/vedett-route/schemas.ts `from`/`to` mezői
// VÁLTOZATLANOK maradnak, továbbra is egyszerű stringek — csak a KLIENS
// állítja össze ezt a stringet a strukturált mezőkből, mielőtt elküldi.
// Irányítószám esetén (4 számjegy) a szokásos magyar postai formátumot
// követjük ("1136 Budapest, ..."), kerület esetén a kerület is bekerül a
// stringbe ("Budapest, XIII. kerület, ..."), hogy a geokódolás elé SOHA ne
// kerüljön kevesebb infó, mint amit a felhasználó megadott.
function buildStructuredAddress(addr: { city: string; districtOrPostalCode: string; street: string }): string {
  const city = addr.city.trim();
  const districtOrPostalCode = addr.districtOrPostalCode.trim();
  const street = addr.street.trim();
  const isPostalCode = /^\d{4}$/.test(districtOrPostalCode);
  const cityLine = isPostalCode
    ? [districtOrPostalCode, city].filter(Boolean).join(" ")
    : [city, districtOrPostalCode].filter(Boolean).join(", ");
  return [cityLine, street].filter(Boolean).join(", ");
}

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
}: {
  ranked: RankedJourney;
  isOpen: boolean;
  onToggleMap: () => void;
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

  const startNavigation = () => {
    setNavigationMode(true);
    setFollowMode(true);
    setManualFullscreen(false); // navigationMode már magában fullscreen — nincs szükség a külön manuális flagre is.
    setRestPanelVisible(false); // friss navigációs session mindig ZÁRT pihenőpont-panellel indul — a teljes képernyős térkép az elsődleges nézet.
    geo.startWatching();
  };

  const stopNavigation = () => {
    setNavigationMode(false);
    setFollowMode(false);
    geo.stopWatching();
  };

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
      setNavigationMode(false);
      setFollowMode(false);
      geo.stopWatching();
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

  const currentPosition =
    geo.status === "granted" && geo.latitude !== null && geo.longitude !== null
      ? { latitude: geo.latitude, longitude: geo.longitude }
      : null;

  const lastLeg = displayedJourney.legs.length > 0 ? displayedJourney.legs[displayedJourney.legs.length - 1] : undefined;
  const originalDestination =
    lastLeg && lastLeg.toLat !== undefined && lastLeg.toLon !== undefined
      ? { name: lastLeg.toName, lat: lastLeg.toLat as number, lon: lastLeg.toLon as number }
      : null;

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
        <p className="text-xl font-bold text-sni-text">{journey.totalDurationMinutes} perc</p>
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
        {journey.legs.map((leg, i) => (
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
              {leg.durationMinutes} perc
              {leg.mode === "WALK" && leg.distanceMeters !== undefined ? `, ${leg.distanceMeters} m` : ""}
              {")"}
            </span>
            {leg.mode === "TRANSIT" ? <TransitLegRealtimeNote leg={leg} /> : null}
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {journey.transfers} átszállás · {journey.walkingMinutes} perc gyaloglás
        {journey.walkingDistanceMeters !== undefined ? ` (${journey.walkingDistanceMeters} m)` : ""} · {journey.waitingMinutes} perc várakozás
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
              currentPosition={currentPosition}
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

            {mapFullscreen && (
              <div className="absolute left-2 right-2 top-2 z-10 flex flex-wrap items-center gap-2">
                {navigationMode ? (
                  <button type="button" onClick={stopNavigation} className="btn-secondary bg-white text-xs shadow">
                    ✕ Navigáció befejezése
                  </button>
                ) : (
                  <button type="button" onClick={() => setManualFullscreen(false)} className="btn-secondary bg-white text-xs shadow">
                    ✕ Kis nézet
                  </button>
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
                <span className="text-sm font-semibold text-sni-text">Pihenőpont hozzáadása</span>
                <button
                  type="button"
                  onClick={() => setRestPanelVisible(false)}
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
              <RestPointQuickAdd onCreated={(rp) => setSessionRestPoints((points) => [...points, rp])} />

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
                onRouteResumed={(nextJourney) => setDisplayedJourney(nextJourney)}
                onMapStateChange={setRestStopMapState}
              />
            </div>
          </div>

          {/* Bezárt pihenőpont-panel újranyitása (2026-09-11) — csak
              fullscreen alatt, amíg restPanelVisible === false, jelenik meg.
              Legalább 44x44 px, a meglévő "Pihenőpont hozzáadása" felirattal
              (spec 5. pont: a MEGLÉVŐ funkcióval nyitható vissza) — a
              kattintás KIZÁRÓLAG a `restPanelVisible` UI-state-et állítja
              true-ra, nem indít semmilyen új keresést/state-machine
              eseményt (a REST_REQUESTED-et továbbra is csak a
              RestStopFlowPanel saját, explicit "Pihenőre van szükségem"
              gombja indítja, lásd stateMachine.ts CANCELLABLE_STATES fenti
              kommentje). Jobb alsó sarok, a biztonsági (safe-area) sáv
              figyelembevételével, hogy notch/browser chrome alá sose
              kerüljön. */}
          {mapFullscreen && !restPanelVisible && (
            <button
              type="button"
              onClick={() => setRestPanelVisible(true)}
              aria-label="Pihenőpont hozzáadása"
              className="fixed right-3 z-[60] flex min-h-[44px] items-center rounded-full bg-white px-4 text-sm font-medium text-sni-text shadow-2xl"
              style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
            >
              Pihenőpont hozzáadása
            </button>
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
    // Védett Hely "Navigálj oda" integráció — ha a felhasználó a KNOWN_PLACE
    // módban előretöltött célnév mezőbe kézzel ír, KNOWN_PLACE AZONNAL
    // megszűnik (SOHA nem használunk elavult/rossz koordinátát a routing
    // kéréshez ezután), és a begépelt szöveg a strukturált cím "Utca,
    // házszám" mezőjébe kerül kiindulásként — a Város alapértelmezetten
    // Budapest, az Irányítószám vagy kerület mező üresen indul, hogy a
    // felhasználó kitölthesse.
    setDestination({ type: "MANUAL", city: "Budapest", districtOrPostalCode: "", street: value });
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
      const originFields =
        origin.type === "CURRENT_LOCATION"
          ? { fromCoordinates: { latitude: origin.latitude, longitude: origin.longitude } }
          : origin.type === "MAP_PICKED"
            ? { fromCoordinates: { latitude: origin.latitude, longitude: origin.longitude }, fromName: origin.name }
            : { from: buildStructuredAddress(origin) };
      // Geocoding hardening (2026-09-10) — a MAP_PICKED cél (a felhasználó
      // a térképen jelölte ki, egy APPROXIMATE geokódolási találat után,
      // lásd DestinationMapPicker.tsx) UGYANÚGY toCoordinates/toName-en
      // megy, mint a KNOWN_PLACE (Védett Hely deep link) cél — 13. pont:
      // "ne geokódold újra". Csak a MANUAL ág épít cím-stringet.
      const destinationFields =
        destination.type === "KNOWN_PLACE" || destination.type === "MAP_PICKED"
          ? {
              toCoordinates: { latitude: destination.latitude, longitude: destination.longitude },
              toName: destination.name,
            }
          : { to: buildStructuredAddress(destination) };
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
    } catch {
      setResult({ ok: false, reason: "routing_engine_unavailable", message: "Az útvonaltervezés átmenetileg nem érhető el." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-sni-text">Útvonalkeresés</h2>

      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
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
            <div className="min-w-0">
              <label className="block text-xs text-gray-500">Város</label>
              <input
                type="text"
                value={origin.type === "MANUAL" ? origin.city : ""}
                onChange={(e) => updateOriginManualField("city", e.target.value)}
                placeholder="Budapest"
                disabled={disabled}
                className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
              />
            </div>
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
            <div className="min-w-0 sm:col-span-2 lg:col-span-1">
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
              <label className="block text-xs text-gray-500">Cím vagy hely</label>
              <input
                type="text"
                value={origin.type === "MANUAL" ? origin.street : ""}
                onChange={(e) => updateOriginManualField("street", e.target.value)}
                placeholder="pl. Astoria vagy Váci utca 12"
                disabled={disabled}
                className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
              />
              <p className="mt-0.5 w-full whitespace-normal break-words text-[11px] text-gray-400">
                Írhatsz címet vagy helyet is, pl. Déli pályaudvar.
              </p>
            </div>
          </div>
          {/* 7. pont — Budapest BÉTA korlát: diszkrét jelzés a mezők
              közelében, nincs hardcode-olt architektúra (csak egy induló
              mezőérték és egy szöveges megjegyzés). */}
          <p className="mt-1 text-[11px] text-gray-400">Jelenleg Budapesten tesztelhető.</p>
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
                <div className="min-w-0">
                  <label className="block text-xs text-gray-500">Város</label>
                  <input
                    type="text"
                    value={destination.city}
                    onChange={(e) => updateDestinationManualField("city", e.target.value)}
                    placeholder="Budapest"
                    disabled={disabled}
                    className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                  />
                </div>
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
                <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                  {/* UI/SZÖVEGEZÉSI KORREKCIÓ (2026-09-11) — az origin
                      blokkal szimmetrikus szöveg-változás, lásd ott a
                      komment. A placeholder és a helper text a reszponzív
                      layout javítás körben rövidebbre/tördelhetőre cserélve. */}
                  <label className="block text-xs text-gray-500">Cím vagy hely</label>
                  <input
                    type="text"
                    value={destination.street}
                    onChange={(e) => updateDestinationManualField("street", e.target.value)}
                    placeholder="pl. Astoria vagy Váci utca 12"
                    disabled={disabled}
                    className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                  />
                  <p className="mt-0.5 w-full whitespace-normal break-words text-[11px] text-gray-400">
                    Írhatsz címet vagy helyet is, pl. Déli pályaudvar.
                  </p>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">Jelenleg Budapesten tesztelhető.</p>
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

          {/* BKK Realtime integráció, 10. pont: a riasztásokat SZÁNDÉKOSAN
              nem egyes útvonalakhoz rendelve, hanem keresés-szinten, valós
              BKK Alerts.pb adatból jelenítjük meg (lásd types.ts
              OrchestratedSearchResult.serviceAlerts dokumentációja). */}
          {result.serviceAlerts.length > 0 && (
            <div className="space-y-1 rounded border border-amber-200 bg-amber-50 p-2">
              <p className="text-xs font-semibold text-amber-800">Aktuális BKK riasztások (nem feltétlenül érintik a lenti útvonalakat):</p>
              {result.serviceAlerts.map((a) => (
                <p key={a.id} className="text-xs text-amber-700">
                  ⚠️ {a.header}
                  {a.description ? ` — ${a.description}` : ""}
                </p>
              ))}
            </div>
          )}

          {result.journeys.map((r, i) => (
            <RankedJourneyCard
              key={i}
              ranked={r}
              isOpen={openIndex === i}
              onToggleMap={() => setOpenIndex((prev) => (prev === i ? null : i))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
