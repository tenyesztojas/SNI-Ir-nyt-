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

import type { FindNearbyParams, ProviderResult, RestPointProvider } from "./types.ts";
import { listOwnRestPoints } from "../../../rest-points/queries.ts";
import { filterVisibleRestPoints } from "../visibility.ts";
import { haversineDistanceMeters } from "../ranking.ts";

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
      return { status: "unavailable", reason: err instanceof Error ? err.message : "unknown_error" };
    }
  },
};
