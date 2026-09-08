// Sprint E.1 — Real Rest Point Discovery, provider absztrakció.
//
// ARCHITEKTÚRA (spec 2. pont, szó szerint):
//   Browser -> Next.js API -> provider-ek -> normalizált RestPoint[] ->
//   ranking -> UI.
// A browser SOSEM hívja közvetlenül az Overpass/OSM API-t, a Supabase
// admin/service-role réteget, vagy a route service-t — ezt a szabályt a
// providerek KIZÁRÓLAG szerver oldalon futnak (nincs "use client" ezekben
// a fájlokban, és egyik sem importálható kliens komponensből anélkül,
// hogy egy API route ne védené).
//
// Minden provider ugyanazt az egységes interfészt implementálja, és a
// KIMENETE mindig RestPoint[] (lib/rest-points/types.ts) — még akkor is,
// ha a forrás (VédettSarok place, OSM POI) NEM ebben a formában van
// tárolva. A providerek felelőssége a DTO-adaptálás, SOHA nem a nyers
// forrás-rekord átmásolása egy rest_points-szerű objektumba (lásd
// vedettSarokProvider.ts és osmProvider.ts fejléce).

import type { RestPoint } from "../../../rest-points/types.ts";

export interface FindNearbyParams {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  userId: string;
}

// A provider SOSEM dob tovább nyers hibát a hívónak — mindig egy
// explicit, típusos eredményt ad vissza, hogy egyetlen forrás hibája
// (pl. OSM timeout) NE dönthesse romba a többi forrás eredményét (spec
// 11. pont, "PARTIAL FAILURE").
//
// STAGING DIAGNOSZTIKA (Sprint E.1 hotfix, 2026-09-08): a "reason"
// szabad szöveg (ember-olvasható, hibakeresési célra), az OPCIONÁLIS
// "errorCode" pedig egy ZÁRT, gépileg összehasonlítható kód (lásd
// osmProvider.ts OsmProviderErrorCode típusa a konkrét értékekért) —
// ez teszi lehetővé, hogy admin/preview debug felületen (route.ts
// válasz "sources" mezője) pontosan, találgatás nélkül megállapítható
// legyen, MELYIK hibaosztály okozta egy forrás elérhetetlenségét
// (timeout / HTTP hibakód / malformed response / query error / rate
// limit / endpoint unavailable / parse error), koordináta vagy nyers
// query szöveg SOHA nem kerül bele egyik mezőbe sem.
export type ProviderResult =
  | { status: "ok"; points: RestPoint[] }
  | { status: "unavailable"; reason: string; errorCode?: string };

export interface RestPointProvider {
  readonly name: "user" | "vedettSarok" | "osm";
  findNearby(params: FindNearbyParams): Promise<ProviderResult>;
}
