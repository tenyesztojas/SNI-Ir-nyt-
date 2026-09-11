// VÉDETT ÚTVONAL — MOTIS ID NORMALIZATION (2026-09-11, Task C2)
//
// A MOTIS a válaszban NEM a nyers GTFS stop_id/route_id/trip_id-t adja
// vissza közvetlenül, hanem egy dataset-prefixelt kompozit azonosítót
// (bizonyítva a VPS runtime-teszttel, lásd a feature riport "MOTIS válasz
// audit" szakaszát):
//
//   MOTIS stopId:  "bkkgtfs_056216"                          (stop)
//   MOTIS stopId:  "bkkgtfs_CS056215"                        (parent/cluster stop)
//   MOTIS routeId: "bkkgtfs_5400"
//   MOTIS tripId:  "20260911_17:08_bkkgtfs_C98050336"        (dátum + idő + dataset + GTFS trip_id)
//
// KRITIKUS SZABÁLY (spec 2/11. pont): TILOS egy törékeny, pozíció-alapú
// `split("_")` logikát használni — egy ilyen megoldás elszállna, amint a
// nyers GTFS azonosító MAGA IS tartalmaz aláhúzásjelet, vagy egy jövőbeli
// dataset (MÁV/Volán) más prefix-hosszal/formátummal érkezik. Ehelyett ez a
// modul egy EXPLICIT, ismert dataset-tag REGISZTERT használ: a bemenetet
// KIZÁRÓLAG a regiszterben szereplő, pontosan illeszkedő prefix után vágja
// szét — a prefix UTÁNI teljes maradékot (akárhány további aláhúzásjellel)
// egyetlen, sértetlen nyers-GTFS-azonosítóként kezeli. Egy ismeretlen
// (nem regisztrált) dataset-prefix esetén a függvény SOHA nem dob
// kivételt és SOHA nem tér vissza "accessible" feltételezéssel — a hívó
// (accessibility.ts) ezt UNKNOWN-ként kezeli.
//
// Fázis 2 (MÁV/Volán): amikor ezek a datasetek éles GTFS-t kapnak, a
// KNOWN_MOTIS_DATASET_TAGS regiszterbe egy ÚJ sort kell felvenni (a
// providerhez tartozó tényleges, a MOTIS runtime válaszában MEGFIGYELT
// prefix-szel) — a normalizáló FÜGGVÉNYEK maguk NEM módosulnak.

import type { TransitProviderId } from "./types.ts";

// Csak ténylegesen, VPS runtime-teszttel megfigyelt dataset-prefixek
// kerülhetnek ide. "bkkgtfs" a BKK MOTIS feed-jének a runtime auditban
// bizonyított prefixe (lásd a feature riport 1/2. pontja). MÁV/Volán
// prefixek MA MÉG NEM ismertek — amíg nincs saját runtime-megfigyelés
// rájuk, SZÁNDÉKOSAN nincsenek itt felsorolva (egy ismeretlen prefix
// biztonságosan UNKNOWN-ra esik, sosem dob hibát vagy feltételez adatot).
const KNOWN_MOTIS_DATASET_TAGS: Record<string, TransitProviderId> = {
  bkkgtfs: "BKK",
};

export interface NormalizedMotisId {
  provider: TransitProviderId;
  /** A dataset-prefix UTÁNI, sértetlen nyers GTFS azonosító (stop_id/route_id/trip_id). */
  gtfsId: string;
}

export interface UnknownMotisId {
  provider: "UNKNOWN";
}

export type NormalizedMotisStopOrRouteId = NormalizedMotisId | UnknownMotisId;

export interface NormalizedMotisTripId extends NormalizedMotisId {
  /** A MOTIS tripId-ben megfigyelt szolgálati dátum (YYYYMMDD), a GTFS trip_id RÉSZE, nem attól független adat. */
  serviceDate: string;
  /** A MOTIS tripId-ben megfigyelt indulási idő (HH:MM). */
  time: string;
}

export type NormalizedMotisTripIdResult = NormalizedMotisTripId | UnknownMotisId;

/**
 * Közös alap a stopId/routeId normalizáláshoz — mindkettő UGYANAZT az
 * "<ismert dataset-tag>_<nyers GTFS ID>" alakot követi a megfigyelt MOTIS
 * válaszokban. Kizárólag a KNOWN_MOTIS_DATASET_TAGS regiszterben szereplő,
 * pontosan illeszkedő prefixet ismeri fel — minden más bemenet UNKNOWN.
 */
function parseDatasetPrefixedId(rawId: string): NormalizedMotisStupOrRouteIdInternal {
  for (const [tag, provider] of Object.entries(KNOWN_MOTIS_DATASET_TAGS)) {
    const prefix = `${tag}_`;
    if (rawId.startsWith(prefix) && rawId.length > prefix.length) {
      return { provider, gtfsId: rawId.slice(prefix.length) };
    }
  }
  return { provider: "UNKNOWN" };
}
// (belső segéd-típus, csak ennek a fájlnak a olvashatóságáért — a publikus
// export NormalizedMotisStopOrRouteId néven érhető el.)
type NormalizedMotisStupOrRouteIdInternal = NormalizedMotisStopOrRouteId;

/** MOTIS stopId -> {provider, gtfsId} vagy {provider:"UNKNOWN"}. Lásd modul-fejléc a bizonyított fixture-ökért. */
export function normalizeMotisStopId(motisStopId: string | undefined | null): NormalizedMotisStopOrRouteId {
  if (!motisStopId) return { provider: "UNKNOWN" };
  return parseDatasetPrefixedId(motisStopId);
}

/** MOTIS routeId -> {provider, gtfsId} vagy {provider:"UNKNOWN"}. */
export function normalizeMotisRouteId(motisRouteId: string | undefined | null): NormalizedMotisStopOrRouteId {
  if (!motisRouteId) return { provider: "UNKNOWN" };
  return parseDatasetPrefixedId(motisRouteId);
}

// A tripId alakja BIZONYÍTOTTAN eltér a stop/route ID-któl: a MOTIS elé
// fűzi a szolgálati dátumot és indulási időt is, MIELŐTT a dataset-tag
// következne — pl. "20260911_17:08_bkkgtfs_C98050336". A regex a dátum
// (8 számjegy) + idő (HH:MM) + ISMERT dataset-tag hármast anchor-olja a
// string ELEJÉHEZ, a dataset-tag UTÁNI TELJES maradékot (bármennyi további
// aláhúzásjellel) egyetlen, sértetlen darabként fogja fel — emiatt ez SEM
// egy pozíció-alapú split("_"), hanem egy a regiszterhez kötött, explicit
// mintaillesztés.
const TRIP_ID_PATTERN = /^(\d{8})_(\d{2}:\d{2})_([A-Za-z0-9]+)_(.+)$/;

/** MOTIS tripId -> {provider, gtfsId, serviceDate, time} vagy {provider:"UNKNOWN"}. Lásd modul-fejléc a bizonyított fixture-ért. */
export function normalizeMotisTripId(motisTripId: string | undefined | null): NormalizedMotisTripIdResult {
  if (!motisTripId) return { provider: "UNKNOWN" };
  const match = TRIP_ID_PATTERN.exec(motisTripId);
  if (!match) return { provider: "UNKNOWN" };
  const [, serviceDate, time, tag, gtfsId] = match;
  const provider = KNOWN_MOTIS_DATASET_TAGS[tag];
  if (!provider) return { provider: "UNKNOWN" };
  return { provider, gtfsId, serviceDate, time };
}
