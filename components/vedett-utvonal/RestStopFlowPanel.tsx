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

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { UseGeolocationResult } from "@/lib/hooks/useGeolocation";
import type { Journey } from "@/lib/vedett-route/types";
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
import {
  categoryLabelFor,
  REST_POINT_QUICK_FILTERS,
  applyRestPointQuickFilter,
  type RestPointQuickFilterKey,
} from "@/lib/vedett-route/restStopFlow/categoryLabels";

const VedettUtvonalMap = dynamic(() => import("./VedettUtvonalMap"), { ssr: false });

const ERROR_COPY: Record<RestStopFlowErrorReason, string> = {
  GPS_PERMISSION_DENIED: "A helymeghatározás engedélye el lett utasítva. Engedélyezd a böngésződben, majd próbáld újra.",
  GPS_UNAVAILABLE: "A jelenlegi helyed most nem határozható meg.",
  GPS_TIMEOUT: "A helymeghatározás túl sokáig tartott.",
  NO_REST_POINTS_FOUND: "A közelben most nem találtunk megfelelő pihenőpontot.",
  REST_POINTS_PARTIALLY_UNAVAILABLE: "Néhány közeli hely most nem tölthető be — próbáld meg kicsit később újra.",
  REST_POINT_LOAD_FAILED: "A pihenőpontok betöltése sikertelen volt.",
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

export interface RestStopFlowPanelProps {
  originalDestination: OriginalDestination | null;
  originalDepartAt: string;
  geo: UseGeolocationResult;
  onRouteResumed?: (journey: Journey) => void;
}

export default function RestStopFlowPanel({ originalDestination, originalDepartAt, geo, onRouteResumed }: RestStopFlowPanelProps) {
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

  // REST_REQUESTED: szükségünk van egy ismert pozícióra a rangsoroláshoz.
  useEffect(() => {
    if (!ctx || ctx.state !== "REST_REQUESTED") return;
    if (geo.status === "granted" && geo.latitude !== null && geo.longitude !== null) {
      dispatch({ type: "START_LOADING_REST_POINTS" });
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
  useEffect(() => {
    if (!ctx || ctx.state !== "REST_POINTS_LOADING") return;
    if (geo.latitude === null || geo.longitude === null) return;
    let cancelled = false;
    (async () => {
      const result = await postJson<{ restPoints: RankedRestPoint[]; expandedSearch?: boolean; partial?: boolean }>(
        "/api/vedett-route/rest-stops/nearby",
        { currentPosition: { lat: geo.latitude, lon: geo.longitude } }
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
  }, [ctx?.state, geo.latitude, geo.longitude]);

  // ROUTING_TO_REST_POINT: a /route-to-rest-point végpont hívása.
  useEffect(() => {
    if (!ctx || ctx.state !== "ROUTING_TO_REST_POINT" || !ctx.selectedRestPoint) return;
    if (geo.latitude === null || geo.longitude === null) {
      dispatch({ type: "ROUTE_TO_REST_POINT_FAILED", reason: "GPS_UNAVAILABLE", message: "A jelenlegi hely nem határozható meg." });
      return;
    }
    let cancelled = false;
    const restPointId = ctx.selectedRestPoint.id;
    (async () => {
      const result = await postJson<{ journey: Journey }>("/api/vedett-route/rest-stops/route-to-rest-point", {
        currentPosition: { lat: geo.latitude, lon: geo.longitude },
        restPointId,
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

  if (!ctx) return null;

  const currentPosition =
    geo.status === "granted" && geo.latitude !== null && geo.longitude !== null
      ? { latitude: geo.latitude, longitude: geo.longitude }
      : null;

  return (
    <div className="mt-4 rounded border border-sni-primary/30 bg-sni-primary/5 p-3">
      {ctx.state === "ROUTE_ACTIVE" && (
        <button type="button" onClick={() => dispatch({ type: "REQUEST_REST" })} className="btn-secondary text-sm">
          Pihenőre van szükségem
        </button>
      )}

      {(ctx.state === "REST_REQUESTED" || ctx.state === "REST_POINTS_LOADING") && (
        <p className="text-sm text-gray-600">Pihenőpontok keresése a közeledben…</p>
      )}

      {ctx.state === "REST_POINTS_READY" && ctx.rankedRestPoints && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-sni-text">Válassz pihenőpontot</h3>

          {/* Sprint E.1 — a jelölt pihenőpontok markerként is
              megjelennek, kategóriánként megkülönböztetve, hover/klikk
              szinkronban a lenti listával (spec 9. pont). Szándékosan
              üres legs-szel hívjuk — itt még nincs kiválasztott/aktív
              útvonal a pihenőponthoz, csak a jelöltek áttekintése. */}
          <VedettUtvonalMap
            legs={[]}
            currentPosition={currentPosition}
            restPoints={ctx.rankedRestPoints.map((r) => ({
              id: r.restPoint.id,
              name: r.restPoint.name,
              latitude: r.restPoint.latitude,
              longitude: r.restPoint.longitude,
              category: r.restPoint.category,
            }))}
            selectedRestPointId={highlightedRestPointId}
            onSelectRestPoint={setHighlightedRestPointId}
            className="h-48 w-full rounded border border-gray-200"
          />

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
          <VedettUtvonalMap
            legs={restPointJourney.legs}
            currentPosition={currentPosition}
            restPoints={[
              {
                id: ctx.selectedRestPoint.id,
                name: ctx.selectedRestPoint.name,
                latitude: ctx.selectedRestPoint.latitude,
                longitude: ctx.selectedRestPoint.longitude,
              },
            ]}
            className="h-64 w-full rounded border border-gray-200"
          />
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
