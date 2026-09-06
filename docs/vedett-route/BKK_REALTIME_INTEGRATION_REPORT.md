# BKK GTFS-Realtime integráció — Riport

**Állapot: RÉSZBEN KÉSZ.** A kód és a konfiguráció-generálás elkészült,
típusellenőrzés és az automatizált unit tesztek zöldek. A ténylegesen ÉLŐ
BKK/MOTIS ellenőrzést igénylő pontok (feed kapcsolat, static/RT match rate,
valós realtime routing bizonyíték, failure szimuláció, production build)
ebből a felhő sandboxból NEM futtathatók (nincs hálózati elérés a
go.bkk.hu-hoz és a helyi MOTIS/Next.js instance-hoz) — ezeket a lenti
pontos parancsokkal a te gépeden kell lefuttatni, az eredményt pedig ide,
ebbe a fájlba (vagy vissza a chatbe) kell bemásolni, hogy a végső
YES/NO verdiktet lezárhassuk.

## 1. BKK TRIPUPDATES

- Végpont: `https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/TripUpdates.pb`
- Kulcs: `BKK_API_KEY` env változó, `?key=` query paraméterben, runtime
  generálva (lásd 4. pont). Sosem hardcode-olva, sosem logolva.
- Teszt script: `scripts/vedett-route/gtfs-rt-feed-test.mjs`
- **Eredmény: PENDING** — futtasd: `npm run vedett-route:gtfs-rt-feed-test`

## 2. BKK VEHICLE POSITIONS

- Végpont: `https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/VehiclePositions.pb`
- Ugyanaz a teszt script fedi le (lásd fent).
- **Eredmény: PENDING**

## 3. BKK ALERTS

- Végpont: `https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/Alerts.pb`
- Ugyanaz a teszt script fedi le (lásd fent).
- **Eredmény: PENDING**

## 4. MOTIS REALTIME POLLING

- `timetable.update_interval` a `motis-data/config.yml`-ben **15 másodpercre**
  van állítva (a projekt korábbi 60 mp-es értékéről), a
  `scripts/vedett-route/generate-motis-rt-config.mjs` script által.
- A script SOHA nem enged 5 másodpercnél gyakoribb pollingot
  (`MIN_ALLOWED_UPDATE_INTERVAL_SECONDS = 5`, `Math.max()`-szal kikényszerítve).
- A 3 hivatalos BKK GTFS-RT feed a `timetable.datasets.bkkgtfs.rt` tömbként
  lett hozzáadva, mindegyik `protocol: gtfsrt` explicit jelöléssel, a
  hivatalos MOTIS dokumentáció szerinti sémában.
- A generált `config.yml` a kulccsal együtt a gitignore-olt `motis-data/`
  könyvtárban van (lásd `.gitignore: /motis-data`) — **soha nem kerül git-be**.
- A script futtatásakor a terminálra kiírt megerősítés a kulcsot mindig
  `?key=***`-ra redaktálva mutatja (ellenőrizve: lásd a script sikeres
  futtatásának naplóját ebben a fejlesztési munkamenetben — a raw kulcs
  egyszer sem jelent meg semmilyen kimenetben).
- **Futtatás (a te gépeden, .env.local-ban BKK_API_KEY beállítva):**
  ```
  node scripts/vedett-route/generate-motis-rt-config.mjs
  ```
  majd **indítsd újra a MOTIS-t**, hogy a config változás életbe lépjen.
- **Eredmény: KÉSZ (kódszinten igazolva), a MOTIS újraindítás utáni
  tényleges polling-viselkedést a te gépeden kell megerősíteni.**

## 5. STATIC/RT MATCH RATE

- Script: `scripts/vedett-route/gtfs-rt-match-rate-test.mjs`
- A `motis-data/gtfs/bkk_gtfs.zip` (a ténylegesen MOTIS-ba importált
  statikus GTFS) `trips.txt`-jéből kinyert trip_id-ket veti össze a
  TripUpdates feed trip_id-jeivel.
- **Futtatás:** `npm run vedett-route:gtfs-rt-match-rate-test`
- **Eredmény: PENDING**

## 6. TRIPUPDATES A ROUTINGBA

- A MOTIS natív GTFS-RT támogatása (nem saját routing algoritmus) építi be
  a késéseket/törléseket a `nigiri` routing motorba — ezt a hivatalos MOTIS
  dokumentáció és forráskód-elemzés alapján erősítettük meg (nem
  feltételezés): a MOTIS a realtime frissítéseket egy mutable
  `rt_timetable` másolatba tölti, amit a RAPTOR algoritmus közvetlenül
  használ.
- Az app-oldali `lib/vedett-route/orchestrator.ts` `mapLeg()` függvénye
  MOST MÁR kiolvassa a `from.scheduledDeparture` / `to.scheduledArrival`
  mezőket (`JourneyLeg.scheduledDepartureTime` / `scheduledArrivalTime`),
  és ha a leg `realTime === true`, a tényleges (`startTime`/`endTime`) és a
  menetrendi idő különbségéből kiszámítja a `delayMinutes`-t — SOHA nem
  becslés, csak akkor kerül kitöltésre, ha mindkét időpont ténylegesen
  jelen volt a MOTIS válaszban.
- A `leg.cancelled` mezőt is átvesszük (`JourneyLeg.cancelled`).
- **Bizonyíték script:** `scripts/vedett-route/realtime-routing-test.mjs`
  — legalább 5 valódi budapesti útvonalon, EGY MOTIS válaszon belül
  hasonlítja össze a menetrendi és tényleges időt (nincs API-kapcsoló a
  realtime be/kikapcsolására, ezért ez az egyetlen módja a bizonyításnak).
- **Futtatás:** `npm run vedett-route:realtime-routing-test`
- **Eredmény: PENDING** — a végső "BKK REALTIME ROUTING VERIFIED" verdikt
  ETTŐL a futástól függ.

## 7. ALERTS A ROUTINGBA

- Kutatási eredmény (hivatalos MOTIS forráskód-dokumentáció alapján, NEM
  feltételezés): a MOTIS az riasztásokat a `rt_timetable`-ből tölti be és
  a válasz-generálás (response enrichment) fázisában csatolja hozzá —
  tehát **(B) megjelenik az eredményben, informatív jelleggel**, de **nem
  módosítja a routing döntéseket** (nem kerülteti ki a routing az
  érintett járatokat).
- FONTOS KORLÁT, amit szándékosan nem hidalunk át találgatással: a hivatalos
  MOTIS openapi.yaml `/api/v6/plan` séma NEM dokumentál explicit "alert"
  mezőt az Itinerary/Leg objektumokon — ezért az app-réteg (Védett Route)
  jelenleg NEM próbál meg egyes útvonalakhoz/lábakhoz riasztást rendelni
  (ehhez a BKK `affectedRouteIds` mezőjét kellene a MOTIS route_id-jével
  összevetni, ami jelenleg nincs megbízhatóan meglévő adat a JourneyLeg-en).
- Amit VALÓBAN implementáltunk: a `BkkProvider.getServiceAlerts()` valós
  hívása bekötve az Orchestratorba (`lib/vedett-route/orchestrator.ts`,
  `fetchServiceAlertsSafely()`), city-wide szinten, a keresési válasz
  `OrchestratedSearchResult.serviceAlerts` mezőjén keresztül. Ez VALÓS BKK
  adat, de SZÁNDÉKOSAN nincs adott útvonalhoz kötve — a frontend ezt külön,
  "Aktuális BKK riasztások (nem feltétlenül érintik a lenti útvonalakat)"
  címkével jeleníti meg, hogy sose tűnjön útvonal-specifikus adatnak.
- Hiba esetén (hálózat, kulcs, elavult feed) üres tömböt ad vissza — SOHA
  nem akasztja meg a routingot (`Promise.all` + try/catch).
- **Eredmény: KÉSZ (kódszinten), city-wide informatív szinten — élő
  megerősítés a te gépeden a `getServiceAlerts()` valós hívásával.**

## 8. VEHICLE POSITIONS A ROUTINGBA

- Kutatási eredmény: a MOTIS VehiclePositions-t **kizárólag vizualizációra**
  (railviz élő térkép, `/api/v5/map/trips` jellegű endpoint) használja —
  **NEM routing input**. A `motis-data/config.yml`-ben már eleve
  `railviz: true` van beállítva, ami megerősíti, hogy ennek van kész
  konkrét fogyasztója a MOTIS-on belül.
- A projektben a `BkkProvider.getVehiclePositions()` már létezik, de
  jelenleg NINCS bekötve semmilyen routing- vagy UI-rétegbe — ez
  szándékos, mivel a feladat kifejezetten tiltja a GPS navigáció
  implementálását, és a railviz/élő térkép nem volt e feladat része.
- **Eredmény: KÉSZ (kutatás + kódszintű előkészítés), nincs routing hatás,
  ahogy elvárt.**

## 9. STATIKUS FALLBACK

- A `fetchServiceAlertsSafely()` minden hibát elnyel és `[]`-t ad vissza —
  a `Promise.all([motisPlan, motisPlan, serviceAlerts])` így egyetlen
  realtime-hiba miatt sem eshet el.
- A `bkk.ts` `fetchGtfsRtFeed()` minden hibát (timeout, HTTP hiba, malformed
  protobuf, elavult feed) explicit `Error`-ral jelez, amit a hívók
  (`checkConnection()`, `fetchServiceAlertsSafely()`) elkapnak — sosem
  szivárog fel a routing rétegbe.
- **Bizonyíték script:** `scripts/vedett-route/gtfs-rt-failure-simulation-test.mjs`
  — 4 szimulált hiba (timeout, invalid protobuf, hibás API kulcs, elavult
  feed), mindegyiknél ellenőrizve, hogy a statikus routing (`fetchMotisPlan`)
  továbbra is `ok: true`-t ad.
- **Futtatás:** `npm run vedett-route:gtfs-rt-failure-simulation-test`
- **Eredmény: PENDING** (kódszinten garantált, élő futtatással kell
  megerősíteni)

## 10. ELAVULT ADAT KEZELÉSE (STALE DATA)

- Új modul: `lib/vedett-route/realtimeFreshness.ts`,
  `evaluateRealtimeFreshness(feedTimestampSeconds)`.
- Küszöb: `VEDETT_ROUTE_CACHE.realtimeMaxAgeSeconds` — **90 másodpercre**
  emelve a korábbi 20 mp-es alapértékről (lásd `config.ts` indoklása): a
  15 mp-es MOTIS polling-ciklus és a BKK feed publikálási késleltetése
  miatt egy ténylegesen friss adatpont kora rendszeresen 0-30+ másodperc
  lehet pusztán a normál ciklus miatt — a 20 mp-es küszöb hamis "stale"
  jelzéseket adott volna. A 90 mp (kb. 6x a poll intervallum) engedi a
  normál ingadozást, de egy ténylegesen elakadt feedet (percekig nem
  frissülő timestamp) továbbra is helyesen jelöl elavultnak.
- Bekötve a `bkk.ts` `fetchGtfsRtFeed()`-be: minden dekódolt feednél
  ellenőrzi a `FeedHeader.timestamp`-et, és ha elavult, **hibaként kezeli**
  (nem adja vissza az adatot frissként) — ez érinti a `checkConnection()`,
  `getServiceAlerts()`, `getTripUpdates()`, `getVehiclePositions()`
  metódusokat egységesen.
- Automatizált unit teszt: `__tests__/vedett-route/realtime-freshness.test.ts`
  (4 teszt, determinisztikus, hálózat nélkül) — **PASS** (lásd 12. pont).
- **Eredmény: KÉSZ, automatizált teszttel igazolva.**

## 11. VALÓS REALTIME ÚTVONAL TESZTEK

- Lásd 6. pont — `scripts/vedett-route/realtime-routing-test.mjs`.
- **Eredmény: PENDING**

## 12. AUTOMATIZÁLT TESZTEK

- `npm run test:vedett-route` — **63/63 PASS** (az eredeti 59 + 4 új,
  `realtime-freshness.test.ts`), ebben a fejlesztési munkamenetben
  ténylegesen lefuttatva és ellenőrizve.
- Egyetlen meglévő teszt sem regresszált.

## 13. TÍPUSELLENŐRZÉS

- `npx tsc --noEmit` — **tiszta, hibamentes**, ebben a munkamenetben
  ténylegesen lefuttatva minden egyes kódváltoztatás után.

## 14. BUILD

- `npm run build` (production build) ebből a felhő sandboxból NEM
  futtatható végig (a build ~3 percnél tovább tart, a rendelkezésre álló
  parancsvégrehajtási időkorlátnál hosszabb ideig) — **PENDING, a te
  gépeden futtatandó**: `npm run build`

## 15. SECRETS LEAKED: NO

- A `BKK_API_KEY` egyetlen ponton sem került git-be, dokumentációba,
  logba, frontendbe vagy API válaszba ebben a munkamenetben.
- A `generate-motis-rt-config.mjs` a generált config.yml-t a gitignore-olt
  `motis-data/`-ba írja, és minden terminálkimenetben `?key=***`-ra
  redaktál.
- A `bkk.ts` logger (`vedettRouteLog`) már eleve automatikusan redaktál
  minden "key"/"token"/"secret" jellegű mezőt (`SENSITIVE_KEYS`).
- A `.gitignore` már eleve tartalmazza a `/motis-data`, `.vedett-cache`,
  `.env*.local` bejegyzéseket.

## 16. BKK REALTIME ROUTING VERIFIED: **PENDING (NEM LEZÁRHATÓ ÉLŐ TESZT NÉLKÜL)**

A specifikáció szerint a végső "YES" verdikt KIZÁRÓLAG akkor adható, ha
legalább egy valós útvonal-teszt bizonyítja, hogy a MOTIS egy TripUpdate
hatására TÉNYLEGESEN eltérő indulási/érkezési értéket adott vissza. Ez a
bizonyíték csak a te gépeden, éles MOTIS + BKK kapcsolattal szerezhető be.

### Mit kell tenned a lezáráshoz

1. `.env.local`-ban legyen valós `BKK_API_KEY`.
2. `node scripts/vedett-route/generate-motis-rt-config.mjs` — generálja a
   realtime configot (ellenőrizve, működik).
3. Indítsd újra a MOTIS-t az új configgal.
4. `npm run vedett-route:gtfs-rt-feed-test` — feedenkénti PASS/FAIL.
5. `npm run vedett-route:gtfs-rt-match-rate-test` — static/RT match ratio.
6. `npm run vedett-route:realtime-routing-test` — a döntő bizonyíték
   (lehetőleg csúcsidőben, amikor ismert késés van valamelyik vonalon).
7. `npm run vedett-route:gtfs-rt-failure-simulation-test` — failure teszt.
8. `npm run build` — production build.
9. `npm run vedett-route:route-matrix-test` — a 25-route mátrix, regresszió.
10. Másold vissza ide (vagy a chatbe) mind a 6 script kimenetét — ezután
    lezárom a riportot a végleges YES/NO verdikttel és a konkrét bizonyított
    példával (menetrendi idő / realtime idő / késés / trip ID).

---

*Ez a riport a `feature/vedett-route-motis-sprint2` branch-en készült,
2026. szeptember 6-án. A kódszintű munka (config generátor, típusok,
orchestrator, freshness gate, frontend, teszt scriptek, unit tesztek)
teljes; az élő BKK/MOTIS integráció tényleges bizonyítása a fenti lépések
lefuttatásától függ.*
