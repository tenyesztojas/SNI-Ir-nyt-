"use client";

import { useEffect, useRef, useState } from "react";
import type { Journey, OrchestratedSearchResult, PersonalizationWeights, RankedJourney, RankingLabel } from "@/lib/vedett-route/types";
import dynamic from "next/dynamic";
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import RestPointQuickAdd, { type RestPointCreatedPayload } from "./RestPointQuickAdd";
import RestStopFlowPanel, { type RestStopMapState } from "./RestStopFlowPanel";
import type { RestPointMarker } from "./VedettUtvonalMap";

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
type RouteOrigin =
  | { type: "MANUAL"; city: string; districtOrPostalCode: string; street: string }
  | { type: "CURRENT_LOCATION"; latitude: number; longitude: number };

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
type RouteDestination =
  | { type: "MANUAL"; city: string; districtOrPostalCode: string; street: string }
  | { type: "KNOWN_PLACE"; name: string; latitude: number; longitude: number };

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

// Validáció (6. pont) — város + (irányítószám VAGY kerület, ugyanaz a
// szabadszöveges mező) + utca mind kötelező; a házszám lehet opcionális,
// mert vannak célok, ahol nincs ismert házszám (ez a mezőn belüli
// szabadszöveg-részlet, nem külön mező, tehát nincs is mit validálni rá
// külön).
function isManualAddressComplete(addr: { city: string; districtOrPostalCode: string; street: string }): boolean {
  return Boolean(addr.city.trim() && addr.districtOrPostalCode.trim() && addr.street.trim());
}

// MapLibre a böngésző window objektumára támaszkodik -> csak kliens
// oldalon tölthető be (SSR alatt nincs window). dynamic({ ssr: false })
// a Next.js hivatalos mintája erre.
const VedettUtvonalMap = dynamic(() => import("./VedettUtvonalMap"), { ssr: false });

type SearchApiResponse =
  | OrchestratedSearchResult
  | { ok: false; reason: string; message: string };

const LABEL_META: Record<RankingLabel, { text: string; className: string }> = {
  FASTEST: { text: "Leggyorsabb", className: "bg-blue-100 text-blue-800" },
  FEWEST_TRANSFERS: { text: "Legkevesebb átszállás", className: "bg-purple-100 text-purple-800" },
  CALMEST: { text: "Legnyugodtabb (becsült)", className: "bg-green-100 text-green-800" },
  LEAST_WALKING: { text: "Legkevesebb gyaloglás", className: "bg-amber-100 text-amber-800" },
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
// a session alatt (+ Pihenőpont gombbal) hozzáadott markereit ÉS a
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
            className="h-[300px] w-full rounded border border-gray-200 sm:h-[360px] md:h-[450px]"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={geo.startWatching} className="btn-secondary text-xs" disabled={geo.isWatching}>
              {geo.isWatching ? "Aktuális hely követése be van kapcsolva" : "Aktuális hely megjelenítése"}
            </button>
            {geo.isWatching && (
              <button type="button" onClick={geo.stopWatching} className="text-xs text-gray-500 underline">
                Követés leállítása
              </button>
            )}
            {geo.status === "denied" && <span className="text-xs text-amber-700">GPS engedély elutasítva.</span>}
            {(geo.status === "unavailable" || geo.status === "timeout") && (
              <span className="text-xs text-amber-700">A jelenlegi hely most nem elérhető — az útvonaltervezés ettől függetlenül működik.</span>
            )}
          </div>

          <RestPointQuickAdd onCreated={(rp) => setSessionRestPoints((points) => [...points, rp])} />

          {/* Sprint E — "Pihenőre van szükségem": az eredeti célt a
              MEGJELENÍTETT (nem feltétlenül az eredeti) itinerary utolsó
              lábának valós MOTIS koordinátáiból származtatjuk — ha a
              felhasználó már folytatta az utat egy pihenő után, a
              displayedJourney már a friss, resume utáni itinerary, és
              ÍGY egy újabb "Pihenőre van szükségem" is a helyes,
              aktuális célra vonatkozik. Ha ez a koordináta hiányzik, a
              panel nem jelenik meg (lásd ORIGINAL_DESTINATION_MISSING,
              Sprint E spec 9. pont). */}
          <RestStopFlowPanel
            originalDestination={originalDestination}
            originalDepartAt={displayedJourney.departureTime}
            geo={geo}
            onRouteResumed={(nextJourney) => setDisplayedJourney(nextJourney)}
            onMapStateChange={setRestStopMapState}
          />
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

  // Kedvenc útvonalak — mentés UI állapota. "idle" -> "☆ Kedvencekhez
  // adom" gomb; "open" -> névadó mini-form; sikeres mentés után "saved" ->
  // "★ Kedvenc útvonal" (a spec 21. pontja szerint).
  const [favoriteSaveState, setFavoriteSaveState] = useState<"idle" | "open" | "saved">("idle");
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
    return origin.street || origin.city || "Induló hely";
  }

  function currentFavoriteDestinationLabel(): string {
    if (destination.type === "KNOWN_PLACE") return destination.name;
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
      const destinationFields =
        destination.type === "KNOWN_PLACE"
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
        setFavoriteSaveMessage(data.message ?? "Ez az útvonal már a kedvenceid között van.");
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
      const originFields =
        origin.type === "CURRENT_LOCATION"
          ? { fromCoordinates: { latitude: origin.latitude, longitude: origin.longitude } }
          : { from: buildStructuredAddress(origin) };
      const destinationFields =
        destination.type === "KNOWN_PLACE"
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
      };
      const res = await fetch("/api/admin/vedett-utvonal/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as SearchApiResponse;
      setResult(data);
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
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-gray-500">Város</label>
              <input
                type="text"
                value={origin.type === "MANUAL" ? origin.city : ""}
                onChange={(e) => updateOriginManualField("city", e.target.value)}
                placeholder="Budapest"
                disabled={disabled}
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Irányítószám vagy kerület</label>
              <input
                type="text"
                value={origin.type === "MANUAL" ? origin.districtOrPostalCode : ""}
                onChange={(e) => updateOriginManualField("districtOrPostalCode", e.target.value)}
                placeholder="pl. 1136 vagy XIII. kerület"
                disabled={disabled}
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Utca, házszám</label>
              <input
                type="text"
                value={origin.type === "MANUAL" ? origin.street : ""}
                onChange={(e) => updateOriginManualField("street", e.target.value)}
                placeholder="pl. Kossuth Lajos utca 12."
                disabled={disabled}
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
              />
            </div>
          </div>
          {/* 7. pont — Budapest BÉTA korlát: diszkrét jelzés a mezők
              közelében, nincs hardcode-olt architektúra (csak egy induló
              mezőérték és egy szöveges megjegyzés). */}
          <p className="mt-1 text-[11px] text-gray-400">Jelenleg Budapesten tesztelhető.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Hová?</label>
          {destination.type === "KNOWN_PLACE" ? (
            <>
              <input
                type="text"
                value={destination.name}
                onChange={(e) => handleDestinationOverrideChange(e.target.value)}
                placeholder="Cím vagy VédettSarok hely"
                disabled={disabled}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
              />
              <p className="mt-1 text-xs text-green-700">
                Úti cél: {destination.name} (a VédettSarok adatbázisából, koordináta alapján — nincs szükség újbóli keresésre).
              </p>
            </>
          ) : (
            <>
              {/* Strukturált címbevitel (3. pont) — MANUAL célhely esetén
                  UGYANAZ a három mező, mint az induló helynél. KNOWN_PLACE
                  (Védett Hely deep link) esetén ez az ág NEM jelenik meg —
                  a hely neve marad az egyetlen, előretöltött mező, nincs
                  újbóli geokódolás. */}
              <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-gray-500">Város</label>
                  <input
                    type="text"
                    value={destination.city}
                    onChange={(e) => updateDestinationManualField("city", e.target.value)}
                    placeholder="Budapest"
                    disabled={disabled}
                    className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Irányítószám vagy kerület</label>
                  <input
                    type="text"
                    value={destination.districtOrPostalCode}
                    onChange={(e) => updateDestinationManualField("districtOrPostalCode", e.target.value)}
                    placeholder="pl. 1136 vagy XIII. kerület"
                    disabled={disabled}
                    className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Utca, házszám</label>
                  <input
                    type="text"
                    value={destination.street}
                    onChange={(e) => updateDestinationManualField("street", e.target.value)}
                    placeholder="pl. Kossuth Lajos utca 12."
                    disabled={disabled}
                    className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                  />
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

        <div className="rounded border border-sni-primary/30 bg-sni-primary/5 p-3">
          <h3 className="text-sm font-semibold text-sni-text">Mennyire fontosak neked ezek a szempontok?</h3>
          <p className="mt-1 text-xs text-gray-500">
            Állítsd be külön-külön, melyik szempont mennyire számít neked az útvonal kiválasztásánál. Ez nem diagnózis-alapú beállítás — csak a te személyes preferenciádat veszi figyelembe, hogy a &quot;Legnyugodtabb&quot; ajánlás jobban illeszkedjen hozzád.
          </p>
          <div className="mt-3 space-y-4">
            {WEIGHT_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs text-gray-700">{label}</label>
                {/* 9-11. pont — a három szenzoros prioritás-állapot emoji +
                    szöveg együtt, SOSEM csak szín alapján megkülönböztetve;
                    az aktuális állapot vizuálisan hangsúlyosabb. Unicode
                    emoji karakterek (nincs külső asset-függőség). */}
                <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                  {SENSORY_PRIORITY_LEVELS.map((level) => (
                    <span
                      key={level.value}
                      className={
                        weights[key] === level.value
                          ? "flex items-center gap-1 font-semibold text-sni-primary"
                          : "flex items-center gap-1 text-gray-400"
                      }
                    >
                      <span aria-hidden="true">{level.emoji}</span>
                      {level.label}
                    </span>
                  ))}
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={weights[key]}
                  disabled={disabled}
                  onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                  aria-valuetext={sensoryPriorityLabel(weights[key])}
                  className="mt-1 w-full"
                />
              </div>
            ))}
          </div>
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <button type="submit" disabled={disabled || loading} className="btn-primary disabled:opacity-50">
          {loading ? "Keresés…" : "Útvonal keresése"}
        </button>

        {/* Kedvenc útvonalak — mentés (spec 21. pont). SZÁNDÉKOSAN a
            preset (origin/destination/weights) mentése, SOHA a konkrét
            kiszámolt journey — lásd handleSaveFavorite. */}
        <div className="rounded border border-dashed border-gray-300 p-3">
          {favoriteSaveState === "saved" ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-sni-primary">
              <span aria-hidden="true">★</span> Kedvenc útvonal
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
              <div className="flex items-center gap-3">
                <button type="button" onClick={handleSaveFavorite} disabled={favoriteSaving} className="btn-secondary text-xs disabled:opacity-50">
                  {favoriteSaving ? "Mentés…" : "Mentés"}
                </button>
                <button type="button" onClick={() => setFavoriteSaveState("idle")} className="text-xs text-gray-500 underline">
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
              className="flex items-center gap-1.5 text-sm font-medium text-sni-primary"
            >
              <span aria-hidden="true">☆</span> Kedvencekhez adom
            </button>
          )}
          {favoriteSaveMessage && <p className="mt-1 text-xs text-amber-700">{favoriteSaveMessage}</p>}
        </div>

        {disabled && (
          <p className="text-sm text-amber-700">
            A funkció ki van kapcsolva (feature flag: VEDETT_ROUTE_ENABLED=false).
          </p>
        )}
      </form>

      {result && !result.ok && (
        <p className="mt-4 rounded bg-gray-50 p-3 text-sm text-gray-700">{result.message}</p>
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
