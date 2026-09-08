// POST /api/vedett-route/rest-stops/resume
//
// Sprint E — "Pihenőre van szükségem" folyamat, M) lépés: "Folytatom az
// utat" — új útvonaltervezés a JELENLEGI pozíciótól az EREDETI célig.
//
// KRITIKUS (spec 8. pont): mindig FRISS itinerary — ez a végpont mindig
// ténylegesen új fetchMotisPlan() hívást indít a hívó AKTUÁLIS pozíciójából,
// SOHA nem használja újra a pihenőpont előtti (eredeti keresésből származó)
// itineraryt. Az originalDestination-t a kliens adja át (lásd
// RestStopFlowPanel.tsx — az eredeti keresésből, a Journey utolsó lábának
// valós MOTIS koordinátáiból származik, sosem kitalálva).
//
// Jogosultság: requireVedettRouteAccess(). A böngésző itt sem éri el
// közvetlenül a MOTIS-t vagy a route service-t.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { restStopResumeSchema } from "@/lib/vedett-route/restStopFlow/schemas";
import { buildRerouteToOriginalDestinationRequest } from "@/lib/vedett-route/restStopFlow/rerouteRequest";
import { pickBestItinerary } from "@/lib/vedett-route/restStopFlow/pickBestItinerary";
import { mapMotisPlanFailureToRestStopError } from "@/lib/vedett-route/restStopFlow/errorMapping";
import { fetchMotisPlan } from "@/lib/vedett-route/motisClient";
import { mapMotisItineraryToJourney } from "@/lib/vedett-route/orchestrator";

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = restStopResumeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        // Hiányzó/érvénytelen originalDestination esetén a spec 9. pontja
        // szerinti explicit kód — ez a folyamat egyetlen alapvető
        // invariánsának (az eredeti cél soha nem veszhet el) a védelme a
        // szerver oldalon is, nem csak a kliens state machine-ben.
        reason: "ORIGINAL_DESTINATION_MISSING",
        message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés: hiányzó eredeti célállomás.",
      },
      { status: 400 }
    );
  }

  const planParams = buildRerouteToOriginalDestinationRequest(
    { lat: parsed.data.currentPosition.lat, lon: parsed.data.currentPosition.lon },
    parsed.data.originalDestination,
    parsed.data.departAt
  );
  const planResult = await fetchMotisPlan(planParams);

  if (!planResult.ok) {
    const mapped = mapMotisPlanFailureToRestStopError(planResult);
    return NextResponse.json({ ok: false, reason: mapped.reason, message: mapped.message }, { status: 200 });
  }

  const itineraries = [...(planResult.data.itineraries ?? []), ...(planResult.data.direct ?? [])];
  const best = pickBestItinerary(itineraries);
  if (!best) {
    return NextResponse.json(
      { ok: false, reason: "REROUTE_FAILED", message: "Nem található útvonal az eredeti célig." },
      { status: 200 }
    );
  }

  const journey = mapMotisItineraryToJourney(best, {
    from: "Jelenlegi hely",
    to: parsed.data.originalDestination.name,
  });
  return NextResponse.json({ ok: true, journey });
}
