"use client";

// Sprint E — "Pihenőre van szükségem" folyamat, UI réteg.
//
// A meglévő Sprint E Preparation Gate állapotgépére épül (lásd
// lib/vedett-route/restStopFlow/stateMachine.ts) — ez a komponens
// KIZÁRÓLAG az orkesztrációt végzi: GPS lekérdezés, a 3 új API végpont
// hívása (nearby / route-to-rest-point / resume), és a state machine
// dispatch-elése az eredménnyel. Maga a döntési logika (mely átmenet
// engedélyezett, mikor) MARAD a pure reducerben — ez a komponens sosem
// dönt helyette, csak eseményeket küld neki.
//
// UI ELV (spec 10. pont): a meglévő Védett Útvonal vizuális rendszerére
// épül (ugyanazok a Tailwind osztályok, mint VedettUtvonalSearchForm.tsx /
// RestPointQuickAdd.tsx), nincs új redesign. A pihenőpont-forrás (USER/
// VEDETT_SAROK/OSM) SOSEM jelenik meg technikai zsargonként a felhasználó
// felé.
//
// PRIVACY: a GPS pozíciót ez a komponens ugyanúgy a szülőtől kapott
// useGeolocation()-eredményen (lásd lib/hooks/useGeolocation.ts) keresztül
// használja — nem hoz létre második GPS-watch-ot, nem logolja/perzisztálja
// a koordinátákat semmilyen hívásban.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { UseGeolocationResult } from "@/lib/hooks/useGeolocation";
import type { Journey } from "@/lib/vedett-route/types";
import type { JourneyLegForGeometry } from "@/lib/vedett-route/geometry";
import {
  createInitialRestStopFlowContext,
  transitionRestStopFlow,
} from "@/lib/vedett-route/restStopFlow/stateMachine";
import type {
  OriginalDestination,
  RankedRestPoint,
  RestStopFlowContext,
  RestStopFlowErrorReason,
  RestStopFlowEvent,
} from "@/lib/vedett-route/restStopFlow/types";
import type { RestPoint } from "@/lib/rest-points/types";
import type { RestPointMarker } from "./VedettUtvonalMap";
import {
  categoryLabelFor,
  REST_POINT_QUICK_FILTERS,
  applyRestPointQuickFilter,
  type RestPointQuickFilterKey,
} from "@/lib/vedett-route/restStopFlow/categoryLabels";

// Egyetlen megosztott térkép (UX módosítás, 2026-09-09): ez a komponens a
// korábbi verzióban SAJÁT dynamic(() => import("./VedettUtvonalMap"))
// importtal rendelkezett, és két helyen (REST_POINTS_READY,
// NAVIGATING_TO_REST_POINT) MAGA hozott létre egy második, FÜGGETLEN
// MapLibre instance-ot — ez okozta a nem kívánt "külön pihenőpont-térkép"
// UX-et. A javítás szerint EBBEN a fájlban TILOS MapLibre térképet
// létrehozni: ez a panel KIZÁRÓLAG állapotot (state), gyorsszűrőt, listát
// és CTA-kat kezel (lásd az architektúra-elvárást), a térkép-releváns
// DERIVED állapotot pedig az onMapStateChange callback propon keresztül
// jelenti a szülőnek (VedettUtvonalSearchForm.tsx RankedJourneyCard), ami
// az EGYETLEN <VedettUtvonalMap> instance-ot birtokolja.
export interface RestStopMapState {
  // false = a Pihenőre van szükségem folyamat nem fed rá a térképre — a
  // szülő a saját (eredeti célhoz tartozó) alap-nézetét mutatja
  // változatlanul, ez a típus többi mezője figyelmen kívül hagyható.
  active: boolean;
  // Ha megadva, a szülő EZEKET a lábakat rajzolja ki a saját (eredeti)
  // legs helyett — pl. a kiválasztott pihenőponthoz vezető útvonal.
  // undefined esetén a szülő a saját legs-jét mutatja (az eredeti
  // útvonal/journey SOSEM tűnik el csak azért, mert a folyamat aktív).
  legsOverride?: JourneyLegForGeometry[];
  restPoints: RestPointMarker[];
  selectedRestPointId: string | null;
  onSelectRestPoint?: (id: string) => void;
  // true = a currentPosition + restPoints köré illesztett, szűk nézet
  // (VedettUtvonalMap restPointFocusMode props) legyen aktív, ahelyett,
  // hogy a route geometriájára fitBounds-olna.
  focusOnRestPoints: boolean;
}

const INACTIVE_MAP_STATE: RestStopMapState = {
  active: false,
  legsOverride: undefined,
  restPoints: [],
  selectedRestPointId: null,
  onSelectRestPoint: undefined,
  focusOnRestPoints: false,
};

const ERROR_COPY: Record<RestStopFlowErrorReason, string> = {
  GPS_PERMISSION_DENIED: "A helymeghatározás engedélye el lett utasítva. Engedélyezd a böngésződben, majd próbáld újra.",
  GPS_UNAVAILABLE: "A jelenlegi helyed most nem határozható meg.",
  GPS_TIMEOUT: "A helymeghatározás túl sokáig tartott.",
  NO_REST_POINTS_FOUND: "A közelben most nem találtunk megfelelő pihenőpontot.",
  REST_POINTS_PARTIALLY_UNAVAILABLE: "Néhány közeli hely most nem tölthető be — próbáld meg kicsit később újra.",
  REST_POINT_LOAD_FAILED: "A pihenőpontok betöltése sikertelen volt.",
  // Sprint E.2 hotfix (2026-09-08) — külön szöveg a "a pont nem oldható
  // fel" (NOT_FOUND) és a "van pont, de nincs hozzá útvonal" (NO_ROUTE)
  // esetre, lásd lib/vedett-route/restStopFlow/types.ts.
  REST_POINT_NOT_FOUND: "A kiválasztott pihenőpont már nem érhető el. Válassz egy másikat.",
  REST_POINT_NO_ROUTE: "Nem található útvonal a kiválasztott pihenőponthoz.",
  ROUTE_SERVICE_TIMEOUT: "Az útvonaltervezés túl sokáig tartott.",
  ROUTE_SERVICE_UNAVAILABLE: "Az útvonaltervezés jelenleg nem érhető el.",
  ROUTE_SERVICE_AUTH_FAILURE: "Az útvonaltervezés jelenleg nem érhető el.",
  MALFORMED_ROUTE_RESPONSE: "A routing motor váratlan választ adott.",
  NETWORK_LOST: "A hálózati kapcsolat megszakadt.",
  REROUTE_FAILED: "Nem sikerült új útvonalat tervezni az eredeti célig.",
  ORIGINAL_DESTINATION_MISSING: "Az eredeti célállomás elveszett — kérlek, indíts új keresést.",
  INVALID_STATE_TRANSITION: "Váratlan állapot történt a folyamatban.",
};

function explainRestPoint(ranked: RankedRestPoint): string {
  const parts: string[] = [];
  if (ranked.distanceMeters !== undefined) parts.push(`${ranked.distanceMeters} m`);
  const rp = ranked.restPoint;
  if (rp.seating === true) parts.push("van ülőhely");
  if (rp.toilet === true) parts.push("van mosdó");
  if (rp.quietSpace === true) parts.push("csendes tér");
  if (rp.indoors === true) parts.push("beltéri");
  if (rp.outdoors === true && rp.indoors !== true) parts.push("kültéri");
  if (rp.purchaseRequired === false) parts.push("vásárlás nélkül is használható");
  return parts.length > 0 ? parts.join(" • ") : "Nincs megadva további részlet.";
}

// Sprint E.1 hotfix (2026-09-08) — admin/preview-only diagnosztikai
// blokk: pontosan megmutatja, MELYIK forrás (user/vedettSarok/osm) volt
// elérhető és MILYEN hibaosztály (errorCode) okozta az elérhetetlenséget,
// hogy staging bugreportnál ne kelljen találgatni (spec: "NE találgass").
// Ez a végpont eleve requireVedettRouteAccess() (admin_only) mögött van
// (lásd app/api/vedett-route/rest-stops/nearby/route.ts), ezért ez a
// blokk NEM sérti a "a user UI ne mutasson technikai provider nevet"
// elvet — a polírozott banner-szövegek (ERROR_COPY, "expandedSearch"/
// "discoveryPartial" fenti üzenetei) továbbra is technikai néven
// mentesek maradnak, ez a <details> csak egy összecsukott, opcionális
// admin-panel.
function DiscoverySourcesDebug({ sources }: { sources?: RestStopFlowContext["discoverySources"] }) {
  if (!sources) return null;
  const rows: Array<{ key: string; status: { ok: boolean; reason?: string; errorCode?: string } }> = [
    { key: "user", status: sources.user },
    { key: "vedettSarok", status: sources.vedettSarok },
    { key: "osm", status: sources.osm },
  ];
  return (
    <details className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
      <summary className="cursor-pointer select-none font-medium">Diagnosztika (admin)</summary>
      <ul className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <li key={row.key} className="font-mono">
            {row.key}: {row.status.ok ? "ok" : "unavailable"}
            {!row.status.ok && row.status.errorCode ? ` (errorCode: ${row.status.errorCode})` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}

type DiscoverySourcesSnapshot = RestStopFlowContext["discoverySources"];

async function postJson<T>(
  url: string,
  body: unknown
): Promise<
  | { ok: true; data: T; sources?: DiscoverySourcesSnapshot }
  | { ok: false; reason?: string; message?: string; sources?: DiscoverySourcesSnapshot }
> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    // Sprint E.1 hotfix (2026-09-08) — a "sources" mező (ha jelen van a
    // válaszban) admin/preview debug célra mindkét ágon (siker és hiba)
    // továbbadásra kerül, lásd RestStopFlowContext.discoverySources.
    if (data.ok) return { ok: true, data, sources: data.sources };
    return { ok: false, reason: data.reason, message: data.message, sources: data.sources };
  } catch {
    return { ok: false, reason: "NETWORK_LOST", message: "A hálózati kapcsolat megszakadt." };
  }
}

function isKnownReason(reason: string | undefined): reason is RestStopFlowErrorReason {
  return Boolean(reason && reason in ERROR_COPY);
}

// UX HOTFIX (2026-09-13, hatodik kör) — "ADD módból is tűnjön el a másik
// funkció CTA-ja". Az ötödik kör CSAK a szülőben (VedettUtvonalSearchForm)
// vezette be a stabil restPanelMode-ot, és azzal KIZÁRÓLAG a RestPointQuickAdd
// (és a sticky fejléc cím) láthatóságát döntötte el — ez a RestStopFlowPanel
// SAJÁT belső idle-chooser gombját ("Pihenőre van szükségem") NEM érintette,
// ezért az ADD módban (külső "Pihenőpont hozzáadása") megnyitott panelben is
// tovább látszott ez a gomb az add UI ALATT — ez volt a jelentett duplikáció.
// A javítás: a panel MOST MÁR explicit propként megkapja a módot, és a SAJÁT
// belső idle-chooser gombját (és az ahhoz tartozó "keresés folyamatban"
// köztes szöveget) ez alapján rendereli — lásd lent a render törzsében.
export type RestPanelMode = "SEARCH" | "ADD";

export interface RestStopFlowPanelProps {
  originalDestination: OriginalDestination | null;
  originalDepartAt: string;
  geo: UseGeolocationResult;
  onRouteResumed?: (journey: Journey) => void;
  // Egyetlen megosztott térkép (UX módosítás, 2026-09-09) — lásd a fenti
  // RestStopMapState kommentjét. Opcionális, hogy a régi (map nélküli)
  // használat is triviálisan kompatibilis maradjon egy jövőbeli tesztben.
  onMapStateChange?: (state: RestStopMapState) => void;
  // Desktop UX korrekció (2026-09-13) — lehetővé teszi, hogy a szülő
  // (VedettUtvonalSearchForm) egy KÜLÖN, közvetlenül elérhető desktop CTA-ból
  // ("Pihenőre van szükségem", a fullscreen térkép fölötti lebegő gombsorban)
  // UGYANAZT a REQUEST_REST eseményt indítsa, amit korábban (ötödik körig)
  // ennek a panelnek egy saját belső gombja dispatch-elt. SZÁNDÉKOSAN egy
  // számláló/token, nem egy boolean flag: minden increment egyetlen,
  // egyszeri "kérést" jelent — az idempotens hatás a token VÁLTOZÁSÁRA
  // reagál (lásd lent), így ugyanaz az érték kétszeri átadása nem indít
  // duplikált eseményt. Ez KIZÁRÓLAG UI-wiring — nem ad hozzá új
  // routing/state logikát, nem hoz létre új eseményt/átmenetet a
  // stateMachine.ts-ben, és nem érinti a GPS-snapshot/nearby-discovery
  // logikát (lásd a REST_REQUESTED effektet lent — az továbbra is
  // változatlanul fut).
  externalRequestRestToken?: number;
  // UX HOTFIX (2026-09-13, hatodik kör) — a panel MOST MÁR explicit,
  // KÖTELEZŐ propként kapja meg a szülő (VedettUtvonalSearchForm) stabil
  // restPanelMode állapotát. Ez KIZÁRÓLAG azt dönti el, hogy a panel SAJÁT
  // belső idle-chooser UI-ja (a korábbi "Pihenőre van szükségem" belső gomb
  // és a hozzá tartozó köztes "keresés folyamatban" szöveg) megjelenjen-e —
  // SEMMILYEN más belső logikát (state machine, GPS-snapshot, nearby-
  // discovery, route-to-rest-point, resume) nem érint, azok a mode-tól
  // FÜGGETLENÜL, a saját ctx.state-ük szerint futnak/renderelődnek tovább,
  // hogy egy már folyamatban lévő flow a panel bezárása/mód-váltása után is
  // zavartalanul folytatódhasson a háttérben (lásd a korábbi körök "Bezárás"
  // dokumentációját). Mindkét explicit módban ("SEARCH" ÉS "ADD") a saját
  // belső döntő-gomb NEM jelenik meg — a döntés MINDIG a szülőben, a két
  // külső CTA (handleRequestRestCta/handleAddRestPointCta) valamelyikének
  // megnyomásával történik, mielőtt ez a panel egyáltalán látható lenne.
  mode: RestPanelMode;
}

export default function RestStopFlowPanel({
  originalDestination,
  originalDepartAt,
  geo,
  onRouteResumed,
  onMapStateChange,
  externalRequestRestToken,
  mode,
}: RestStopFlowPanelProps) {
  const [ctx, setCtx] = useState<RestStopFlowContext | null>(null);
  const [restPointJourney, setRestPointJourney] = useState<Journey | null>(null);
  const [resumeJourney, setResumeJourney] = useState<Journey | null>(null);
  const resumeGpsRequestedRef = useRef(false);
  // Sprint E.1 — csak UI-állapot: a gyorsszűrő és a marker<->kártya
  // szinkronhoz kijelölt (de még NEM "Ide megyek"-kel véglegesített)
  // pihenőpont. Egyik sem érinti az állapotgépet (stateMachine.ts) — ezek
  // tisztán megjelenítési döntések.
  const [quickFilter, setQuickFilter] = useState<RestPointQuickFilterKey>("ALL");
  const [highlightedRestPointId, setHighlightedRestPointId] = useState<string | null>(null);

  // Context (újra)inicializálása, amikor van ismert eredeti cél — de csak
  // ha még nincs aktív folyamat (a "prev ?? ..." védi meg attól, hogy egy
  // szülő-újrarender elveszítse a folyamatban lévő állapotot).
  useEffect(() => {
    if (originalDestination) {
      setCtx((prev) => prev ?? createInitialRestStopFlowContext(originalDestination, originalDepartAt));
    } else {
      setCtx(null);
      setRestPointJourney(null);
      setResumeJourney(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalDestination?.lat, originalDestination?.lon, originalDestination?.name, originalDepartAt]);

  function dispatch(event: RestStopFlowEvent) {
    setCtx((prev) => {
      if (!prev) return prev;
      const result = transitionRestStopFlow(prev, event);
      return result.context;
    });
  }

  // Desktop UX korrekció (2026-09-13), a hatodik körben pontosítva — a
  // MEGLÉVŐ REQUEST_REST eseményt egyetlen, megosztott függvényen keresztül
  // indítjuk, hogy a tényleges dispatch-hívás a forrásban PONTOSAN EGYSZER
  // szerepeljen (lásd fullscreen-rest-point-integration.test.ts "C" tesztje).
  // A hatodik kör óta ennek EGYETLEN belépési pontja van: a fenti
  // externalRequestRestToken-effekt, amit a szülő "Pihenőre van szükségem"
  // KÜLSŐ CTA-ja indít (handleRequestRestCta -> restRequestToken increment).
  // A panel korábbi (ötödik körig létező) SAJÁT belső idle-chooser gombja
  // megszűnt — lásd lent a render törzsét és a "mode" prop dokumentációját.
  function triggerRequestRest() {
    dispatch({ type: "REQUEST_REST" });
  }

  // REST_REQUESTED: szükségünk van egy ismert pozícióra a rangsoroláshoz.
  useEffect(() => {
    if (!ctx || ctx.state !== "REST_REQUESTED") return;
    if (geo.status === "granted" && geo.latitude !== null && geo.longitude !== null) {
      // Request-storm hotfix (2026-09-10) — a GPS-koordinátát ITT, EGYETLEN
      // alkalommal olvassuk le és adjuk át pillanatképként (snapshot) az
      // állapotgépnek. Ettől a ponttól a REST_POINTS_LOADING hatás már nem a
      // live geo.latitude/geo.longitude-ot figyeli, hanem ezt a rögzített
      // ctx.requestOrigin-t — így egy watchPosition alatti GPS-tick nem
      // indít újra hívást (lásd stateMachine.ts + types.ts kommentjei).
      dispatch({ type: "START_LOADING_REST_POINTS", requestOrigin: { latitude: geo.latitude, longitude: geo.longitude } });
      return;
    }
    if (geo.status === "denied") {
      dispatch({ type: "REST_POINTS_LOAD_FAILED", reason: "GPS_PERMISSION_DENIED", message: "A helymeghatározás engedélye el lett utasítva." });
      return;
    }
    if (geo.status === "timeout") {
      dispatch({ type: "REST_POINTS_LOAD_FAILED", reason: "GPS_TIMEOUT", message: "A helymeghatározás túl sokáig tartott." });
      return;
    }
    if (geo.status === "unavailable" || geo.status === "error") {
      dispatch({ type: "REST_POINTS_LOAD_FAILED", reason: "GPS_UNAVAILABLE", message: "A jelenlegi hely nem határozható meg." });
      return;
    }
    if (geo.status === "idle") {
      geo.requestOnce();
    }
    // "requesting" közben nincs teendő, várjuk a következő státuszváltást.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.state, geo.status, geo.latitude, geo.longitude]);

  // REST_POINTS_LOADING: a /nearby végpont hívása.
  //
  // Request-storm hotfix (2026-09-10) — KORÁBBAN ez a hatás [ctx?.state,
  // geo.latitude, geo.longitude]-tól függött. Mivel Navigation Mode alatt a
  // watchPosition folyamatosan frissíti geo.latitude/geo.longitude-ot, és a
  // ctx.state csak a fetch LEZÁRULÁSAKOR vált át READY/ERROR-ra, minden
  // egyes GPS-tick (ami a fetch függvényben van, tehát MÉG NEM zárult le)
  // egy ÚJ effect-futást és ezzel egy ÚJ /nearby hívást indított — ez volt a
  // production request-storm (tömeges overpass_timeout/http_429, majd a
  // saját rate limiter 429-je) gyökere. A JAVÍTÁS: a hatás mostantól
  // KIZÁRÓLAG a REST_REQUESTED átmenetkor egyszer rögzített
  // ctx.requestOrigin-től függ (ami a state-tel EGYÜTT, egyetlen dispatch-
  // ben áll be, és a REST_POINTS_LOADING állapotban belül SOSEM változik) —
  // nem a live geo.latitude/geo.longitude-tól. Így egy explicit "Pihenőre
  // van szükségem" kattintás pontosan EGY /nearby hívást indít, függetlenül
  // attól, hány GPS-tick érkezik a hívás közben.
  useEffect(() => {
    if (!ctx || ctx.state !== "REST_POINTS_LOADING" || !ctx.requestOrigin) return;
    const { latitude, longitude } = ctx.requestOrigin;
    let cancelled = false;
    (async () => {
      const result = await postJson<{ restPoints: RankedRestPoint[]; expandedSearch?: boolean; partial?: boolean }>(
        "/api/vedett-route/rest-stops/nearby",
        { currentPosition: { lat: latitude, lon: longitude } }
      );
      if (cancelled) return;
      if (result.ok) {
        dispatch({
          type: "REST_POINTS_LOADED",
          restPoints: result.data.restPoints,
          expandedSearch: result.data.expandedSearch,
          discoveryPartial: result.data.partial,
          sources: result.sources,
        });
      } else {
        dispatch({
          type: "REST_POINTS_LOAD_FAILED",
          reason: isKnownReason(result.reason) ? result.reason : "REST_POINT_LOAD_FAILED",
          message: result.message,
          sources: result.sources,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.state, ctx?.requestOrigin?.latitude, ctx?.requestOrigin?.longitude]);

  // ROUTING_TO_REST_POINT: a /route-to-rest-point végpont hívása.
  useEffect(() => {
    if (!ctx || ctx.state !== "ROUTING_TO_REST_POINT" || !ctx.selectedRestPoint) return;
    if (geo.latitude === null || geo.longitude === null) {
      dispatch({ type: "ROUTE_TO_REST_POINT_FAILED", reason: "GPS_UNAVAILABLE", message: "A jelenlegi hely nem határozható meg." });
      return;
    }
    let cancelled = false;
    // Sprint E.2 hotfix (2026-09-08) — a szerver mostantól forrás-függő
    // módon oldja fel a kiválasztott pontot (lásd resolveRestPoint.ts),
    // ezért a puszta id helyett a normalizált RestPoint forrás-releváns
    // mezőit küldjük el. USER/VEDETT_SAROK esetén a szerver a saját (RLS-
    // scoped, illetve rest_point_eligible-szűrt) adatforrásából olvassa
    // vissza a koordinátát/nevet — az itt küldött name/latitude/longitude
    // ezekre a forrásokra a szerver oldalon EGYSZERŰEN eldobott extra
    // mező (lásd schemas.ts restPointRefSchema — nem authoritative).
    // Kizárólag OSM esetén authoritative ez a payload (lásd
    // resolveRestPoint.ts "AUTHORITATIVE SOURCE" szakasza).
    const selectedRestPointRef = {
      source: ctx.selectedRestPoint.source,
      id: ctx.selectedRestPoint.id,
      name: ctx.selectedRestPoint.name,
      latitude: ctx.selectedRestPoint.latitude,
      longitude: ctx.selectedRestPoint.longitude,
    };
    (async () => {
      const result = await postJson<{ journey: Journey }>("/api/vedett-route/rest-stops/route-to-rest-point", {
        currentPosition: { lat: geo.latitude, lon: geo.longitude },
        restPoint: selectedRestPointRef,
      });
      if (cancelled) return;
      if (result.ok) {
        setRestPointJourney(result.data.journey);
        dispatch({ type: "ROUTE_TO_REST_POINT_READY" });
      } else {
        dispatch({
          type: "ROUTE_TO_REST_POINT_FAILED",
          reason: isKnownReason(result.reason) ? result.reason : "REST_POINT_NO_ROUTE",
          message: result.message,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.state, ctx?.selectedRestPoint, geo.latitude, geo.longitude]);

  // RESUME_REQUESTED: friss GPS pozíció kérése, mielőtt elindulna az
  // újratervezés (spec 8. pont: "friss current position").
  useEffect(() => {
    if (!ctx || ctx.state !== "RESUME_REQUESTED") {
      resumeGpsRequestedRef.current = false;
      return;
    }
    if (!resumeGpsRequestedRef.current) {
      resumeGpsRequestedRef.current = true;
      geo.requestOnce();
      return;
    }
    if (geo.status === "granted" && geo.latitude !== null && geo.longitude !== null) {
      dispatch({ type: "START_REROUTE" });
    } else if (geo.status === "denied") {
      dispatch({ type: "REROUTE_FAILED", reason: "GPS_PERMISSION_DENIED", message: "A helymeghatározás engedélye el lett utasítva." });
    } else if (geo.status === "timeout") {
      dispatch({ type: "REROUTE_FAILED", reason: "GPS_TIMEOUT", message: "A helymeghatározás túl sokáig tartott." });
    } else if (geo.status === "unavailable" || geo.status === "error") {
      dispatch({ type: "REROUTE_FAILED", reason: "GPS_UNAVAILABLE", message: "A jelenlegi hely nem határozható meg." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.state, geo.status, geo.latitude, geo.longitude]);

  // REROUTING_TO_ORIGINAL_DESTINATION: a /resume végpont hívása — MINDIG
  // friss itinerary, sosem a pihenőpont előtti újrafelhasználása (8. pont).
  useEffect(() => {
    if (!ctx || ctx.state !== "REROUTING_TO_ORIGINAL_DESTINATION") return;
    if (!ctx.originalDestination) {
      dispatch({ type: "REROUTE_FAILED", reason: "ORIGINAL_DESTINATION_MISSING", message: "Az eredeti célállomás elveszett." });
      return;
    }
    if (geo.latitude === null || geo.longitude === null) {
      dispatch({ type: "REROUTE_FAILED", reason: "GPS_UNAVAILABLE", message: "A jelenlegi hely nem határozható meg." });
      return;
    }
    let cancelled = false;
    const destination = ctx.originalDestination;
    (async () => {
      const result = await postJson<{ journey: Journey }>("/api/vedett-route/rest-stops/resume", {
        currentPosition: { lat: geo.latitude, lon: geo.longitude },
        originalDestination: destination,
      });
      if (cancelled) return;
      if (result.ok) {
        setResumeJourney(result.data.journey);
        onRouteResumed?.(result.data.journey);
        dispatch({ type: "REROUTE_SUCCEEDED" });
      } else {
        dispatch({
          type: "REROUTE_FAILED",
          reason: isKnownReason(result.reason) ? result.reason : "REROUTE_FAILED",
          message: result.message,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.state]);

  // Egyetlen megosztott térkép (UX módosítás, 2026-09-09) — a fenti
  // állapotgép-vezérelt effektek MELLETT (nem helyett) ez az effekt
  // KIZÁRÓLAG a térkép szempontjából releváns, levezetett állapotot
  // jelenti a szülőnek, minden állapotátmenet után. Szándékosan primitív/
  // stabil forrásokból épül (ctx.state, a rankedRestPoints/selectedRestPoint
  // referenciák — ezek a state machine-ben immutable módon cserélődnek,
  // nem mutálódnak renderenként, lásd stateMachine.ts), hogy ne generáljon
  // felesleges re-fitBounds-ot a szülő VedettUtvonalMap-jában.
  useEffect(() => {
    if (!onMapStateChange) return;
    if (!ctx) {
      onMapStateChange(INACTIVE_MAP_STATE);
      return;
    }

    switch (ctx.state) {
      case "ROUTE_ACTIVE":
      case "REST_REQUESTED":
      case "REST_POINTS_LOADING": {
        // Még nincs megjeleníthető pihenőpont-jelölt (GPS/keresés
        // folyamatban) — a térkép marad a normál (bázis) nézeten.
        onMapStateChange(INACTIVE_MAP_STATE);
        break;
      }

      case "REST_POINTS_READY":
      case "REST_POINT_SELECTED":
      case "ROUTING_TO_REST_POINT": {
        // A2/A4: az eredeti route változatlanul látszik (legsOverride
        // nincs megadva -> a szülő a saját legs-jét mutatja), MELLETTE a
        // discovery-jelöltek markerei, currentPosition + jelöltek köré
        // illesztett szűk nézettel (focusOnRestPoints).
        onMapStateChange({
          active: true,
          legsOverride: undefined,
          restPoints: (ctx.rankedRestPoints ?? []).map((r) => ({
            id: r.restPoint.id,
            name: r.restPoint.name,
            latitude: r.restPoint.latitude,
            longitude: r.restPoint.longitude,
            category: r.restPoint.category,
          })),
          selectedRestPointId: ctx.selectedRestPoint?.id ?? highlightedRestPointId,
          onSelectRestPoint: setHighlightedRestPointId,
          focusOnRestPoints: true,
        });
        break;
      }

      case "NAVIGATING_TO_REST_POINT":
      case "AT_REST_POINT":
      case "RESUME_REQUESTED":
      case "REROUTING_TO_ORIGINAL_DESTINATION": {
        // A5: "Ide megyek" után a SAME map a pihenőponthoz vezető
        // route-ot mutatja (legsOverride) — az eredeti cél (originalDestination)
        // a ctx-ben megmarad, csak a KIRAJZOLT geometria vált ideiglenesen.
        // A RESUME/REROUTING közben (a "Folytatom az utat" -> friss GPS ->
        // /resume hívás alatt) még ugyanezt a (pihenőponthoz vezető) útvonalat
        // mutatjuk tovább, hogy ne villanjon vissza/tűnjön el semmi, amíg az
        // új route meg nem érkezik.
        onMapStateChange({
          active: true,
          legsOverride: restPointJourney?.legs,
          restPoints: ctx.selectedRestPoint
            ? [
                {
                  id: ctx.selectedRestPoint.id,
                  name: ctx.selectedRestPoint.name,
                  latitude: ctx.selectedRestPoint.latitude,
                  longitude: ctx.selectedRestPoint.longitude,
                  category: ctx.selectedRestPoint.category,
                },
              ]
            : [],
          selectedRestPointId: ctx.selectedRestPoint?.id ?? null,
          onSelectRestPoint: undefined,
          focusOnRestPoints: false,
        });
        break;
      }

      case "ROUTE_RESUMED": {
        // G: "Folytatom az utat" -> a SAME map visszaáll az eredeti cél
        // route-jára. A friss journey-t az onRouteResumed callback már
        // átadta a szülőnek (lásd a REROUTING_TO_ORIGINAL_DESTINATION
        // effektet feljebb) -> a szülő saját legs-je már az ÚJ,
        // újratervezett útvonal, ezért itt legsOverride nélkül, markerek
        // nélkül jelentünk vissza normál (nem pihenőpont-fókusz) nézetet.
        onMapStateChange(INACTIVE_MAP_STATE);
        break;
      }

      case "ERROR": {
        onMapStateChange(INACTIVE_MAP_STATE);
        break;
      }

      default:
        onMapStateChange(INACTIVE_MAP_STATE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ctx?.state,
    ctx?.rankedRestPoints,
    ctx?.selectedRestPoint,
    restPointJourney,
    highlightedRestPointId,
    onMapStateChange,
  ]);

  // Desktop UX korrekció (2026-09-13) — a külső "Pihenőre van szükségem"
  // CTA (externalRequestRestToken) a megosztott triggerRequestRest
  // függvényen keresztül ugyanazt a REQUEST_REST eseményt indítja, mint a
  // lenti belső gomb.
  //
  // UX HOTFIX (2026-09-13, negyedik kör) — "duplikált CTA/idle-flash"
  // javítás. ROOT CAUSE: a külső gomb handlere (handleRequestRestCta a
  // szülőben) ugyanabban a React-batch-ben nyitja meg a bottom sheetet ÉS
  // increment-eli az externalRequestRestToken-t — de a triggerRequestRest()
  // hívás korábban egy `useEffect`-ben (a commit/festés UTÁN futó
  // effektben) történt, ezért a panel ELŐSZÖR a régi
  // ctx.state === "ROUTE_ACTIVE" (idle) állapotával festődött ki — ekkor
  // MÉG látszott a lenti "Pihenőre van szükségem" belső gomb (a szülőben
  // pedig a MINDIG jelen lévő RestPointQuickAdd trigger gomb) —, és csak
  // EGY React-effektciklussal KÉSŐBB váltott át REST_REQUESTED-re. Ez adta
  // a felhasználó által észlelt "villanó" kétgombos idle/menü nézetet.
  //
  // JAVÍTÁS: `awaitingExternalRequestRest` egy VALÓDI (nem ref-alapú) React
  // state, amit egy `useLayoutEffect` állít be — ez a DOM-commit UTÁN, de a
  // böngésző FESTÉSE ELŐTT, SZINKRON módon fut le, így a React még a
  // festés előtt újra-renderel az "awaiting" flaggel, a felhasználó SOSEM
  // lát egy köztes, kifestett idle keretet. Amíg awaitingExternalRequestRest
  // igaz: (1) a lenti belső "Pihenőre van szükségem" gomb NEM renderelődik,
  // (2) a "Pihenőpontok keresése…" loading szöveg MÁR megjelenik. A TÉNYLEGES
  // dispatch — a triggerRequestRest() hívás, ami a MEGLÉVŐ REQUEST_REST
  // eseményt indítja — VÁLTOZATLANUL egy külön (nem layout-) effektben fut,
  // amint ctx.state === "ROUTE_ACTIVE": nincs új állapotgép-esemény, nincs
  // duplikált GPS/nearby-logika, csak a RENDER-idle elrejtve, amíg a
  // MEGLÉVŐ effekt-lánc át nem veszi az irányítást.
  //
  // UX HOTFIX (2026-09-13, ötödik kör) — a korábbi, transzens "pending"
  // callback (ami ezt az átmeneti állapotot jelentette a szülőnek, hogy a
  // RestPointQuickAdd triggert elrejtse) NYUGDÍJAZVA: a szülő immár a STABIL `restPanelMode`
  // state-tel, a kattintás PILLANATÁBAN dönt a RestPointQuickAdd
  // láthatóságáról (lásd VedettUtvonalSearchForm.tsx), így erre a
  // transzens, csak eddig a pillanatig élő jelzésre nincs többé szükség.
  // Az `awaitingExternalRequestRest` mechanizmus MAGA (a panel SAJÁT idle
  // gombjának villanás-mentesítése) továbbra is változatlanul szükséges és
  // aktív marad.
  const lastExternalRequestRestTokenRef = useRef<number | undefined>(externalRequestRestToken);
  const [awaitingExternalRequestRest, setAwaitingExternalRequestRest] = useState(false);

  useLayoutEffect(() => {
    if (externalRequestRestToken === undefined) return;
    if (lastExternalRequestRestTokenRef.current === externalRequestRestToken) return;
    lastExternalRequestRestTokenRef.current = externalRequestRestToken;
    setAwaitingExternalRequestRest(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRequestRestToken]);

  useEffect(() => {
    if (!awaitingExternalRequestRest) return;
    if (ctx?.state !== "ROUTE_ACTIVE") return;
    setAwaitingExternalRequestRest(false);
    triggerRequestRest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingExternalRequestRest, ctx?.state]);

  if (!ctx) return null;

  return (
    <div className="mt-4 rounded border border-sni-primary/30 bg-sni-primary/5 p-3">
      {/* UX HOTFIX (2026-09-13, hatodik kör) — "ADD módból is tűnjön el a
          másik funkció CTA-ja". A panel SAJÁT belső idle-chooser gombja
          ("Pihenőre van szükségem", korábban ctx.state === "ROUTE_ACTIVE" &&
          !awaitingExternalRequestRest alatt renderelődött) TELJESEN
          ELTÁVOLÍTVA — mindkét explicit módban (SEARCH ÉS ADD) a döntés MÁR
          a szülőben, a két külső CTA valamelyikének megnyomásával
          megtörtént, mielőtt ez a panel egyáltalán látható lenne, ezért
          egy MÁSODIK, redundáns belső döntő-gomb (ami korábban az ADD-módú
          add UI ALATT is megjelent, duplikálva a funkciót) feleslegessé
          vált. Ez NEM egy state-machine-eseményt vagy GPS/nearby-logikát
          távolít el — a triggerRequestRest() megosztott függvény (és az
          ÁLTALA indított, egyetlen MEGLÉVŐ REQUEST_REST esemény) VÁLTOZATLANUL
          megvan, és változatlanul KIZÁRÓLAG a lenti externalRequestRestToken-
          effektből fut, amint a szülő SEARCH módra vált. */}

      {(ctx.state === "REST_REQUESTED" ||
        ctx.state === "REST_POINTS_LOADING" ||
        (mode === "SEARCH" && ctx.state === "ROUTE_ACTIVE" && awaitingExternalRequestRest)) && (
        <p className="text-sm text-gray-600">Pihenőpontok keresése a közeledben…</p>
      )}

      {ctx.state === "REST_POINTS_READY" && ctx.rankedRestPoints && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-sni-text">Válassz pihenőpontot</h3>

          {/* Egyetlen megosztott térkép (UX módosítás, 2026-09-09): a
              jelölt pihenőpontok markerei mostantól a szülő
              (VedettUtvonalSearchForm.tsx RankedJourneyCard) EGYETLEN
              <VedettUtvonalMap>-jén jelennek meg, az onMapStateChange
              callbacken keresztül jelentett RestStopMapState alapján — ez
              a panel maga nem hoz létre/rajzol térképet, lásd a fájl tetején
              lévő magyarázatot. A lista/gyorsszűrők a térkép ALATT
              maradnak. */}

          {ctx.expandedSearch && (
            <p className="text-xs text-gray-500">Kicsit távolabb is kerestünk.</p>
          )}
          {ctx.discoveryPartial && (
            <p className="text-xs text-amber-700">Néhány közeli hely most nem tölthető be.</p>
          )}
          <DiscoverySourcesDebug sources={ctx.discoverySources} />

          <div className="flex flex-wrap gap-1">
            {REST_POINT_QUICK_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setQuickFilter(filter.key)}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  quickFilter === filter.key
                    ? "border-sni-primary bg-sni-primary/10 text-sni-primary"
                    : "border-gray-300 text-gray-600"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {(() => {
            const filteredRestPoints = applyRestPointQuickFilter(
              ctx.rankedRestPoints.map((r) => r.restPoint),
              quickFilter
            );
            const filteredIds = new Set(filteredRestPoints.map((rp) => rp.id));
            const visibleRanked = ctx.rankedRestPoints.filter((r) => filteredIds.has(r.restPoint.id));

            if (visibleRanked.length === 0) {
              return <p className="text-xs text-gray-500">Ezzel a szűrővel nincs találat a közelben.</p>;
            }

            return visibleRanked.map((ranked) => {
              const label = categoryLabelFor(ranked.restPoint);
              return (
                <div
                  key={ranked.restPoint.id}
                  onMouseEnter={() => setHighlightedRestPointId(ranked.restPoint.id)}
                  onMouseLeave={() => setHighlightedRestPointId((prev) => (prev === ranked.restPoint.id ? null : prev))}
                  className={`flex items-center justify-between rounded border p-2 ${
                    highlightedRestPointId === ranked.restPoint.id
                      ? "border-sni-primary bg-sni-primary/5"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-sni-text">
                      <span aria-hidden="true">{label.emoji}</span> {ranked.restPoint.name}
                    </p>
                    <p className="text-xs text-gray-500">{explainRestPoint(ranked)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "SELECT_REST_POINT", restPoint: ranked.restPoint })}
                    className="btn-primary text-xs"
                  >
                    Ide megyek
                  </button>
                </div>
              );
            });
          })()}

          <button type="button" onClick={() => dispatch({ type: "CANCEL_REST_STOP" })} className="text-xs text-gray-500 underline">
            Mégsem
          </button>
        </div>
      )}

      {ctx.state === "REST_POINT_SELECTED" && ctx.selectedRestPoint && (
        <div className="space-y-2">
          <p className="text-sm text-sni-text">
            Kiválasztva: <span className="font-semibold">{ctx.selectedRestPoint.name}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => dispatch({ type: "START_ROUTE_TO_REST_POINT" })} className="btn-primary text-xs">
              Indulás
            </button>
            <button type="button" onClick={() => dispatch({ type: "CANCEL_REST_STOP" })} className="text-xs text-gray-500 underline">
              Mégsem
            </button>
          </div>
        </div>
      )}

      {ctx.state === "ROUTING_TO_REST_POINT" && <p className="text-sm text-gray-600">Útvonal tervezése a pihenőponthoz…</p>}

      {ctx.state === "NAVIGATING_TO_REST_POINT" && restPointJourney && ctx.selectedRestPoint && (
        <div className="space-y-2">
          <p className="text-sm text-sni-text">
            Úton a(z) <span className="font-semibold">{ctx.selectedRestPoint.name}</span> pihenőpont felé — kb.{" "}
            {restPointJourney.totalDurationMinutes} perc.
          </p>
          {/* Egyetlen megosztott térkép (UX módosítás, 2026-09-09): a
              pihenőponthoz vezető route-ot a szülő EGYETLEN térképe
              rajzolja ki, a fenti onMapStateChange effekt által jelentett
              legsOverride/restPoints alapján — lásd a fájl tetején lévő
              magyarázatot. */}
          <button type="button" onClick={() => dispatch({ type: "ARRIVED_AT_REST_POINT" })} className="btn-primary text-xs">
            Megérkeztem
          </button>
        </div>
      )}

      {ctx.state === "AT_REST_POINT" && (
        <div className="space-y-2">
          <p className="text-sm text-sni-text">Pihenj nyugodtan. Amikor készen állsz, folytathatod az utat.</p>
          <button type="button" onClick={() => dispatch({ type: "REQUEST_RESUME" })} className="btn-primary text-xs">
            Folytatom az utat
          </button>
        </div>
      )}

      {(ctx.state === "RESUME_REQUESTED" || ctx.state === "REROUTING_TO_ORIGINAL_DESTINATION") && (
        <p className="text-sm text-gray-600">Új útvonal tervezése az eredeti célig…</p>
      )}

      {ctx.state === "ROUTE_RESUMED" && resumeJourney && (
        <div className="space-y-2">
          <p className="text-sm text-sni-text">
            Az utad folytatódik <span className="font-semibold">{ctx.originalDestination.name}</span> felé — kb.{" "}
            {resumeJourney.totalDurationMinutes} perc.
          </p>
          <button
            type="button"
            onClick={() => {
              setCtx(createInitialRestStopFlowContext(ctx.originalDestination, new Date().toISOString()));
              setRestPointJourney(null);
              setResumeJourney(null);
            }}
            className="btn-secondary text-xs"
          >
            Rendben
          </button>
        </div>
      )}

      {ctx.state === "ERROR" && (
        <div className="space-y-2">
          <p className="text-sm text-red-700">{ctx.errorReason ? ERROR_COPY[ctx.errorReason] : "Váratlan hiba történt."}</p>
          <DiscoverySourcesDebug sources={ctx.discoverySources} />
          <button type="button" onClick={() => dispatch({ type: "RESET_TO_ROUTE_ACTIVE" })} className="btn-secondary text-xs">
            Vissza az aktív útvonalhoz
          </button>
        </div>
      )}
    </div>
  );
}
