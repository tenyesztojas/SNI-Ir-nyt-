// Sprint E.1 — USER forrású pihenőpontok (a felhasználó saját, korábban
// felvett pontjai).
//
// SZERVER OLDALI, RLS-hez kötött lekérdezés — a meglévő
// lib/rest-points/queries.ts + visibility.ts modulokat használja
// VÁLTOZATLANUL (nincs párhuzamos DB-hozzáférés, lásd spec 3. pont: "Ne
// készíts párhuzamos rendszert"). A cross-user védelem elsődlegesen az
// RLS (rest_points_own_select policy), a filterVisibleRestPoints() egy
// MÁSODIK, alkalmazás-szintű réteg — lásd visibility.ts fejléce.
//
// A radiusMeters szűrést itt végezzük (a rest_points tábla jelenleg
// kicsi, egy-egy felhasználónak legfeljebb néhány tucat saját pontja
// lehet — nincs szükség PostGIS/geo-indexre ebben a sprintben).
//
// STAGING DIAGNOSZTIKA (Sprint E.1 hotfix, 2026-09-09, root cause audit):
// egy valódi Vercel Preview futásban ez a forrás "user: unavailable"
// státuszt adott. FONTOS, BIZONYÍTOTT (nem feltételezett) tény a kód
// alapján: ha a bejelentkezett usernek egyszerűen nincs saját
// pihenőpontja, az NEM vezet "unavailable" állapothoz — a
// listOwnRestPoints() 0 sort ad vissza HIBA NÉLKÜL (RLS a
// created_by = auth.uid() feltétellel csendben szűr, nem dob hibát), ez a
// provider ilyenkor {status:"ok", points:[]}-t ad. Az "unavailable"
// állapot TEHÁT bizonyíthatóan azt jelenti, hogy a Supabase/Postgrest
// hívás explicit `error`-t adott vissza — ennek pontos okát (hiányzó
// tábla/migráció, jogosultsági hiba, egyéb lekérdezési hiba) élő DB-
// hozzáférés nélkül, ebből a környezetből NEM lehet találgatás nélkül
// megállapítani. Ehelyett ez a provider mostantól a Postgrest hibakódot
// (lib/rest-points/queries.ts már megőrzi err.code-ként, lásd ott) egy
// ZÁRT, admin/preview debug célú UserProviderErrorCode-ra osztályozza —
// koordinátát, userId-t, auth tokent vagy Supabase-adatot SOSEM tartalmaz
// —, hogy a KÖVETKEZŐ Preview reprodukció a tényleges okot közvetlenül,
// találgatás nélkül mutassa (ugyanaz az elv, mint az osmProvider.ts
// OsmProviderErrorCode-ja).

import type { FindNearbyParams, ProviderResult, RestPointProvider } from "./types.ts";
import { listOwnRestPoints } from "../../../rest-points/queries.ts";
import { filterVisibleRestPoints } from "../visibility.ts";
import { haversineDistanceMeters } from "../ranking.ts";

// ZÁRT hibaosztály-halmaz a lib/rest-points/queries.ts-ből megőrzött
// Postgrest error.code alapján (lásd https://postgrest.org hibakód-listáját
// és a Postgres SQLSTATE kódokat). Csak a leggyakoribb, admin-számára
// hasznos osztályokat különböztetjük meg explicit — minden más Postgrest/
// Postgres kód "query_error"-ként, minden nem-Postgrest kivétel
// "unknown_error"-ként landol.
export type UserProviderErrorCode =
  | "table_missing"
  | "permission_denied"
  | "query_error"
  | "unknown_error";

function classifyUserProviderError(err: unknown): { message: string; errorCode: UserProviderErrorCode } {
  const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined;
  const message = err instanceof Error ? err.message : "unknown_error";

  // "42P01" = Postgres undefined_table (a rest_points tábla nem létezik —
  // pl. a supabase/migrations/20260907_rest_points.sql migráció nincs
  // alkalmazva az adott adatbázison). "PGRST205" = PostgREST "could not
  // find the table in the schema cache" — ugyanaz a gyakorlati tünet
  // (hiányzó tábla vagy elavult séma-cache), PostgREST oldali kóddal.
  if (code === "42P01" || code === "PGRST205") {
    return { message, errorCode: "table_missing" };
  }
  // "42501" = Postgres insufficient_privilege — hiányzó GRANT vagy RLS/
  // jogosultsági konfigurációs probléma az adott táblán/szerepkörön.
  if (code === "42501") {
    return { message, errorCode: "permission_denied" };
  }
  if (typeof code === "string" && code.length > 0) {
    return { message, errorCode: "query_error" };
  }
  return { message, errorCode: "unknown_error" };
}

export const userRestPointProvider: RestPointProvider = {
  name: "user",
  async findNearby(params: FindNearbyParams): Promise<ProviderResult> {
    try {
      const own = await listOwnRestPoints();
      const visible = filterVisibleRestPoints(own, params.userId);
      const nearby = visible.filter(
        (rp) =>
          haversineDistanceMeters(
            { lat: params.latitude, lon: params.longitude },
            { lat: rp.latitude, lon: rp.longitude }
          ) <= params.radiusMeters
      );
      return { status: "ok", points: nearby.map((rp) => ({ ...rp, category: "USER" as const })) };
    } catch (err) {
      const classified = classifyUserProviderError(err);
      return { status: "unavailable", reason: classified.message, errorCode: classified.errorCode };
    }
  },
};
