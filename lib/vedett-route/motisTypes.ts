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
  lat?: number;
  lon?: number;
  level?: number;
  departure?: string;
  arrival?: string;
  scheduledDeparture?: string;
  scheduledArrival?: string;
}

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

export interface MotisLeg {
  mode: MotisLegMode;
  from: MotisPlace;
  to: MotisPlace;
  duration?: number; // másodperc
  startTime?: string;
  endTime?: string;
  routeShortName?: string;
  routeLongName?: string;
  tripId?: string;
  headsign?: string;
  realTime?: boolean;
  scheduled?: boolean;
  cancelled?: boolean;
  distance?: number; // méter (jellemzően WALK lábakon)
  agencyName?: string;
  // Valós MOTIS válaszban megfigyelt mezők (2026-09-06), térkép-megjelenítéshez:
  legGeometry?: MotisLegGeometry;
  intermediateStops?: MotisPlace[];
  routeColor?: string;
  routeTextColor?: string;
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

export interface MotisPlanResponse {
  from?: MotisPlace;
  to?: MotisPlace;
  direct?: MotisItinerary[];
  itineraries?: MotisItinerary[];
  previousPageCursor?: string;
  nextPageCursor?: string;
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
}

export type MotisPlanResult =
  | { ok: true; data: MotisPlanResponse }
  | { ok: false; reason: "routing_engine_unavailable" | "routing_error" | "timeout"; message: string; status?: number };
