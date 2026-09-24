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
import { lookupStationCandidatesFromSidecar, type StationSearchSidecarCandidate } from "./accessibilityLookupClient.ts";

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

// SIDECAR DATASET ROUTING HINT (2026-09-24, "VPS sidecar allomas-kereses"
// sprint) -- melyik LIVE VPS sidecar dataset(ek)et erdemes megkerdezni egy
// adott szinonima-szohoz. Szandekosan a MAR MEGLEVO matchedSynonyms
// eredmenyre epul (nem uj parsolas) -- egy vasut-jellegu szo (vasutallomas/
// vonatallomas/palyaudvar/allomas) a "mavgtfs" datasetre mutat, egy
// busz-jellegu szo (buszallomas/buszpalyaudvar) a "volangtfs"-re, a tobbi
// (metro/HEV/megallo/megallohely -- BKK jellegu) a "bkkgtfs"-re. NINCS
// varos-/helynev semmilyen formaban ebben a tablaban.
const STATION_SYNONYM_TO_SIDECAR_DATASET: Record<string, string[]> = {
  [normalizeForPrefixMatch("vasútállomás")]: ["mavgtfs"],
  [normalizeForPrefixMatch("vonatállomás")]: ["mavgtfs"],
  [normalizeForPrefixMatch("pályaudvar")]: ["mavgtfs"],
  [normalizeForPrefixMatch("állomás")]: ["mavgtfs"],
  [normalizeForPrefixMatch("buszpályaudvar")]: ["volangtfs"],
  [normalizeForPrefixMatch("buszállomás")]: ["volangtfs"],
  [normalizeForPrefixMatch("megállóhely")]: ["bkkgtfs"],
  [normalizeForPrefixMatch("megálló")]: ["bkkgtfs"],
  [normalizeForPrefixMatch("metró")]: ["bkkgtfs"],
  [normalizeForPrefixMatch("HÉV")]: ["bkkgtfs"],
};

// A JELENLEG ismert sidecar dataset-ek BOVITHETO, de MINDIG hatarolt
// listaja -- ha egy keresesben NINCS felismert szinonima-szo (vagy a
// felismert szo(ak) nem kepezodnek le egyertelmuen egy datasetre), a
// kereses ezt a HATAROLT (jelenleg haromelemu), NEM a jovoben
// vegtelenul bovulo halmazt kerdezi le -- soha nem egy dinamikusan
// novekvo/korlatlan fan-outot.
const ALL_KNOWN_SIDECAR_DATASETS = ["bkkgtfs", "mavgtfs", "volangtfs"] as const;

/**
 * A normalizeStationQuery() mar felismert szinonima-szavai alapjan
 * eldonti, mely sidecar dataset(ek)et erdemes megkerdezni. Ha nincs
 * felismert szinonima, VAGY a felismert szo(ak) egyike sem kepezodik le
 * ismert datasetre, a HATAROLT (nem korlatlan) ALL_KNOWN_SIDECAR_DATASETS
 * halmazt adja vissza -- soha nem varos-/helynev alapjan dont.
 */
export function resolveSidecarDatasetHints(normalization: StationQueryNormalization): string[] {
  if (normalization.matchedSynonyms.length === 0) {
    return [...ALL_KNOWN_SIDECAR_DATASETS];
  }
  const datasets = new Set<string>();
  for (const word of normalization.matchedSynonyms) {
    const cleaned = word.replace(/^[,.;:!?]+/, "").replace(/[,.;:!?]+$/, "");
    const normalized = normalizeForPrefixMatch(cleaned);
    const hint = STATION_SYNONYM_TO_SIDECAR_DATASET[normalized];
    if (hint) {
      for (const dataset of hint) datasets.add(dataset);
    }
  }
  if (datasets.size === 0) return [...ALL_KNOWN_SIDECAR_DATASETS];
  return Array.from(datasets);
}

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
  const cleanedWords: string[] = [];
  for (const word of words) {
    // SUBMIT-PATH JAVÍTÁS (2026-09-24, "Martonvásár + vasútállomás split
    // mezős submit" production hiba) — a submit-time searchRequestBuilder.ts
    // buildStructuredAddressString() a Város + Cím/hely mezőket VESSZŐVEL
    // összefűzve küldi a szervernek (pl. "Martonvásár, vasútállomás"). A
    // szó végi/eleji írásjeleket (pl. ez a vessző) LEVÁGJUK a megtartott
    // szóból is, nem csak az egyezés-vizsgálatnál — különben a coreQuery
    // "Martonvásár," maradna (vesszővel), ami SOHA nem egyezne pontosan a
    // GTFS stop_name "Martonvásár" normalizált alakjával (lásd
    // matchGtfsStopsByQuery bestRankAgainstTargets "exact" ága).
    const cleaned = word.replace(/^[,.;:!?]+/, "").replace(/[,.;:!?]+$/, "");
    const normalized = normalizeForPrefixMatch(cleaned);
    if (NORMALIZED_STATION_SYNONYMS.has(normalized)) {
      matchedSynonyms.push(word);
      continue;
    }
    if (cleaned.length > 0) cleanedWords.push(cleaned);
  }
  const coreQuery = cleanedWords.join(" ").trim();
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
// SIDECAR-FORRASU (VPS, elo GTFS) TALALATOK BEEPITESE (2026-09-24, "VPS
// sidecar allomas-kereses" sprint) -- a fenti, .vedett-cache-alapu
// helyi-index utat EZ NEM VALTJA FEL, hanem KIEGESZITI: a lokalis/dev/teszt
// hasznalatra a MEGLEVO loadIndex-ut valtozatlan marad (fallback), DE a
// production korrektsege MAR NEM fugg tole -- lasd a sprint jelentes
// "PRODUCTION DATA" pontjat. A `sidecarSearch` fuggveny INJEKTALT
// fuggoseg (ugyanaz a minta, mint `loadIndex`), alapertelmezesben a VALODI
// VPS sidecar klienst hivja (lookupStationCandidatesFromSidecar,
// accessibilityLookupClient.ts) -- igy a MEGLEVO ket hivo (address-search/
// search route.ts) SEMMILYEN modositas NELKUL automatikusan athalad ezen az
// uton, tesztekben viszont egy stub injektalhato.
export type SidecarStationSearchFn = (
  query: string,
  dataset: string,
) => Promise<StationSearchSidecarCandidate[] | null>;

async function defaultSidecarStationSearch(query: string, dataset: string): Promise<StationSearchSidecarCandidate[] | null> {
  return lookupStationCandidatesFromSidecar(query, dataset);
}

/**
 * Egy sidecar dataset-kulcshoz tartozo provider/candidate-tipus leves,
 * UGYANAZZAL a "vasut -> transit_station, busz -> transit_stop" elvvel,
 * mint a MEGLEVO STATION_PROVIDERS tablaban (mav_rail/mav_bus). A "bkkgtfs"
 * (es barmely ismeretlen dataset) a "BKK" providerre/"transit_stop"
 * tipusra esik vissza -- ez a mezo KIZAROLAG UI-megjelenites/tipus-
 * cimkezes celjabol letezik, a routing/klasszifikacios logikat nem
 * befolyasolja.
 */
function sidecarDatasetToStationConfig(dataset: string): { provider: TransitProviderId; type: "transit_station" | "transit_stop" } {
  if (dataset === "mavgtfs") return { provider: "MAV_RAIL", type: "transit_station" };
  if (dataset === "volangtfs") return { provider: "MAV_BUS", type: "transit_stop" };
  return { provider: "BKK", type: "transit_stop" };
}

export async function findGtfsStationCandidates(
  query: string,
  loadIndex: AccessibilityIndexLoader,
  limit: number = DEFAULT_STATION_CANDIDATE_LIMIT,
  sidecarSearch: SidecarStationSearchFn = defaultSidecarStationSearch,
): Promise<GtfsStationCandidate[]> {
  const normalization = normalizeStationQuery(query);
  if (normalizeForPrefixMatch(normalization.coreQuery).length < MIN_CORE_QUERY_LENGTH_FOR_STATION_MATCH) {
    return [];
  }

  const collected: GtfsStationCandidate[] = [];

  // 1) MEGLEVO helyi (.vedett-cache) index-alapu ut -- valtozatlan,
  // fallback/dev celra megmarad.
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

  // 2) UJ: VPS sidecar-alapu ut -- ez adja a valodi production talalatokat
  // (lasd a sprint jelentes NETWORK PATH/PRODUCTION DATA pontjait). Csak a
  // relevans, HATAROLT dataset-halmazt kerdezi le (resolveSidecarDatasetHints),
  // egy-egy hatarolt HTTP hivassal datasetenkent, parhuzamosan. TOBB
  // candidate eseten NEM valogatunk automatikusan egyet -- mindegyik
  // bekerul az egyesitett listaba, a meglevo dedup/rank/limit logika alá.
  const normalizedTargets = [
    normalizeForPrefixMatch(normalization.coreQuery),
    normalizeForPrefixMatch(normalization.originalQuery),
  ];
  const sidecarQueryText = normalization.coreQuery.length > 0 ? normalization.coreQuery : normalization.originalQuery;
  const datasetHints = resolveSidecarDatasetHints(normalization);
  const sidecarResults = await Promise.all(
    datasetHints.map(async (dataset) => {
      try {
        const stops = await sidecarSearch(sidecarQueryText, dataset);
        return { dataset, stops: stops ?? [] };
      } catch {
        // Fail-safe (spec): a sidecar kliens SOHA nem dob, de ez a
        // vedelmi halo akkor is all, ha egy jovobeli valtoztatas ezt
        // megtorne -- egy sidecar-hiba SOSEM allithatja meg a tobbi
        // dataset/forras feldolgozasat.
        return { dataset, stops: [] as StationSearchSidecarCandidate[] };
      }
    }),
  );

  for (const { dataset, stops } of sidecarResults) {
    const config = sidecarDatasetToStationConfig(dataset);
    for (const stop of stops) {
      if (typeof stop.lat !== "number" || typeof stop.lon !== "number") continue;
      if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) continue;
      const normalizedName = normalizeForPrefixMatch(stop.name ?? "");
      if (!normalizedName) continue;
      const rank = bestRankAgainstTargets(normalizedName, normalizedTargets);
      if (!rank) continue;
      collected.push({
        type: config.type,
        source: "gtfs",
        provider: config.provider,
        id: stop.stopId,
        label: stop.name ?? stop.stopId,
        lat: stop.lat,
        lon: stop.lon,
        rank,
      });
    }
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

// SUBMIT-PATH ÁLLOMÁS-FELOLDÁS (2026-09-24, "Martonvásár + vasútállomás
// split mezős submit" production hiba javítása)
//
// ROOT CAUSE: a korábbi (2026-09-24, autocomplete) sprint a GTFS
// állomás-keresést KIZÁRÓLAG a /api/admin/vedett-utvonal/address-search
// (autocomplete/suggest) végpontra kötötte be. A TÉNYLEGES routing-submit
// ("Útvonal keresése" gomb) egy TELJESEN MÁS végpontot
// (/api/admin/vedett-utvonal/search) és egy TELJESEN MÁS feloldási ágat
// hív: ha a user nem választott autocomplete-javaslatot (tehát nincs
// fromCoordinates/toCoordinates), a kliens a Város+Irányítószám/kerület+
// Cím-vagy-hely mezőket EGY VESSZŐVEL ELVÁLASZTOTT STRING-GÉ fűzi össze
// (lásd searchRequestBuilder.ts buildStructuredAddressString(), pl.
// "Martonvásár, vasútállomás") és ezt a stringet KÖZVETLENÜL a Nominatim-
// alapú geocodeAddress()-nek (geocode.ts) adja — ez a réteg NEM ismeri a
// GTFS stop-adatot, ezért egy valós állomásnév-keresés itt "address_not_found"
// ("Nem találtuk ezt a címet.") hibára futott, FÜGGETLENÜL attól, hogy az
// autocomplete-réteg már helyesen fel tudta volna oldani.
//
// JAVÍTÁS: resolveStationCandidatesToOutcome() egy TISZTA, a route.ts
// által hívott döntési függvény — a MÁR MEGLÉVŐ findGtfsStationCandidates()
// eredményét alakítja "egyértelmű EXACT találat" / "több találat, válasszon
// a felhasználó" / "nincs találat, menjen a normál geocode" kimenetre. A
// route.ts ezt a normál geocodeAddress() ELÉ kapcsolja, DE KIZÁRÓLAG akkor,
// ha normalizeStationQuery(query).hasStationHint === true (tehát a szöveg
// tartalmaz egy felismert állomás/megálló szinonima-szót) — ez a
// konzervatív kapu biztosítja, hogy egy sima, szinonima-szó NÉLKÜLI
// cím-keresés (a normál regressziós eset) SOHA ne fusson át ezen az ágon,
// tehát a meglévő cím-keresés nem sérülhet. A "több találat" ágat a
// route.ts a MÁR LÉTEZŐ "address_ambiguous" hibaágra/UI-ra képezi le
// (lásd route.ts fejléce "ADDRESS_AMBIGUOUS" szakasza és
// VedettUtvonalSearchForm.tsx ambiguousOriginCandidates/
// ambiguousDestinationCandidates state-je) — NINCS új, station-specifikus
// UI, a meglévő "válassz a listából" mechanizmus szolgálja ki mindkét
// esetet, origin ÉS destination oldalon szimmetrikusan (a Promise.all
// mindkét ágon UGYANEZT a resolvert hívja).
export interface StationResolvedGeocodeResult {
  name: string;
  lat: number;
  lon: number;
  quality: "EXACT";
}

export interface StationResolvedAmbiguousCandidate {
  displayName: string;
  lat: number;
  lon: number;
  secondary?: string;
}

export type StationResolutionOutcome =
  | { kind: "none" }
  | { kind: "single"; result: StationResolvedGeocodeResult }
  | { kind: "ambiguous"; candidates: StationResolvedAmbiguousCandidate[] };

/**
 * A findGtfsStationCandidates() eredményének (tiszta, szinkron) döntéssé
 * alakítása. Nulla találat -> "none" (a hívó a normál geocodeAddress()-re
 * esik vissza). Pontosan egy találat -> "single", a MEGLÉVŐ GeocodeResult-
 * alakkal kompatibilis EXACT eredmény (a route.ts ezt közvetlenül a
 * geocodeAddress() helyére teheti, nem geokódol újra). Több találat ->
 * "ambiguous", a MEGLÉVŐ GeocodePlaceCandidate/AmbiguousGeocodeResult
 * alakkal kompatibilis lista (displayName/lat/lon/secondary) — a
 * `secondary` mező egy egyszerű, magyar típusjelző ("vasútállomás"/
 * "autóbusz-megálló"), SOSEM nyers GTFS/OSM adat.
 */
export function resolveStationCandidatesToOutcome(candidates: GtfsStationCandidate[]): StationResolutionOutcome {
  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length === 1) {
    const candidate = candidates[0];
    return { kind: "single", result: { name: candidate.label, lat: candidate.lat, lon: candidate.lon, quality: "EXACT" } };
  }
  return {
    kind: "ambiguous",
    candidates: candidates.map((candidate) => ({
      displayName: candidate.label,
      lat: candidate.lat,
      lon: candidate.lon,
      secondary: candidate.type === "transit_station" ? "vasútállomás" : "autóbusz-megálló",
    })),
  };
}

// A route.ts (routing-submit végpont) MEGLÉVŐ Nominatim-alapú
// geocodeAddress()/AmbiguousGeocodeResult típusaival kompatibilis
// generikus alak — SZÁNDÉKOSAN NEM importáljuk közvetlenül a geocode.ts
// típusait ide (a stationNameSearch.ts modul ettől a réteg-től
// FÜGGETLEN marad, csak a hívó — route.ts — illeszti össze a kettőt),
// hanem egy STRUKTURÁLISAN kompatibilis, minimális alakot definiálunk.
export interface ManualFieldGeocodeResult {
  name: string;
  lat: number;
  lon: number;
  quality: "EXACT" | "APPROXIMATE";
  houseNumberNotResolved?: true;
  resolvedStreet?: string;
  resolvedCity?: string;
}
export interface ManualFieldAmbiguousResult {
  ambiguous: true;
  candidates: StationResolvedAmbiguousCandidate[];
}
export type ManualFieldGeocodeFallback = (
  query: string,
) => Promise<ManualFieldGeocodeResult | ManualFieldAmbiguousResult | null>;

/**
 * A submit-time ("Útvonal keresése" gomb) MANUAL from/to mező feloldása —
 * ez a route.ts (/api/admin/vedett-utvonal/search) által TÉNYLEGESEN
 * hívott függvény, a fenti fejléc szerinti root cause javítása.
 *
 * `loadIndex` és `geocodeFallback` INJEKTÁLT függőségek (nem itt vannak
 * hardkódolva) — ez teszi lehetővé, hogy ezt a FÜGGVÉNYT (nem csak a
 * belső darabjait külön-külön) node --test alól, next/server és valódi
 * Nominatim-hívás NÉLKÜL, közvetlen függvényhívással tesztelhessük,
 * pontosan a production-ben átcsúszott integrációs réteget lefedve.
 *
 * KAPU: kizárólag akkor fut a GTFS-illesztés, ha
 * normalizeStationQuery(query).hasStationHint === true — egy szinonima
 * NÉLKÜLI, sima cím-keresés SOSEM éri el ezt az ágat (a `geocodeFallback`
 * hívódik közvetlenül), tehát a meglévő cím-keresés viselkedése
 * garantáltan változatlan marad ezekre a lekérdezésekre.
 */
export async function resolveManualFieldOrStation(
  query: string,
  loadIndex: AccessibilityIndexLoader,
  geocodeFallback: ManualFieldGeocodeFallback,
): Promise<ManualFieldGeocodeResult | ManualFieldAmbiguousResult | null> {
  const normalization = normalizeStationQuery(query);
  if (normalization.hasStationHint) {
    const stationCandidates = await findGtfsStationCandidates(query, loadIndex);
    const outcome = resolveStationCandidatesToOutcome(stationCandidates);
    if (outcome.kind === "single") {
      return { name: outcome.result.name, lat: outcome.result.lat, lon: outcome.result.lon, quality: "EXACT" };
    }
    if (outcome.kind === "ambiguous") {
      return { ambiguous: true, candidates: outcome.candidates };
    }
    // outcome.kind === "none" -> nincs GTFS állomás-találat, a normál
    // cím/POI geokódolás fut (lásd lent) — a station-hint önmagában
    // SOSEM blokkolja/módosítja a normál geocode-ágat.
  }
  return geocodeFallback(query);
}
