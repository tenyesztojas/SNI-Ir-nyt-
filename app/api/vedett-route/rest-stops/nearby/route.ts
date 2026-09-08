// POST /api/vedett-route/rest-stops/nearby
//
// Sprint E.1 — "Pihenőre van szükségem" folyamat, VALÓS, TÖBBFORRÁSÚ
// pihenőpont-felfedezés (USER + VEDETT_SAROK + OSM). Ez a végpont a
// Sprint E-ben (2026-09-08) létrehozott, kizárólag saját USER
// pihenőpontokat lekérdező változatot EVOLVÁLTA (nem duplikálta) — a
// tényleges "keresés" logika mostantól a discovery aggregátorban
// (lib/vedett-route/restStopFlow/aggregator.ts) él, amely a 3
// RestPointProvider implementációt (userProvider/vedettSarokProvider/
// osmProvider) hívja, összefésüli, dedupe-olja, és szükség esetén
// egyszer bővíti a keresési sugarat (spec 10. pont).
//
// Jogosultság: requireVedettRouteAccess() (admin_only, ugyanaz a kapu,
// mint minden Védett Útvonal funkció — lásd access.ts). A tényleges
// cross-user védelmet az RLS adja (userProvider.ts a hívó session-jéhez
// kötött klienssel dolgozik), a filterVisibleRestPoints() egy MÁSODIK,
// alkalmazás-szintű védelmi réteg.
//
// PRIVACY: az aktuális pozíció (currentPosition) itt KIZÁRÓLAG a
// kereséshez/rangsoroláshoz kerül felhasználásra — nem kerül DB-be, nem
// kerül logba (lásd vedettRouteLog hívásait a providerekben/
// aggregator.ts-ben: sosem tartalmaznak koordinátát).
//
// PARTIAL FAILURE / ZERO RESULTS — HÁROM KÜLÖNBÖZŐ ÜZENET (spec 11.
// pont, szó szerint megkövetelve):
//  1) Van legalább egy találat, de valamelyik forrás nem volt elérhető
//     -> ok:true, partial:true — a UI a listával EGYÜTT mutat egy
//     "néhány hely most nem tölthető be" jellegű, NEM hiba-jellegű
//     banner-t (lásd RestStopFlowPanel.tsx).
//  2) Nulla találat, de MINDEN forrás elérhető volt (őszintén nincs a
//     közelben) -> ok:false, reason: NO_REST_POINTS_FOUND.
//  3) Nulla találat, ÉS legalább egy forrás nem volt elérhető (tehát nem
//     tudjuk biztosan, hogy tényleg nincs a közelben semmi) -> ok:false,
//     reason: REST_POINTS_PARTIALLY_UNAVAILABLE — EZ a szöveg SOSEM
//     egyezik a régi generikus "A pihenőpontok betöltése sikertelen
//     volt." szöveggel (lásd RestStopFlowPanel.tsx ERROR_COPY).
//
// ADMIN/PREVIEW DIAGNOSZTIKA (Sprint E.1 hotfix, 2026-09-08): ez a
// végpont requireVedettRouteAccess() mögött van (admin_only) — emiatt a
// discovery.sources (per-provider ok/reason/errorCode) MINDEN válaszágban
// (siker, NO_REST_POINTS_FOUND, REST_POINTS_PARTIALLY_UNAVAILABLE)
// szerepel a JSON válaszban. Ez NEM a végfelhasználói UI szövege — a
// polírozott banner-szövegek (RestStopFlowPanel.tsx) továbbra sem
// mutatnak technikai provider-nevet; a "sources" mező kizárólag admin/
// preview debug célra, hogy pontosan (találgatás nélkül) megállapítható
// legyen, MELYIK forrás (user/vedettSarok/osm) és MILYEN hibaosztály
// (errorCode) okozott egy hiányzó/csökkent találatlistát.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { restStopNearbySchema } from "@/lib/vedett-route/restStopFlow/schemas";
import { rankRestPoints } from "@/lib/vedett-route/restStopFlow/ranking";
import { discoverRestPoints, MAX_REST_POINTS } from "@/lib/vedett-route/restStopFlow/aggregator";
import { vedettRouteLog } from "@/lib/vedett-route/logger";

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = restStopNearbySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "REST_POINT_LOAD_FAILED", message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." },
      { status: 400 }
    );
  }

  try {
    const discovery = await discoverRestPoints({
      latitude: parsed.data.currentPosition.lat,
      longitude: parsed.data.currentPosition.lon,
      userId: auth.userId,
    });

    const ranked = rankRestPoints(
      discovery.points,
      { lat: parsed.data.currentPosition.lat, lon: parsed.data.currentPosition.lon },
      undefined,
      parsed.data.preference
    ).slice(0, MAX_REST_POINTS);

    if (ranked.length === 0) {
      if (discovery.partial) {
        // Nem tudjuk biztosan, hogy tényleg nincs a közelben semmi — csak
        // azt, hogy legalább egy forrást nem sikerült elérni (spec 11.
        // pont, 3. eset). SZÁNDÉKOSAN külön hibakód a sima
        // NO_REST_POINTS_FOUND-tól, hogy a UI ezt is külön, őszinte
        // szöveggel jelezhesse.
        return NextResponse.json(
          {
            ok: false,
            reason: "REST_POINTS_PARTIALLY_UNAVAILABLE",
            message: "Néhány közeli hely most nem tölthető be — próbáld meg kicsit később újra.",
            searchRadiusMeters: discovery.searchRadiusMeters,
            expandedSearch: discovery.expandedSearch,
            sources: discovery.sources,
          },
          { status: 200 }
        );
      }
      // Minden forrás elérhető volt, őszintén nincs találat a közelben
      // (spec 11. pont, 2. eset) — NEM technikai hiba.
      return NextResponse.json(
        {
          ok: false,
          reason: "NO_REST_POINTS_FOUND",
          message: "A közelben most nem találtunk megfelelő pihenőpontot.",
          searchRadiusMeters: discovery.searchRadiusMeters,
          expandedSearch: discovery.expandedSearch,
          sources: discovery.sources,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      ok: true,
      restPoints: ranked,
      searchRadiusMeters: discovery.searchRadiusMeters,
      expandedSearch: discovery.expandedSearch,
      partial: discovery.partial,
      sources: discovery.sources,
    });
  } catch (err) {
    // Sosem adjuk tovább a nyers hibaüzenetet a kliensnek (lásd
    // errorMapping.ts fejléce a hasonló elvért a routing hibáknál).
    vedettRouteLog("routing_error", "error", {
      phase: "rest_stops_nearby",
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, reason: "REST_POINT_LOAD_FAILED", message: "A pihenőpontok betöltése sikertelen." },
      { status: 500 }
    );
  }
}
