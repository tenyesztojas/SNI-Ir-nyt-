// Routing Engine kliens — MOTIS (https://motis-project.de/) integrációhoz
// előkészítve (11–12. pont: ne írjunk saját routing algoritmust; a MOTIS
// külön szolgáltatásként fusson).
//
// FONTOS — Fázis 1 státusza: a MOTIS szolgáltatás még NINCS üzembe állítva.
// Ennek oka technikai, nem hanyagság: a MOTIS-nak saját, előre feldolgozott
// gráfja kell (OpenStreetMap kivonat + BKK statikus GTFS), több GB méretű
// input adatból építve, jellemzően perces-órás build idővel, és egy külön
// futó (Docker) szolgáltatásként érdemes üzemeltetni — ezt dokumentáljuk a
// docs/vedett-route.md "MOTIS setup" fejezetében, konkrét
// docker-compose javaslattal.
//
// Amíg MOTIS_BASE_URL nincs beállítva, ez a kliens szabályos, kezelt hibát
// ad vissza (nem dob nyers exception-t a UI felé) — a kereső API ezt a
// "routing_engine_unavailable" választ adja tovább a felhasználónak:
// "Az útvonaltervezés átmenetileg nem érhető el."
//
// Amint egy MOTIS instance elérhető, a MOTIS_BASE_URL env változó
// beállításával ez a kliens éles hívásokat kezdhet küldeni felé — a hívó
// kód (route search API) nem változik.

import { getMotisBaseUrl } from "./config.ts";
import type { JourneySearchRequest, JourneySearchResult } from "./types.ts";
import { vedettRouteLog } from "./logger.ts";

export async function planJourneyWithMotis(request: JourneySearchRequest): Promise<JourneySearchResult> {
  const baseUrl = getMotisBaseUrl();

  if (!baseUrl) {
    vedettRouteLog("routing_engine_unavailable", "warn", { reason: "motis_not_configured" });
    return {
      ok: false,
      reason: "routing_engine_unavailable",
      message: "Az útvonaltervezés átmenetileg nem érhető el.",
    };
  }

  try {
    // MOTIS /api/v1/plan (vagy a ténylegesen üzembe állított instance
    // dokumentált API-ja) — a pontos kérés/válasz mapping a MOTIS instance
    // beüzemelésekor kerül implementálásra, dokumentált API alapján.
    const res = await fetch(
      `${baseUrl}/api/v1/plan?` +
        new URLSearchParams({
          fromPlace: `${request.from.lat},${request.from.lon}`,
          toPlace: `${request.to.lat},${request.to.lon}`,
          time: request.departAt,
        }),
      { signal: AbortSignal.timeout(10_000), cache: "no-store" }
    );

    if (!res.ok) {
      vedettRouteLog("routing_error", "error", { status: res.status });
      return { ok: false, reason: "routing_engine_unavailable", message: "Az útvonaltervezés átmenetileg nem érhető el." };
    }

    // A MOTIS válasz Route Normalizer-en (lásd docs) keresztüli Journey[]-vé
    // alakítása a valós instance API válaszformátumának ismeretében készül el.
    vedettRouteLog("routing_error", "warn", {
      reason: "motis_response_mapping_not_implemented",
    });
    return { ok: false, reason: "routing_engine_unavailable", message: "Az útvonaltervezés átmenetileg nem érhető el." };
  } catch (err) {
    vedettRouteLog("routing_error", "error", { message: err instanceof Error ? err.message : "unknown" });
    return { ok: false, reason: "routing_engine_unavailable", message: "Az útvonaltervezés átmenetileg nem érhető el." };
  }
}
