// Védett Útvonal — MapLibre alaptérkép style URL, központi/konfigurálható
// konstans.
//
// KLIENS-BIZTOS: ez a modul NEM tartalmaz secret-et (csak egy publikus
// style URL-t) — bátran importálható "use client" komponensből
// (VedettUtvonalMap.tsx) ÉS szerver oldalról (middleware.ts, CSP
// építéshez) is, ugyanabból az egyetlen forrásból, hogy a kettő SOHA ne
// szinkronizálatlan.
//
// MIÉRT NEM demotiles.maplibre.org (2026-09-08, valódi utcai alaptérkép
// feladat): a MapLibre saját demo style-ja ("demotiles") kizárólag
// ország-szintű, pasztell-színezésű demonstrációs stílus — NINCS benne
// utcahálózat, utcanév, épület, vagy bármilyen navigációhoz szükséges
// részlet. A Védett Útvonal felhasználójának valódi utcai környezetet
// kell látnia a pihenőpont-kereséshez és a navigációhoz.
//
// VÁLASZTÁS: OpenFreeMap Liberty (https://openfreemap.org) — publikus,
// ingyenes, kulcs nélküli, OSM-alapú (OpenMapTiles sémájú) MapLibre
// vector tile stílus, valódi utcahálózattal és utcanevekkel. A style,
// a vektor tile-ok, a glyph-ek (betűkészlet) és a sprite is UGYANARRÓL
// az egyetlen hostról (tiles.openfreemap.org) érkezik — ezt élő
// style.json + TileJSON lekéréssel ellenőriztük (2026-09-08), lásd
// docs/vedett-route/MAP_GPS_RESTPOINT_SPRINT.md "OpenFreeMap audit"
// szakasza. Ez a CSP connect-src minimális bővítését teszi lehetővé
// (middleware.ts ebből a konstansból, new URL(...).hostname-mel, magától
// számolja ki az engedélyezendő hostot — SOSEM kell kézzel szinkronban
// tartani a két helyet).
//
// PRODUCTION ARCHITEKTÚRA (spec 8. pont): az OpenFreeMap egy publikus,
// harmadik fél által üzemeltetett instance — nincs rá SLA-nk vagy
// szerződéses jogosultságunk, staging/béta célra elfogadható, de a
// Budapest éles bevezetés ELŐTT egy saját/self-hosted OpenFreeMap
// (vagy OpenMapTiles), vagy más production tile-provider kiválasztása
// szükséges. EZÉRT ez a konstans env-vezérelt
// (NEXT_PUBLIC_VEDETT_MAP_STYLE_URL) — a csere ekkor egyetlen env
// változó módosítása, NEM a VedettUtvonalMap.tsx komponens vagy a CSP
// építő logika újraírása. Ha a jövőben az új provider a style hosztól
// ELTÉRŐ hoszton szolgál ki tile/glyph/sprite erőforrást, azt a CSP
// connect-src direktívát manuálisan bővíteni kell (a hostname-only
// automatikus levezetés csak az egyetlen-hoszt esetet fedi le, mint
// jelenleg az OpenFreeMap-nél).
export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_VEDETT_MAP_STYLE_URL?.trim() || DEFAULT_MAP_STYLE_URL;

// Attribution — OpenStreetMap közreműködők + OpenFreeMap. A MapLibre a
// style.json "sources"-ában lévő "attribution" mezőt automatikusan
// megjeleníti az AttributionControl-lal (lásd VedettUtvonalMap.tsx) —
// ez a konstans egy EXPLICIT fallback/kiegészítés, ha egy jövőbeli
// alternatív style.json esetleg nem tartalmazná a megfelelő attribution
// szöveget, hogy a "Ne rejtsd el" követelmény soha ne sérüljön.
export const MAP_ATTRIBUTION_FALLBACK = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> közreműködői, © <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>';
