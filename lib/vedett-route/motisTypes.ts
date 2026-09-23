// MOTIS /api/v6/plan valós válasz-alakjának minimális, védekező típusai.
//
// FONTOS: ezeket a mezőket a valós, futó MOTIS instance (ghcr.io/motis-project/motis
// @sha256:2a99b5f811f1694570914359417b82641eb622c9228b24aa6cfb2e863282f547) tényleges
// válaszának manuális ellenőrzésével és a hivatalos openapi.yaml specifikációjával
// (https://github.com/motis-project/motis/blob/master/openapi.yaml) állapítottuk meg.
// Minden mező opcionális, ahol nem voltunk 100%-ban biztosak a jelenlétében — soha nem
// feltételezünk mezőt, amit nem láttunk valós válaszban vagy a hivatalos specifikációban.

export interface MotisPlace {
  name?: string;
  stopId?: string;
  // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C2) — a VPS runtime-
  // teszttel BIZONYÍTOTTAN megfigyelt mező (lásd a feature riport "MOTIS
  // válasz audit" szakasza): a klaszter/anya-állomás MOTIS-azonosítója
  // (pl. "bkkgtfs_CS056215"), amikor a stopId egy annál specifikusabb
  // gyerek-megállóra mutat. Opcionális — nem minden MotisPlace-nek van
  // szülője.
  parentId?: string;
  lat?: number;
  lon?: number;
  level?: number;
  departure?: string;
  arrival?: string;
  scheduledDeparture?: string;
  scheduledArrival?: string;
}

// MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1.1 HARDENING (2026-09-13) —
// KORÁBBI KÖR KORREKCIÓJA: a Round 8-ban itt spekulatív, MOTIS
// /api/v6/plan válaszban SOHA nem bizonyított "vehiclesAvailable"/
// "vehicleDocksAvailable" mezőket vezettünk be a MotisPlace-en. A
// felhasználó explicit javította: a /api/v6/plan RENTAL leg from/to
// MotisPlace-e ilyen mezőt NEM bizonyítottan tartalmaz, ezért ezt
// SZÁNDÉKOSAN eltávolítottuk — production type-ban nem modellezünk
// spekulatív MOTIS mezőt. A ténylegesen BIZONYÍTOTT elérhetőségi adatforrás
// a KÜLÖN GET /api/v1/rentals végpont (station name, isRenting,
// isReturning, numVehiclesAvailable, vehicleTypesAvailable.bike/ebike) —
// ennek bekötése (külön hívás/polling/cache-stratégia) EXPLICIT Phase 2
// feladat, ebben a körben NEM valósítjuk meg. Lásd orchestrator.ts mapLeg()
// és a UI (VedettUtvonalSearchForm.tsx) — egyik sem jelenít meg semmilyen
// darabszámot RENTAL lábon, amíg ez nincs bekötve.

export type MotisLegMode =
  | "WALK"
  | "BIKE"
  | "CAR"
  | "TRANSIT"
  | "BUS"
  | "TRAM"
  | "SUBWAY"
  | "RAIL"
  | "FERRY"
  | "COACH"
  | "AIRPLANE"
  | "ODM"
  | "FLEX"
  // MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1 (2026-09-13) — a
  // felhasználó saját, éles VPS MOTIS v2.11.2 + GBFS "mol-bubi" provider
  // ellen futtatott staging integrációja BIZONYÍTOTTA a RENTAL mód
  // elfogadását/visszaadását (health check rt=true/gbfs=true, station
  // inventory, direct RENTAL routing, teljes intermodális WALK→RENTAL→
  // WALK→BUS/REGIONAL_RAIL/SUBWAY→WALK). Ez a projekt ELSŐ RENTAL-módú
  // MOTIS integrációja — nincs helyi fixture/korábbi audit-jegyzet a
  // PONTOS leg JSON-alakról, ezért a mapLeg() (orchestrator.ts) a
  // meglévő, más módoknál is bizonyítottan jelen lévő generikus mezőkből
  // (from/to name, duration, distance, legGeometry) építi fel a "MOL Bubi"
  // megjelenítést, SOHA nem feltételezve RENTAL-specifikus mezőt, amit nem
  // láttunk (lásd lent MotisLeg spekulatív mezői).
  | "RENTAL"
  | string;

// Map/GPS/Rest Points sprint (2026-09-07): a legGeometry mezőt egy VALÓS,
// futó MOTIS válaszban figyeltük meg (2026-09-06-i élő teszt, lásd
// docs/vedett-route/MAP_GPS_RESTPOINT_SPRINT.md "MOTIS geometria audit"
// szakasza) — Google encoded-polyline formátum, "precision" mezővel
// (jelen esetben 6). Nem feltételezés, ellenőrzött nyers JSON alapján.
export interface MotisLegGeometry {
  points: string; // encoded polyline (Google polyline algorithm)
  precision: number; // jellemzően 6 (10^-6 fok pontosság)
  length?: number; // koordináta-pontok száma (csak informatív)
}

// AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C2, spec 2. pont) — a
// pinned MOTIS v2.11.2 WHEELCHAIR pedestrian profil melletti VPS runtime-
// teszttel BIZONYÍTOTTAN megfigyelt érték-halmaz. FONTOS (spec 1. pont,
// kötelező alkalmazásoldali hard filter): a WHEELCHAIR profil NEM szűri ki
// megbízhatóan a NOT_ACCESSIBLE transit legeket — a runtime tesztben egy
// route 41 leg NOT_ACCESSIBLE-ként tért vissza MÉG WHEELCHAIR módban is.
// Ez a mező tehát csak egy BEMENET a hard filterhez (lásd accessibility.ts),
// SOSEM önmagában elégséges bizonyíték az útvonal akadálymentességére.
export type MotisWheelchairAccessible = "ACCESSIBLE" | "NOT_ACCESSIBLE" | string;

export interface MotisLeg {
  mode: MotisLegMode;
  from: MotisPlace;
  to: MotisPlace;
  duration?: number; // másodperc
  startTime?: string;
  endTime?: string;
  routeShortName?: string;
  routeLongName?: string;
  // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C2) — a VPS runtime-
  // teszttel bizonyítottan megfigyelt routeId (pl. "bkkgtfs_5400") — a GTFS
  // route_id-vel a motisIdNormalization.ts normalizeMotisRouteId()-jén
  // keresztül köthető össze. Opcionális — nem minden mód (pl. WALK) ad
  // routeId-t.
  routeId?: string;
  tripId?: string;
  headsign?: string;
  realTime?: boolean;
  scheduled?: boolean;
  cancelled?: boolean;
  distance?: number; // méter (jellemzően WALK lábakon)
  agencyName?: string;
  agencyId?: string;
  // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C2, spec 2. pont) —
  // a WHEELCHAIR pedestrian profil melletti VPS runtime-teszttel
  // BIZONYÍTOTTAN megfigyelt, transit legenkénti jármű-akadálymentességi
  // mező. Opcionális — csak stepFreeRequired=true (WHEELCHAIR profil)
  // mellett figyeltük meg, normál (FOOT) kérésnél NEM feltételezzük a
  // jelenlétét.
  wheelchairAccessible?: MotisWheelchairAccessible;
  // Valós MOTIS válaszban megfigyelt mezők (2026-09-06), térkép-megjelenítéshez:
  legGeometry?: MotisLegGeometry;
  intermediateStops?: MotisPlace[];
  routeColor?: string;
  routeTextColor?: string;
  // MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1 (2026-09-13) — SPEKULATÍV,
  // MÉG NEM VERIFIKÁLT mező: a bérelt jármű hajtás-típusa (GBFS
  // "propulsion_type"-szerű mező) egy RENTAL legen. NEM feltételezzük a
  // jelenlétét — ha a MOTIS válasz nem tartalmazza, a UI egy semleges
  // "MOL Bubi kerékpár" feliratra esik vissza (SOHA nem hibás/kitalált
  // "elektromos"/"hagyományos" cimkét). Élő VPS válasz-audit Phase 2
  // feladat a pontos mezőnév/alak megerősítésére.
  rentalVehiclePropulsionType?: "HUMAN" | "ELECTRIC_ASSIST" | string;
}

// VPS → Staging Integration Gate (2026-09-07): a scheduledStartTime,
// scheduledEndTime, realTime és cancelled mezőket a ténylegesen üzembe
// állított VPS MOTIS (pinned v2.11.2, valós BKK realtime ingest-tel) élő
// válaszában figyeltük meg — kontrollteszt ugyanarra a 70-es járatra,
// realtimeMode=OFF vs REALTIME összehasonlítással (lásd
// docs/vedett-route/VPS_STAGING_INTEGRATION_GATE.md "E) Realtime mezők"
// szakasza). Nem feltételezés — valós, megfigyelt itinerary-szintű mezők.
export interface MotisItinerary {
  duration: number; // másodperc
  startTime: string;
  endTime: string;
  // Menetrend szerinti (statikus GTFS) indulás/érkezés — csak akkor van
  // jelen, ha a MOTIS realtime feed-je ténylegesen be van töltve. Ha ez a
  // mező hiányzik, NEM feltételezzük, hogy megegyezik startTime/endTime-mal.
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  // true, ha LEGALÁBB egy láb ténylegesen realtime-korrigált adaton alapul.
  realTime?: boolean;
  cancelled?: boolean;
  transfers: number;
  legs: MotisLeg[];
}

// MOTIS LAST-MILE OFFSET FALLBACK (2026-09-11) — a `debugOutput` mezőt (és
// ezen belül az `n_dest_offsets`/`n_start_offsets` diagnosztikai
// számlálókat) EGYETLEN valós MOTIS válaszban sem figyeltük meg még
// KÖZVETLENÜL ebben a projektben — nincs róla helyi fixture vagy korábbi
// audit-jegyzet (lásd a hotfix riportban dokumentált audit). A mező jelenléte
// és pontos alakja NEM verifikált sem a hivatalos openapi.yaml specifikációval
// (nincs helyi másolata a repóban), sem valós válasz-mintával — ezért itt
// KIZÁRÓLAG védekezően, teljesen opcionálisan van feltüntetve, és az
// orchestrator.ts a jelenlétét SOHA nem feltételezi kritikus döntési
// pontként (lásd orchestrator.ts fallback-trigger logikája: a tényleges
// gate mindig az itinerary-szám, a debugOutput csak KIEGÉSZÍTŐ, ha
// történetesen jelen van, diagnosztikai logolásra).
export interface MotisDebugOutput {
  n_dest_offsets?: number;
  n_start_offsets?: number;
}

export interface MotisPlanResponse {
  from?: MotisPlace;
  to?: MotisPlace;
  direct?: MotisItinerary[];
  itineraries?: MotisItinerary[];
  previousPageCursor?: string;
  nextPageCursor?: string;
  debugOutput?: MotisDebugOutput;
}

export interface MotisPlanParams {
  fromPlace: string; // "lat,lon" vagy stopId
  toPlace: string;
  time?: string; // ISO datetime
  arriveBy?: boolean;
  numItineraries?: number;
  maxItineraries?: number;
  maxTransfers?: number;
  transitModes?: string[]; // pl. ["TRANSIT"] vagy ["BUS","TRAM","RAIL"] (SUBWAY kizárva "calmer" stratégiához)
  searchWindow?: number; // másodperc
  algorithm?: "RAPTOR" | "PONG" | "TB";
  timeout?: number; // másodperc
  // MOTIS LAST-MILE OFFSET FALLBACK (2026-09-11) — a gyalogos last-mile
  // hozzáférési keresési sugár méterben. KIZÁRÓLAG az orchestrator.ts egyetlen,
  // kontrollált fallback-hívásában kap értéket (radius=1500) — a normál
  // (elsődleges) MOTIS kérés SOHA nem állítja be ezt a mezőt, lásd
  // orchestrator.ts searchVedettRoutes() fejléc-kommentje.
  radius?: number; // méter
  // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C2, spec 1/6. pont)
  // — VPS RUNTIME-TESZTTEL BIZONYÍTOTT MOTIS v2.11.2 paraméterek (NEM
  // találgatás — lásd a feature riport "MOTIS v2.11.2 runtime" szakasza):
  // ezek a pinned production MOTIS instance-on ténylegesen elfogadottak,
  // és a válasz bizonyítottan ELTÉR a normál FOOT routingtól. KIZÁRÓLAG az
  // orchestrator.ts állítja be, KIZÁRÓLAG amikor request.stepFreeRequired
  // === true (lásd searchVedettRoutes()) — normál keresésben SOHA nincs
  // jelen egyik sem.
  pedestrianProfile?: "WHEELCHAIR" | string;
  useRoutedTransfers?: boolean;
  timetableView?: boolean;
  // MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1 (2026-09-13, spec 2. pont)
  // — a felhasználó saját, éles VPS MOTIS v2.11.2 + GBFS "mol-bubi" provider
  // ellen futtatott staging integrációja BIZONYÍTOTTA ezeket a paramétereket
  // (health check rt=true/gbfs=true, station inventory, HUMAN/
  // ELECTRIC_ASSIST propulsion típusok, direct RENTAL routing, teljes
  // intermodális WALK→RENTAL→WALK→BUS/REGIONAL_RAIL/SUBWAY→WALK). KIZÁRÓLAG
  // az orchestrator.ts állítja be, KIZÁRÓLAG amikor
  // request.molBubiEnabled === true (lásd searchVedettRoutes()) — normál
  // (Bubi nélküli) keresésben EGYIK sem szerepel, a kérés BYTE-RA
  // változatlan marad (ugyanaz a mintázat, mint a STEP_FREE_MOTIS_PARAMS-nál
  // fent). Phase 1 KIZÁRÓLAG a "pre-transit" (indulási oldali) rental utat
  // engedélyezi — a directModes=RENTAL/postTransitModes=RENTAL (célállomás
  // oldali vagy tisztán bicikli-only útvonal) SZÁNDÉKOSAN NINCS bekötve
  // ebben a körben, egy későbbi fázis feladata.
  preTransitModes?: string[];
  preTransitRentalProviders?: string[];
  preTransitRentalFormFactors?: string[];
  preTransitRentalPropulsionTypes?: string[];
}

export type MotisPlanResult =
  | { ok: true; data: MotisPlanResponse }
  | { ok: false; reason: "routing_engine_unavailable" | "routing_error" | "timeout"; message: string; status?: number };

// SPRINT 9 (DIRECT TRIP REALTIME LOOKUP, 2026-09-23) — GET /api/v6/trip
// paraméterei/válasza. Ez a végpont EGY, MÁR AZONOSÍTOTT fizikai trip élő
// realtime állapotát adja vissza (tripId szerint), NEM egy route-tervezési
// keresés — lásd lib/vedett-route/realtimeRefresh/extractUpdates.ts fejléce
// a TELJES trip span vs. user saját sub-leg-je közti, élő VPS-teszttel
// bizonyított különbségről.
//
// A tripId-nek a MOTIS válaszban (pl. egy /api/v6/plan leg.tripId
// mezőjében) TÉNYLEGESEN megfigyelt, TELJES, normalizált formát kell
// követnie — ezt a kliens/route handler SOHA nem alakítja át, nem rövidíti,
// nem egészíti ki: pontosan azt az értéket küldi tovább, amit a JourneyLeg
// már ma is tárol (lásd orchestrator.ts mapLeg() tripId mezője).
export interface MotisTripParams {
  tripId: string;
}

// A GET /api/v6/trip válasz ALAKJA megegyezik a /plan egy itinerary-jével
// (lásd MOTIS forráskód: journey_to_response() ugyanazt a konvertert
// használja mindkét végponton) — újrafelhasználjuk a MÁR bizonyított
// MotisItinerary típust, nincs duplikált/spekulatív alak.
export type MotisTripResponse = MotisItinerary;

export type MotisTripResult =
  | { ok: true; data: MotisTripResponse }
  | {
      ok: false;
      // "not_found": a MOTIS 4xx-et adott ismeretlen/érvénytelen tripId-re
      // (pl. rövid/rossz formátumú tripId esetén megfigyelt "invalid
      // tripId tag" hiba) — a hívó ezt is, és minden más nem-ok esetet is
      // KIZÁRÓLAG csendes no-op-ként kezel, soha nem hibaüzenetként a
      // felhasználó felé, soha nem "cancelled"-ként.
      reason: "not_found" | "routing_engine_unavailable" | "routing_error" | "timeout";
      message: string;
      status?: number;
    };
