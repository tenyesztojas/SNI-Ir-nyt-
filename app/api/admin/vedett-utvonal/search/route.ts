// POST /api/admin/vedett-utvonal/search
//
// Admin ÉS feature flag védett (requireVedettRouteAccess). Bemenet: from/to
// cím vagy koordináta + indulási időpont + opcionális személyre szabási
// súlyok. Geokódolás után a Védett Route Orchestratoron (lásd
// lib/vedett-route/orchestrator.ts) keresztül valós MOTIS lekérdezéseket
// futtat, rangsorol, és Sensory Engine V1 pontszámmal tér vissza.
//
// FONTOS: amíg a MOTIS instance nincs elérhető, ez a végpont
// { ok: false, reason: "routing_engine_unavailable" }-t ad vissza. Sosem
// generálunk kitalált/AI-becsült útvonalat.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { journeySearchSchema } from "@/lib/vedett-route/schemas";
import { geocodeAddress } from "@/lib/vedett-route/geocode";
import { searchVedettRoutes } from "@/lib/vedett-route/orchestrator";
import { buildRouteCacheKey, getCached, setCached } from "@/lib/vedett-route/routeCache";
import type { OrchestratedSearchResult } from "@/lib/vedett-route/types";
import type { OrchestratorErrorResult } from "@/lib/vedett-route/orchestrator";
import { vedettRouteLog } from "@/lib/vedett-route/logger";

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = journeySearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "invalid_request", message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." },
      { status: 400 }
    );
  }

  const { from, fromCoordinates, to, toCoordinates, toName, weights, stepFreeRequired } = parsed.data;
  const departAt = parsed.data.departAt ?? new Date().toISOString();

  // Múltbeli időpont ellenőrzése (31. pont: routing tesztek).
  if (new Date(departAt).getTime() < Date.now() - 60_000) {
    return NextResponse.json(
      { ok: false, reason: "invalid_request", message: "Az indulási időpont nem lehet a múltban." },
      { status: 400 }
    );
  }

  // „Aktuális helyzetem" mint indulási pont (UX módosítás, 2026-09-09),
  // TASK B — ha a kliens STRUKTURÁLT fromCoordinates-t küldött (a
  // felhasználó a böngésző GPS-ét választotta indulási pontnak), a
  // geocodeAddress()-t EZ A MEZŐ TELJESEN KIHAGYJA — nincs Nominatim-hívás
  // egy "Aktuális helyzetem"-féle string miatt, és nincs "hely nem
  // található" hiba sem, hiszen a koordináta már eleve validált (zod
  // latitudeSchema/longitudeSchema, lásd schemas.ts). A "Jelenlegi hely"
  // egy statikus, nem geokódolt megjelenítési név — SOSEM kerül vissza
  // Nominatim-lekérdezésbe.
  // Védett Hely „Navigálj oda" integráció (2026-09-09) — a `from`/
  // fromCoordinates mintájával teljesen szimmetrikusan: ha a kliens
  // STRUKTURÁLT toCoordinates-t küldött (a felhasználó egy már ismert
  // VédettSarok Védett Helyet választott úti célnak), a geocodeAddress()-t
  // ez a mező is TELJESEN KIHAGYJA — a hely koordinátája már ismert és
  // megbízható, nincs szükség (és nem is volna helyes) egy pontatlanabb
  // eredményt is adó Nominatim-lekérdezésre. `toName` egy tisztán
  // megjelenítési célú label (a Védett Hely neve); hiányában egy semleges
  // alapértelmezés jelenik meg.
  // GEOCODING HARDENING (2026-09-10, "Alacskai út 63" audit) — a
  // fromCoordinates/toCoordinates ág (GPS "Aktuális helyzetem", illetve a
  // Védett Hely "Navigálj oda" KNOWN_PLACE koordinátája, MOSTANTÓL a
  // térképen kijelölt célpont is, lásd VedettUtvonalMap.tsx/
  // VedettUtvonalSearchForm.tsx) mindig MEGBÍZHATÓ, MÁR ISMERT koordináta —
  // ezt explicit `quality: "EXACT"`-ként jelöljük, hogy a lenti egységes
  // minőség-ellenőrzés helyesen SOHA ne akassza meg ezeket az ágakat.
  const [fromGeo, toGeo] = await Promise.all([
    fromCoordinates
      ? Promise.resolve({ name: "Jelenlegi hely", lat: fromCoordinates.latitude, lon: fromCoordinates.longitude, quality: "EXACT" as const })
      : geocodeAddress(from as string),
    toCoordinates
      ? Promise.resolve({ name: toName ?? "Kiválasztott cél", lat: toCoordinates.latitude, lon: toCoordinates.longitude, quality: "EXACT" as const })
      : geocodeAddress(to as string),
  ]);

  // ADDRESS_NOT_FOUND — nincs ELFOGADHATÓ Nominatim-találat SEMMILYEN
  // próbált lekérdezésre (lásd geocode.ts geocodeAddress() 3-lépéses
  // fallback-lánca). KÜLÖN reason/szöveg a routing-specifikus
  // "no_route_found"-tól (10. pont) — ez sose mosódhat össze azzal.
  if (!fromGeo || !toGeo) {
    return NextResponse.json(
      {
        ok: false,
        reason: "address_not_found",
        field: !fromGeo ? "from" : "to",
        message: "Nem találtuk ezt a címet.",
      },
      { status: 400 }
    );
  }

  // ADDRESS_APPROXIMATE — a település/utca igazolható, de a konkrét
  // házszám NEM (pl. Nominatim csak road/highway szintű találatot adott,
  // ahogy az Alacskai út 63 esetén bizonyítottan történt). Ez a koordináta
  // SOHA nem küldhető automatikusan a routingnak pontos célként (5. pont) —
  // a kliens felé egy külön, a "nincs útvonal" hibától megkülönböztetett
  // állapotot adunk vissza, a geokódolt (közelítő) koordinátával együtt,
  // hogy a UI fel tudja ajánlani a térképes célpont-kijelölést (11-13.
  // pont). Az origin/destination logika SZÁNDÉKOSAN szimmetrikus (14.
  // pont: ne legyen destination-only hack) — a kliens ebben a sprintben
  // csak a destination oldalra épít térképes CTA-t, de a szerver-oldali
  // szabály mindkét mezőre egyformán érvényes, SOHA nem enged tovább egy
  // APPROXIMATE koordinátát a routingnak.
  if (fromGeo.quality === "APPROXIMATE" || toGeo.quality === "APPROXIMATE") {
    const field: "from" | "to" = fromGeo.quality === "APPROXIMATE" ? "from" : "to";
    const approximate = field === "from" ? fromGeo : toGeo;
    return NextResponse.json(
      {
        ok: false,
        reason: "address_approximate",
        field,
        message: "Az utcát megtaláltuk, de a pontos címet nem.",
        helperMessage: "Jelöld meg a célpontot a térképen, hogy biztosan jó helyre tervezzünk.",
        approximateLocation: { name: approximate.name, lat: approximate.lat, lon: approximate.lon },
      },
      { status: 400 }
    );
  }

  // PRIVACY (16. pont): a diagnosztikai log NEM tartalmazhat teljes címet,
  // házszámot vagy koordinátát — a korábbi verzió itt a Nominatim
  // display_name-jét (a TELJES felbontott cím-szöveget) logolta, ami már
  // ennek a hardening-nek is ELLENTMOND (lásd fenti fejléc "16. PRIVACY"
  // pontja: "Új geocoding loggingban NE legyen: teljes cím, házszám,
  // ... koordináta"). Mostantól kizárólag a megkövetelt, nem-azonosító
  // diagnosztikai mezőket logoljuk.
  vedettRouteLog("routing_error", "info", {
    fromQuality: fromGeo.quality,
    toQuality: toGeo.quality,
    phase: "search_requested",
  });

  // Rövid TTL-ű, csak folyamaton belüli cache (lásd routeCache.ts fejléce a
  // korlátairól) — a percre kerekített indulási idő + a súlyok is a kulcs
  // része, hogy sosem adjon vissza más paraméterekkel kért választ.
  // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C) — a
  // stepFreeRequired preferencia a cache-kulcs RÉSZE (lásd routeCache.ts
  // fejléce: "a kérés MINDEN, az eredményt befolyásoló mezőjét
  // tartalmazza"), különben egy korábban, MÁS preferenciával cache-elt
  // válasz téves eredményt adna vissza. `?? false`, hogy a hiányzó mező és
  // az explicit `false` UGYANAZT a cache-kulcsot (és viselkedést) adja.
  const stepFree = stepFreeRequired ?? false;

  const cacheKey = buildRouteCacheKey({
    fromLat: fromGeo.lat,
    fromLon: fromGeo.lon,
    toLat: toGeo.lat,
    toLon: toGeo.lon,
    departAtMinute: departAt.slice(0, 16),
    weights: weights ?? null,
    stepFreeRequired: stepFree,
  });

  const cached = getCached<OrchestratedSearchResult | OrchestratorErrorResult>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const result = await searchVedettRoutes(
    {
      from: { name: fromGeo.name, lat: fromGeo.lat, lon: fromGeo.lon },
      to: { name: toGeo.name, lat: toGeo.lat, lon: toGeo.lon },
      departAt,
      stepFreeRequired: stepFree,
    },
    weights
  );

  setCached(cacheKey, result);

  return NextResponse.json(result);
}
