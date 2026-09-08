// Sprint E.1 — VédettSarok ("places") forrású pihenőpontok.
//
// VALÓDI ADATMODELL AUDIT (2026-09-08): a VédettSarok helyek a MEGLÉVŐ
// "places" táblában élnek (lib/types.ts Place, lib/data.ts getApprovedPlaces())
// — ez EGY MÁSIK, szándékosan külön adatmodell, mint a rest_points tábla
// (lásd supabase/migrations/20260907_rest_points.sql fejléce: "SZÁNDÉKOSAN
// KÜLÖN adatmodell... egy VédettSarok hely SOHA nem másolódik át
// rest-point rekordként" — ezt a szabályt ez a provider is betartja: az
// alábbi kód KIZÁRÓLAG memóriában alakítja RestPoint DTO-vá a "places"
// sorokat, SOHA nem ír a rest_points táblába — a rest_points_user_source_only
// DB CHECK constraint ezt amúgy is technikailag megakadályozná).
//
// A "places" séma (lib/types.ts Place) VALÓS mezői: id, slug, name,
// category, city, latitude?, longitude?, status, description,
// whyFriendly stb. — NINCS benne seating/toilet/quietSpace/indoors/
// outdoors/purchaseRequired mező. Ezért ennek a providernek a
// knownAttributes-je (toilet/seating/stb.) MINDIG null (UNKNOWN) — ez
// SZÁNDÉKOS és őszinte (spec 5. pont: "NE találj ki mosdót, ülőhelyet,
// csendességet, beltéri/kültéri jellemzőt"), nem egy hiányzó
// implementáció.
//
// "publikus / használható státusz" minimumkövetelmény (spec 5. pont): a
// meglévő getApprovedPlaces() PONTOSAN ezt adja — status = "published" —
// ugyanaz a lekérdezés, amit a nyilvános VédettSarok helylista is használ,
// nincs párhuzamos/duplikált szűrési logika.

import type { FindNearbyParams, ProviderResult, RestPointProvider } from "./types.ts";
import { getApprovedPlaces } from "../../../data.ts";
import { haversineDistanceMeters } from "../ranking.ts";
import type { RestPoint } from "../../../rest-points/types.ts";

export const vedettSarokRestPointProvider: RestPointProvider = {
  name: "vedettSarok",
  async findNearby(params: FindNearbyParams): Promise<ProviderResult> {
    try {
      const places = await getApprovedPlaces();
      const points: RestPoint[] = [];

      for (const place of places) {
        // Csak létező, koordinátával rendelkező rekord — lásd spec 5.
        // pont minimumkövetelménye. Koordináta nélküli hely NEM jelenhet
        // meg (nincs "kitalált" pozíció).
        if (place.latitude === undefined || place.longitude === undefined) continue;

        const distanceMeters = haversineDistanceMeters(
          { lat: params.latitude, lon: params.longitude },
          { lat: place.latitude, lon: place.longitude }
        );
        if (distanceMeters > params.radiusMeters) continue;

        points.push({
          id: `vedett-sarok:${place.id}`,
          // Nincs valódi "létrehozó felhasználó" ennél a forrásnál — a
          // rest_points DB séma createdBy mezője itt SOHA nem kerül
          // beírásra (ez egy in-memory DTO), a sentinel csak a RestPoint
          // interfész kitöltéséhez kell.
          createdBy: "vedett-sarok",
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          source: "VEDETT_SAROK",
          visibility: "PUBLIC",
          // UNKNOWN != FALSE — lásd fenti fejléc. A "places" séma jelenleg
          // nem tartalmaz ilyen mezőket.
          toilet: null,
          seating: null,
          quietSpace: null,
          indoors: null,
          outdoors: null,
          purchaseRequired: null,
          notes: null,
          createdAt: "",
          updatedAt: "",
          category: "VEDETT_SAROK",
        });
      }

      return { status: "ok", points };
    } catch (err) {
      return { status: "unavailable", reason: err instanceof Error ? err.message : "unknown_error" };
    }
  },
};
