# Task C3 — Védett Útvonal Accessibility Production Data Plane

**Státusz (2026-09-11): audit + implementáció + tesztek KÉSZ. NINCS deployolva.**
A VPS-hez (159.195.255.146) ez a kör NEM nyúlt. Lásd
`vps-accessibility-sidecar/README.md` a (jövőbeli, külön jóváhagyandó)
telepítési lépésekért.

## 1. A probléma (audit eredménye)

A Task C2-ben megépült accessibility-klasszifikáció (`accessibility.ts`,
`accessibilityIndex.ts`, `gtfsCsv.ts`, `motisIdNormalization.ts`,
`pathwayGraph.ts`) helyes és teljes, de az egyetlen éles adatforrása
(`providers/staticFileProvider.ts` `getAccessibilityIndex("bkk")`) egy
Next.js-oldali (Vercel) LOKÁLIS `.vedett-cache/gtfs-static/bkk/`
könyvtárból olvasott volna — ami:

1. NEM ugyanaz a fájl, mint amit a VPS-en futó MOTIS a canonical
   `/srv/vedett-route/input/bkk_gtfs.zip`-ből használ (két, garantáltan
   NEM szinkron feed-generáció lehetősége).
2. Vercel szerver-lambdák között nem is garantáltan tartós/megosztott
   tárhely.
3. Emiatt productionben `getAccessibilityIndex("bkk")` GYAKORLATILAG
   MINDIG `null`-t adott — a Task C2 fail-safe logikája ezt helyesen
   UNKNOWN-ként kezelte, de ez azt jelentette, hogy a lépcsőmentes
   keresés éles accessibility-adat NÉLKÜL futott.

## 2. Architektúra döntés

**A meglévő C2 klasszifikációt NEM írtuk újra.** `accessibility.ts`
egyetlen sora sem módosult. Az EGYETLEN változás: az index FORRÁSA.

```
Browser
  -> Next.js szerver (Vercel)
       -> [MOTIS routing]  https://route.vedettsarok.hu/api/v6/plan  (VÁLTOZATLAN, Task C2)
       -> [accessibility]  https://route.vedettsarok.hu/accessibility/lookup  (ÚJ, Task C3)
            -> Caddy (VPS)
                 -> 127.0.0.1:8082  <- ÚJ, kis footprintű Node sidecar (ez a kör építette)
                      -> in-memory accessibility index, a MOTIS-szal
                         MEGEGYEZŐ /srv/vedett-route/input/bkk_gtfs.zip-ből
```

A repo-ban NEM volt már meglévő VPS-sidecar/API process, amit
újrahasznosíthattunk volna (ellenőrizve: `gtfs-upload`/`gtfs-refresh`
route-ok, a route-service smoke test, a VPS staging gate dokumentum) —
ezért egy ÚJ, minimális, keretrendszer nélküli `node:http` process épült
(`vps-accessibility-sidecar/`), a spec explicit "ne tégy úgy, mintha
lenne" korlátjának megfelelően.

## 3. Root production blocker

Lásd 1. pont — a fő ok a local-cache-alapú index-forrás és a VPS-en futó
MOTIS canonical feedje közötti garantálhatatlan szinkron.

## 4. VPS sidecar választás

Minimális, függőség-szegény `node:http` szerver (nincs Express/Fastify),
TypeScript-ből fordítva sima JS-re (`tsc`), egyetlen runtime dependency:
`adm-zip` (GTFS zip parszoláshoz, a C2-ből átvéve). Induláskor
memóriába tölti az aktív generation indexét, poll-alapú (10 mp) frissítés
figyeli az `active-generation.txt` pointer fájlt.

## 5. API szerződés

```
POST /lookup
Authorization: Bearer <ACCESSIBILITY_SIDECAR_AUTH_TOKEN>
{ "dataset": "bkkgtfs", "stopIds": [...], "tripIds": [...], "pathwayQueries": [{"fromStopId":"...","toStopId":"..."}] }

-> 200 { "ok": true, "status": "ok" | "unavailable", "provider", "dataset", "generation", "builtAt",
         "stops": {...}, "trips": {...}, "pathways": [...] }
-> 401 UNAUTHORIZED / 404 UNKNOWN_DATASET / 400 <parse hiba> / 500 INTERNAL_ERROR

GET /health -> { ok, datasets: [{provider, dataset, generation, builtAt, stopCount, tripCount, pathwayCount, status}] }
```

A válasz SOHA nem a teljes indexet adja — csak a kért id-k/pathway-
kérdések metszetét (lásd `stationSubgraph.ts` a pathway-subgraph
szűkítéshez, parent_station ID-alapon, SOSEM névegyezésből).

## 6. Generation-szinkronizáció

`buildIndex.ts` a `sha256(bkk_gtfs.zip).slice(0,16)`-ot generation-nek
használja — UGYANAZ a konvenció, mint a Next.js oldali
`staticFileProvider.ts` `computeGtfsZipGeneration()`-je. Ez emberi szemmel
összevethetővé teszi a két oldal generation-jét, de FONTOS ŐSZINTE
KORLÁT: a MOTIS saját belső feed-generációja NEM ebből a repóból látható
(a MOTIS maga nem exponál egy "melyik generation van betöltve" API-t a
jelenlegi auditban) — a manifest tehát az INDEX saját generációját
bizonyítja, nem egy MOTIS<->index keresztbizonyítást. Erről lásd a 15.
pontot (remaining risks).

## 7. Index build/aktiváció

Lásd `vps-accessibility-sidecar/src/buildIndex.ts` fejléce: temp-fájlba
írás + rename (atomikus), írás UTÁNI validáció, és CSAK validáció után az
`active-generation.txt` pointer atomikus frissítése. Sikertelen build
SOHA nem érinti az aktív pointert. Korábbi generation könyvtár SOHA nem
törlődik automatikusan.

## 8. Next.js lookup flow

`lib/vedett-route/accessibilityLookupClient.ts` — `orchestrator.ts`
`searchVedettRoutes()`-ja a last-mile fallback ELDÖNTÉSE UTÁN, a
VÉGLEGES `rawItineraries`-ből épít egyetlen batch-elt kérést (összes
candidate itinerary összes lába -> stopIds/tripIds/pathwayQueries
uniója), és EGYETLEN `fetch()` hívást indít. `stepFreeRequired=false`
esetén ez a kód-ág egyáltalán nem fut (nulla új hálózati hívás,
byte-ra változatlan normál keresés).

## 9. Hibakezelés (fail-safe)

`lookupAccessibilityIndexForItineraries()` SOHA nem dob kivételt.
Bármilyen hiba (nincs konfigurálva / timeout / 401/403/5xx / malformed
JSON / dataset unavailable) -> `null`. Ez PONTOSAN az a szerződés, amit
`accessibility.ts` már a Task C2 óta ismer (`index: AccessibilityIndexLike
| null`) — a klasszifikáció minden komponenst UNKNOWN-ra old fel, a MOTIS
saját NOT_ACCESSIBLE hard filtere TOVÁBBRA IS működik (attól teljesen
független réteg), a journey legfeljebb PARTIALLY_UNKNOWN lesz. SOHA nem
KNOWN_ACCESSIBLE egy lookup-hiba miatt.

## 10. Biztonság

- A sidecar KIZÁRÓLAG `127.0.0.1`-en figyel, nem `0.0.0.0`-n.
- Bearer-auth, KÜLÖN secret (`ACCESSIBILITY_SIDECAR_AUTH_TOKEN`), sosem
  ugyanaz, mint a `ROUTE_SERVICE_AUTH_TOKEN`.
- A Caddy réteg (jövőbeli, nem telepített kiegészítés) KIZÁRÓLAG a
  `/accessibility/lookup` útvonalat proxyolja, a meglévő szűk-proxy
  konvenciót követve.
- A `/health` válasz SOHA nem tartalmaz secretet/koordinátát.
- A logolás (mindkét oldalon) a meglévő `vedettRouteLog()`/redact()
  mintát követi — nincs koordináta/token a logokban.

## 11-12. Módosított / új fájlok

Lásd a session végi 16-pontos riportot (a válasz szövegében) a teljes
listáért.

## 13. Tesztek / tsc

Lásd a 16-pontos riportot.

## 14. VPS telepítési lépések

Lásd `vps-accessibility-sidecar/README.md` — TELJES egészében LEÍRÁS,
NEM VÉGREHAJTVA.

## 15. Nyitott kockázatok / korlátok (őszintén)

1. A MOTIS saját belső feed-generációja nem kereszt-bizonyítható ebből a
   repóból (lásd 6. pont) — ha a MOTIS és az index-generation valaha
   szétcsúszik, ezt jelenleg NEM észleljük automatikusan; csak az segít,
   hogy MINDKETTŐ ugyanabból a fájlból, ugyanazzal a build/deploy
   lépéssel frissül, ha a jövőbeli deploy-folyamat ezt garantálja.
2. A sidecar poll-alapú frissítése (10 mp) elméleti ablakot hagy, amiben
   egy frissen aktivált generation még nincs betöltve — ez ugyanaz a
   fail-safe útra esik (a lookup "unavailable"-t ad, sosem hibás
   pozitívot).
3. Nincs automatikus GC a `generations/` könyvtárra — hosszú távon
   (több éven át, gyakori GTFS-frissítéssel) ez lemezhasználati kérdést
   okozhat; ezt a kört tudatosan nem oldottuk meg (kézi/jövőbeli kör).
4. A parent_station-alapú station-cluster (spec 17/18. pont) a jelenlegi
   BKK feedben megfigyelt mezőkre épül — ha egy jövőbeli feed máshogy
   modellezi (pl. levels.txt), a subgraph-logika bővítendő.
5. Ez a kör NEM tesztelte a valódi VPS-t, a valódi Caddy-t, a valódi
   systemd-t — minden verifikáció Claude sandbox-mirror. A device-en/VPS-en
   futó valós parancsok (npm run test:vedett-route, tsc.cmd, egy valódi
   staging deploy) further elvégzendők, mielőtt ez éles adatot szolgálna
   ki.

## 16. GO / CONDITIONAL GO / NO-GO

Lásd a session végi riportot.
