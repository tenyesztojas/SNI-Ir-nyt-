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
//
// PIHENŐPONT-ALKALMASSÁG (Sprint E.1 hotfix, 2026-09-08, staging audit):
// "published" + van koordináta ÖNMAGÁBAN NEM elég ahhoz, hogy egy
// VédettSarok hely pihenőpontként ajánlható legyen — egy staging teszten
// egy coach/mentor szakember rekordja ("Novák Léna neuroaffirmatív
// tinicoach, ADHD-mentor") jelent meg pihenőpontként, ami szemantikailag
// hibás (egy szolgáltató/szakember profilja NEM ugyanaz, mint egy
// fizikailag meglátogatható, leülésre/pihenésre alkalmas hely).
//
// SZABÁLY: ez a provider KIZÁRÓLAG olyan helyet ad vissza, amelynél
// place.restPointEligible === true — egy EXPLICIT admin/moderációs
// döntés (lásd lib/types.ts Place.restPointEligible és a
// supabase/migrations/20260908_places_rest_point_eligibility.sql
// migráció fejléce). SOHA nem következtetünk a category mezőből (pl.
// "kávézó" vs "coach" szöveges egyezés) — a category egy szabadon
// bővíthető, adminok által karbantartott tábla, nem egy zárt, kódban
// biztonságosan kategorizálható enum, és a UNKNOWN != ELIGIBLE elv itt
// is érvényes: amíg egyetlen hely sincs explicit megjelölve, ez a
// provider 0 eredményt ad — ez a SZÁNDÉKOS, biztonságos alapállapot,
// NEM egy hiányzó implementáció.

import type { FindNearbyParams, ProviderResult, RestPointProvider } from "./types.ts";
import { getApprovedPlaces } from "../../../data.ts";
import { placeToRestPointIfEligible } from "./vedettSarokMapping.ts";
import type { RestPoint } from "../../../rest-points/types.ts";

export const vedettSarokRestPointProvider: RestPointProvider = {
  name: "vedettSarok",
  async findNearby(params: FindNearbyParams): Promise<ProviderResult> {
    try {
      const places = await getApprovedPlaces();
      const points: RestPoint[] = [];

      // A tényleges szűrési/leképezési logika (koordináta-ellenőrzés,
      // EXPLICIT pihenőpont-alkalmasság, távolság) egy külön, alias-
      // mentes modulban él (vedettSarokMapping.ts) — lásd ott a
      // fejlécet, miért: ez teszi lehetővé, hogy node --test alól
      // közvetlenül, Supabase/getApprovedPlaces mock nélkül tesztelhető
      // legyen a szűrési szabály.
      for (const place of places) {
        const point = placeToRestPointIfEligible(
          place,
          { lat: params.latitude, lon: params.longitude },
          params.radiusMeters
        );
        if (point) points.push(point);
      }

      return { status: "ok", points };
    } catch (err) {
      return { status: "unavailable", reason: err instanceof Error ? err.message : "unknown_error" };
    }
  },
};
