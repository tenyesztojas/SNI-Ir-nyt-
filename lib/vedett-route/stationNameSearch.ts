// VÉDETT ÚTVONAL — ÁLLOMÁS/MEGÁLLÓ NÉV FELISMERÉS (2026-09-24, "állomás- és
// megállónevek felismerése" sprint)
//
// AUDIT ÖSSZEFOGLALÓ (a teljes audit lásd a sprint jelentésében):
//   - A ténylegesen felhasználó-oldali hely-keresés (autocomplete) a
//     MEGLÉVŐ /api/admin/vedett-utvonal/address-search végponton keresztül
//     fut (lásd useAddressAutocomplete.ts — a "admin" útvonal-előtag
//     ELLENÉRE ezt hívja a sima, nem-admin VedettUtvonalSearchForm.tsx és
//     VedettUtvonalWorkspace.tsx is), ami a Mapbox Search Box /suggest +
//     Geocoding v6 /forward réteget használja — ez KIZÁRÓLAG cím/POI
//     találatokat ad, GTFS állomás/megálló adatot NEM ismer.
//   - A GTFS statikus stop-adat (stop_id/stop_name/stop_lat/stop_lon) a
//     MEGLÉVŐ accessibilityIndex.ts + staticFileProvider.ts párosban MÁR
//     elérhető: az admin GTFS feltöltés (MÁV vasút "mav_rail", MÁV/Volán
//     busz "mav_bus" — lásd providers/registry.ts) MINDEN feltöltéskor
//     felépíti és lemezre írja a teljes AccessibilityIndex-et
//     (`.vedett-cache/gtfs-static/<provider>/accessibility-index.json`),
//     amit a staticFileProvider.ts getAccessibilityIndex() már MA IS
//     betölt (eddig KIZÁRÓLAG az akadálymentességi klasszifikációhoz,
//     lásd orchestrator.ts). Ez EZ a modul ÚJRAHASZNÁLJA — nem épít
//     második GTFS-tárolót/parsert. (A BKK élő adatai a VPS
//     accessibility-sidecaron keresztül csak koordináta-alapú "nearby
//     stop" lekérdezést tesznek lehetővé — lásd accessibilityLookupClient.ts
//     — NÉV szerinti kereséshez ez nem használható innen, lásd a sprint
//     jelentés "ismert korlátok" pontját.)
//   - Az ékezet/kis-nagybetű-toleráns normalizálásra a MEGLÉVŐ
//     normalizeForPrefixMatch() (addressAutocompleteMapbox.ts) függvényt
//     használjuk — NEM írunk második diakritika-eltávolítót.
//
// EZ A MODUL (tiszta, Next.js-mentes logika — node --test-tel közvetlenül
// tesztelhető):
//   1. normalizeStationQuery() — magyar állomás/megálló szinonima-szavak
//      felismerése és eltávolítása egy szabad szöveges keresésből, a
//      "mag" (a tényleges helynév) megtartásával.
//   2. matchGtfsStopsByQuery() — egy MÁR BETÖLTÖTT AccessibilityIndex
//      stop-jainak névillesztése egy normalizált kereséshez, rangsorolva.
//   3. findGtfsStationCandidates() — a fenti kettő + a (injektált) index-
//      betöltő összefűzése, TÖBB providerre (mav_rail, mav_bus).
//   4. mergeAddressAndStationResults() — a MEGLÉVŐ cím/POI találatok és az
//      új állomás/megálló találatok egyesítése egyetlen, típus/forrás-
//      címkézett listává.
//
// FONTOS (a sprint spec kritikus pontja): a szinonima-szó eltávolítása
// ÖNMAGÁBAN nem elég — ha van VALÓDI GTFS stop/station találat a
// megmaradt helynévre, AZT a rekordot (saját koordinátával/azonosítóval)
// adjuk vissza célpontként, nem csupán egy általánosan geokódolt pontot,
// ami véletlenül ugyanazt a nevet viseli. Ezt a findGtfsStationCandidates()
// biztosítja: a végpont (route.ts) ÖSSZEFÉSÜLI ennek az eredményét a
// cím/POI találatokkal, a GTFS találatok kerülnek előre.

import { normalizeForPrefixMatch } from "./addressAutocompleteMapbox.ts";
import type { AccessibilityIndex } from "./accessibilityIndex.ts";
import type { TransitProviderId } from "./types.ts";

// TÁMOGATOTT MAGYAR ÁLLOMÁS/MEGÁLLÓ SZINONIMÁK (spec szerint, szó szerint
// felsorolva) — accent/case-toleránsan, TELJES SZÓ egyezéssel (nem
// substring), hogy pl. "állomás" ne vágjon bele egy "Állomás utca"
// jellegű, ténylegesen utcanévbe tartozó szóba félreértelmezve más
// összefüggésben (a teljes-szó egyezés itt is csak egy token-eltávolítás,
// a maradék "utca" szó a helynév része marad).
export const STATION_SYNONYM_WORDS = [
  "vasútállomás",
  "vonatállomás",
  "buszpályaudvar",
  "pályaudvar",
  "megállóhely",
  "buszállomás",
  "állomás",
  "megálló",
  "metró",
  "HÉV",
] as const;

const NORMALIZED_STATION_SYNONYMS = new Set(
  STATION_SYNONYM_WORDS.map((word) => normalizeForPrefixMatch(word)),
);

export interface StationQueryNormalization {
  /** Az eredeti, csak trim-elt keresési szöveg. */
  originalQuery: string;
  /**
   * A keresési szöveg a felismert szinonima-szavak NÉLKÜL — ez a "mag"
   * helynév, amit GTFS stop-illesztéshez és (fallback) cím/POI kereséshez
   * egyaránt használunk. Ha a szinonima eltávolítása után semmi nem
   * marad, a biztonság kedvéért az EREDETI szöveg marad (sosem küldünk
   * üres query-t tovább).
   */
  coreQuery: string;
  /** Volt-e felismert állomás/megálló szinonima a keresésben. */
  hasStationHint: boolean;
  /** A ténylegesen felismert (eredeti írásmódú) szó(ak). */
  matchedSynonyms: string[];
}

/**
 * Egy szabad szöveges keresés szétbontása "mag helynév" + "felismert
 * állomás/megálló szinonima(k)" részekre. Ékezet- és
 * kis-/nagybetű-toleráns (a MEGLÉVŐ normalizeForPrefixMatch()-en
 * keresztül), TELJES SZÓ egyezéssel dolgozik (a keresés szóközzel
 * tagolt tokenjein).
 */
export function normalizeStationQuery(query: string): StationQueryNormalization {
  const trimmed = query.trim();
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  const matchedSynonyms: string[] = [];
  const coreWords = words.filter((word) => {
    // A szó végi írásjeleket (pl. vessző) is toleráljuk az egyezésnél,
    // de magát a szót változatlanul tartjuk meg/dobjuk el.
    const normalized = normalizeForPrefixMatch(word.replace(/[,.;:!?]+$/g, ""));
    if (NORMALIZED_STATION_SYNONYMS.has(normalized)) {
      matchedSynonyms.push(word);
      return false;
    }
    return true;
  });
  const coreQuery = coreWords.join(" ").trim();
  return {
    originalQuery: trimmed,
    coreQuery: coreQuery.length > 0 ? coreQuery : trimmed,
    hasStationHint: matchedSynonyms.length > 0,
    matchedSynonyms,
  };
}

export type StationMatchRank = "exact" | "prefix" | "contains";

const RANK_ORDER: Record<StationMatchRank, number> = { exact: 0, prefix: 1, contains: 2 };

export interface GtfsStationCandidate {
  /**
   * "transit_station" a vasúti (MAV_RAIL), "transit_stop" az autóbuszos
   * (MAV_BUS) találatokra — egyszerű, provider-alapú heurisztika (a GTFS
   * location_type mező nem minden feedben megbízható/kitöltött, lásd
   * accessibilityIndex.ts fejléce), elegendő ahhoz, hogy a kliens
   * megkülönböztesse a cím/POI találatoktól és nagyjából a vasút/busz
   * jelleget is jelezze.
   */
  type: "transit_station" | "transit_stop";
  source: "gtfs";
  provider: TransitProviderId;
  /** A GTFS stop_id (az adott provider indexén belül egyedi). */
  id: string;
  /** Megjelenítendő név — a nyers GTFS stop_name. */
  label: string;
  lat: number;
  lon: number;
  rank: StationMatchRank;
}

export interface StationProviderConfig {
  id: TransitProviderId;
  dirName: string;
  candidateType: "transit_station" | "transit_stop";
}

// A MEGLÉVŐ providers/registry.ts-ben regisztrált, statikus-feed-alapú
// providerek KÖNYVTÁRNEVEI (lásd staticFileProvider.ts cacheDirFor()) —
// SZÁNDÉKOSAN nem duplikáljuk a registry.ts-t importtal (az élő
// TransitProvider osztályokat építene fel, routing-célra), csak a
// könyvtárnév-leképezést vesszük át, ami stabil/publikus konvenció.
const STATION_PROVIDERS: StationProviderConfig[] = [
  { id: "MAV_RAIL", dirName: "mav_rail", candidateType: "transit_station" },
  { id: "MAV_BUS", dirName: "mav_bus", candidateType: "transit_stop" },
];

/** Legalább ennyi karakter kell a mag helynévben, különben nem indítunk GTFS-illesztést (elkerüli, hogy egy csupasz "állomás" keresés az összes stopot visszaadja). */
export const MIN_CORE_QUERY_LENGTH_FOR_STATION_MATCH = 2;

function bestRankAgainstTargets(normalizedStopName: string, normalizedTargets: string[]): StationMatchRank | null {
  let best: StationMatchRank | null = null;
  for (const target of normalizedTargets) {
    if (!target) continue;
    let candidateRank: StationMatchRank | null = null;
    if (normalizedStopName === target) {
      candidateRank = "exact";
    } else if (normalizedStopName.startsWith(target) || target.startsWith(normalizedStopName)) {
      candidateRank = "prefix";
    } else if (normalizedStopName.includes(target) || target.includes(normalizedStopName)) {
      candidateRank = "contains";
    }
    if (candidateRank && (best === null || RANK_ORDER[candidateRank] < RANK_ORDER[best])) {
      best = candidateRank;
    }
  }
  return best;
}

/**
 * Egy MÁR BETÖLTÖTT AccessibilityIndex stop-jainak illesztése egy
 * normalizált kereséshez. Tiszta, szinkron függvény — a hívó felelőssége
 * az index betöltése (lásd findGtfsStationCandidates()).
 *
 * Mind a "mag" (szinonima nélküli), mind az EREDETI keresési szöveghez
 * illesztünk (a jobb rangot vesszük) — így egy olyan GTFS feed is
 * megtalálható marad, ahol a stop_name MAGA tartalmazza a "pályaudvar"/
 * "állomás" szót (pl. hivatalos GTFS export "Budapest-Déli pályaudvar"
 * néven), NEM csak a szinonima nélküli rövid névre.
 */
export function matchGtfsStopsByQuery(
  normalization: StationQueryNormalization,
  index: AccessibilityIndex,
  provider: StationProviderConfig,
  limit: number,
): GtfsStationCandidate[] {
  const normalizedTargets = [
    normalizeForPrefixMatch(normalization.coreQuery),
    normalizeForPrefixMatch(normalization.originalQuery),
  ];
  if (normalizeForPrefixMatch(normalization.coreQuery).length < MIN_CORE_QUERY_LENGTH_FOR_STATION_MATCH) {
    return [];
  }

  const candidates: GtfsStationCandidate[] = [];
  for (const stopId of Object.keys(index.stopsById)) {
    const entry = index.stopsById[stopId];
    if (!entry.stopName || typeof entry.latitude !== "number" || typeof entry.longitude !== "number") continue;
    const normalizedStopName = normalizeForPrefixMatch(entry.stopName);
    if (!normalizedStopName) continue;
    const rank = bestRankAgainstTargets(normalizedStopName, normalizedTargets);
    if (!rank) continue;
    candidates.push({
      type: provider.candidateType,
      source: "gtfs",
      provider: provider.id,
      id: stopId,
      label: entry.stopName,
      lat: entry.latitude,
      lon: entry.longitude,
      rank,
    });
  }

  candidates.sort((a, b) => {
    const rankDiff = RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    if (rankDiff !== 0) return rankDiff;
    return a.label.localeCompare(b.label, "hu");
  });

  return dedupeStationCandidates(candidates).slice(0, limit);
}

// NÉV-ALAPÚ DEDUP — ugyanaz a döntés, mint a MEGLÉVŐ
// nearbyTransitAccess.ts-ben (peronszintű duplikátumok, pl. egy több
// vágányos állomás minden vágánya külön stop_id-vel, de azonos nevű):
// a normalizált NÉV az egyedi kulcs, az első (legjobb rangú, mert a lista
// már rendezett) példányt tartjuk meg.
function dedupeStationCandidates(candidates: GtfsStationCandidate[]): GtfsStationCandidate[] {
  const seen = new Set<string>();
  const result: GtfsStationCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.provider}:${normalizeForPrefixMatch(candidate.label)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

export type AccessibilityIndexLoader = (providerDirName: string) => Promise<AccessibilityIndex | null>;

export const DEFAULT_STATION_CANDIDATE_LIMIT = 8;

// A cím/POI (max 5, lásd addressAutocompleteMapbox.ts) + állomás/megálló
// (max DEFAULT_STATION_CANDIDATE_LIMIT=8) EGYESÍTETT lista felső korlátja —
// SZÁNDÉKOSAN a kettő összegénél nagyobb/egyenlő, hogy a meglévő cím/POI
// találatok SOSE vesszenek el csak azért, mert egyszerre több állomás-
// találat is van (spec: "ne rontsuk el a jelenlegi normál címkeresést").
export const DEFAULT_MERGED_RESULT_LIMIT = 16;

/**
 * A teljes állomás/megálló-keresés belépési pontja: normalizálja a
 * keresést, majd MINDEN regisztrált statikus-feed providerre (mav_rail,
 * mav_bus) lefuttatja az illesztést az (injektált) `loadIndex`-en
 * keresztül betöltött indexen. Az index-betöltő hiba/hiányzó feltöltés
 * esetén `null`-t ad (lásd staticFileProvider.ts getAccessibilityIndex()
 * szerződése) — ez a függvény ilyenkor egyszerűen kihagyja az adott
 * providert, SOSEM dob hibát, SOSEM állítja meg a többi provider
 * feldolgozását.
 */
export async function findGtfsStationCandidates(
  query: string,
  loadIndex: AccessibilityIndexLoader,
  limit: number = DEFAULT_STATION_CANDIDATE_LIMIT,
): Promise<GtfsStationCandidate[]> {
  const normalization = normalizeStationQuery(query);
  if (normalizeForPrefixMatch(normalization.coreQuery).length < MIN_CORE_QUERY_LENGTH_FOR_STATION_MATCH) {
    return [];
  }

  const collected: GtfsStationCandidate[] = [];
  for (const provider of STATION_PROVIDERS) {
    let index: AccessibilityIndex | null;
    try {
      index = await loadIndex(provider.dirName);
    } catch {
      index = null;
    }
    if (!index) continue;
    collected.push(...matchGtfsStopsByQuery(normalization, index, provider, limit));
  }

  collected.sort((a, b) => {
    const rankDiff = RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    if (rankDiff !== 0) return rankDiff;
    return a.label.localeCompare(b.label, "hu");
  });

  return dedupeStationCandidates(collected).slice(0, limit);
}

// EGYESÍTETT (CÍM/POI + ÁLLOMÁS/MEGÁLLÓ) EREDMÉNY-ALAK — a MEGLÉVŐ
// AddressAutocompleteSuggestion (addressAutocompleteMapbox.ts) mezőit
// bővíti egy `type`/`source` diszkriminátorral. A `type` mező hiánya
// (régi kliens/teszt) SEMMILYEN meglévő mezőt nem távolít el — visszafelé
// kompatibilis bővítés.
export type AddressLikeResult = {
  id?: string;
  label: string;
  name?: string;
  city?: string;
  postcode?: string;
  district?: string;
  lat?: number;
  lon?: number;
};

export interface UnifiedPlaceSearchResult extends AddressLikeResult {
  type: "address" | "transit_station" | "transit_stop";
  source: "mapbox" | "gtfs";
  provider?: TransitProviderId;
}

/**
 * A MEGLÉVŐ cím/POI találatok (Mapbox) és az ÚJ GTFS állomás/megálló
 * találatok egyesítése EGYETLEN, típus/forrás-címkézett listává.
 *
 * SORREND: az állomás/megálló találatok kerülnek előre — ha a
 * felhasználó egy állomás-szinonimával keresett (pl. "... vasútállomás"),
 * feltételezhetően ténylegesen a transit célpontra kíváncsi, de a
 * cím/POI találatok NEM tűnnek el (pl. ha véletlenül egy utcanév is
 * hasonlít) — mindkettő látszik, a felhasználó választ (spec: "ne
 * találjunk ki önkényesen egyet").
 */
export function mergeAddressAndStationResults(
  addressResults: AddressLikeResult[],
  stationCandidates: GtfsStationCandidate[],
  limit: number = DEFAULT_MERGED_RESULT_LIMIT,
): UnifiedPlaceSearchResult[] {
  const stationUnified: UnifiedPlaceSearchResult[] = stationCandidates.map((candidate) => ({
    id: `gtfs:${candidate.provider}:${candidate.id}`,
    label: candidate.label,
    name: candidate.label,
    lat: candidate.lat,
    lon: candidate.lon,
    type: candidate.type,
    source: "gtfs",
    provider: candidate.provider,
  }));
  const addressUnified: UnifiedPlaceSearchResult[] = addressResults.map((result) => ({
    ...result,
    type: "address",
    source: "mapbox",
  }));
  return [...stationUnified, ...addressUnified].slice(0, limit);
}
