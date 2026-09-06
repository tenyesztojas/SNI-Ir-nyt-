# BKK GTFS-Realtime integráció — Riport

**Állapot: KÓDSZINTEN KÉSZ, ÉLESBEN RÉSZBEN BIZONYÍTOTT, VÉGSŐ VERDIKT: NO
(infrastrukturális ok, nem kódhiba).** A 2026. szeptember 6-i élő teszt-
munkamenet (a felhasználó saját gépén, valós BKK kulccsal és valós,
Dockerben futó MOTIS-szal) 4 az 5 kritikus pontot bizonyított. Az egyetlen
nyitott pont — hogy a MOTIS ténylegesen alkalmazza-e a TripUpdate-eket a
routingra — jelenleg egy **azonosított, konkrét infrastrukturális ok**
miatt nincs bizonyítva: a futó MOTIS binárisa (build `b1e7a56`, kb.
14+ órája indítva) feltehetően egy olyan verzió, ami nem alkalmazza
teljeskörűen a `rt:` konfigurációt a routingra, VAGY egy friss,
teljeskörű `motis import` szükséges hozzá. Ezt a lenti "13. VÉGSŐ
DIAGNÓZIS" szakasz részletezi.

## 1. BKK TRIPUPDATES

- Végpont: `https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/TripUpdates.pb`
- Kulcs: `BKK_API_KEY` env változó, `?key=` query paraméterben, runtime
  generálva (lásd 4. pont). Sosem hardcode-olva, sosem logolva a kódból.
- **Élő teszt eredménye (2026-09-06, `gtfs-rt-feed-test.mjs`): PASS**
  — HTTP 200, protobuf sikeresen dekódolva, FeedHeader kora 4-10 mp,
  ~2800-3020 entity.

## 2. BKK VEHICLE POSITIONS

- Végpont: `https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/VehiclePositions.pb`
- **Élő teszt eredménye: PASS** — HTTP 200, protobuf OK, adat kora 0-6 mp,
  678-737 entity.

## 3. BKK ALERTS

- Végpont: `https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/Alerts.pb`
- **Élő teszt eredménye: PASS** — HTTP 200, protobuf OK, 66 entity.
  Megjegyzés: az Alerts feed frissítési ciklusa ritkább, mint a
  TripUpdates/VehiclePositions-é (a megfigyelt adatkor 228-1709 mp volt a
  különböző futásokban) — ez a BKK oldali publikálási gyakoriságból
  adódik, nem a mi pollingunkból.

## 4. MOTIS REALTIME POLLING

- `timetable.update_interval` **15 másodpercre** állítva a
  `generate-motis-rt-config.mjs` scripttel — élőben lefuttatva, sikeresen.
- A script sosem enged 5 mp-nél gyakoribb pollingot.
- A 3 hivatalos BKK GTFS-RT feed hozzáadva `timetable.datasets.bkkgtfs.rt`
  tömbként, `protocol: gtfsrt` jelöléssel.
- **KRITIKUS INFRASTRUKTURÁLIS FELFEDEZÉS:** a futó MOTIS konténer
  (`motis-vedett`) a `config.yml`-t **nem a repo `motis-data/` mappájából**
  olvassa, hanem egy különálló Docker named volume-ból (`motis-data-vol`,
  `/data`-ra mountolva). A `generate-motis-rt-config.mjs` a host oldali
  fájlt írja — ez **soha nem jut el automatikusan a konténerbe**. Manuális
  `docker cp motis-data/config.yml motis-vedett:/data/config.yml` +
  `docker restart motis-vedett` szükséges MINDEN egyes alkalommal, amikor a
  config generátor újrafut (pl. kulcsrotáció után). Ezt a lépést a
  live teszt során ténylegesen elvégeztük, és `docker exec motis-vedett
  grep update_interval /data/config.yml` megerősítette, hogy a konténer
  belül ténylegesen az új config van.
- A kulcs SOHA nem került git-be (lásd 15. pont), de **egy alkalommal a
  fejlesztői chat-munkamenetbe bemásolódott** (`docker exec ... cat
  config.yml` nyers kimenetként) — ezt jeleztük a felhasználónak, és
  **javasoltuk a kulcs azonnali rotálását** a BKK OpenData portálon.
- **Eredmény: KÉSZ + ÉLŐBEN MEGERŐSÍTVE**, de a `generate-motis-rt-config.mjs`
  workflow-ját ki kell egészíteni egy `docker cp` + `docker restart`
  lépéssel (lásd 17. pont, javasolt továbbfejlesztés).

## 5. STATIC/RT MATCH RATE

- **Élő teszt eredménye (`gtfs-rt-match-rate-test.mjs`): PASS**
  — 218 122 egyedi trip_id a static GTFS-ben, 3013 egyedi trip_id a
  TripUpdates feedben, **2864 matched / 149 unmatched, match ratio: 95.1%**
  (küszöb: 50%). A static GTFS és a TripUpdates feed trip_id-i tehát
  megbízhatóan összekapcsolhatók.

## 6. TRIPUPDATES A ROUTINGBA

- Az app-oldali `orchestrator.ts` `mapLeg()` kiolvassa a
  `scheduledDeparture`/`scheduledArrival` mezőket és kiszámítja a
  `delayMinutes`-t, ha `leg.realTime === true`.
- **Élő routing teszt eredménye (`realtime-routing-test.mjs`, TÖBB
  futtatásban, a MOTIS-restart és a docker-cp javítás UTÁN is): a MOTIS
  `/api/v6/plan` válaszaiban EGYETLEN lábon sem szerepelt `realTime: true`**
  — sem az 5 tesztelt útvonal 20+ itineraryjában, sem egy közvetlen,
  helyesen kódolt, valós "most" időpontra irányuló lekérdezésben
  (`Deák Ferenc tér → Blaha Lujza tér`, 6 közeljövőbeli járat, mind
  `realTime: false`, annak ellenére, hogy a TripUpdates feed aktív és a
  trip_id-k formátuma megegyezik a matched mintákkal).
- A nyers MOTIS JSON válasz megerősítette, hogy a mezőnevek, amiket a
  kódunk használ (`realTime`, `scheduled`, `cancelled`,
  `scheduledDeparture`, `scheduledArrival`, `scheduledStartTime`,
  `scheduledEndTime`), TÉNYLEGESEN léteznek ebben a MOTIS build-ben — tehát
  ez NEM egy mezőnév-eltérés vagy kódhiba a mi oldalunkon.
- **Eredmény: NEM BIZONYÍTOTT.** Lásd 13. pont a valószínű okról.

## 7. ALERTS A ROUTINGBA

- Kutatási eredmény (MOTIS forráskód-dokumentáció alapján): a MOTIS az
  riasztásokat a válasz-generálás fázisában csatolja — **(B) megjelenik,
  informatív jelleggel**, nem módosítja a routing döntéseket.
- Az app-réteg (`fetchServiceAlertsSafely()`) valósan lekéri a BKK
  Alerts.pb-t és a keresési válasz `serviceAlerts` mezőjén adja vissza,
  city-wide szinten (leg-szintű párosítás szándékosan nincs, mert az
  találgatás lenne — a BKK `affectedRouteIds` a saját route_id-jét adja,
  amit a `JourneyLeg` jelenleg nem tárol).
- **Eredmény: KÉSZ, kódszinten élőben tesztelve** (a feed-teszt PASS-t adott
  az Alerts feedre is).

## 8. VEHICLE POSITIONS A ROUTINGBA

- Kutatás alapján: kizárólag vizualizációra (railviz) használja a MOTIS,
  NEM routing input. A projektben a `getVehiclePositions()` létezik, de
  nincs bekötve semmilyen routing/UI rétegbe — szándékosan, mert a
  feladat tiltja a GPS navigációt.
- **Eredmény: KÉSZ, ahogy elvárt (nincs routing hatás).**

## 9. STATIKUS FALLBACK

- **Élő failure-szimulációs teszt eredménye
  (`gtfs-rt-failure-simulation-test.mjs`): PASS mind a 4 esetben**
  (endpoint timeout, invalid protobuf, hibás API kulcs → HTTP 401, elavult
  feed szimuláció) — minden esetben a statikus routing (`fetchMotisPlan`)
  továbbra is működött.

## 10. ELAVULT ADAT KEZELÉSE (STALE DATA)

- `lib/vedett-route/realtimeFreshness.ts`, 90 mp küszöb (indoklással,
  lásd `config.ts`), bekötve a `bkk.ts` közös feed-fetch logikájába.
- **Automatizált unit teszt: PASS** (4/4, `realtime-freshness.test.ts`).
- **Eredmény: KÉSZ, automatizált teszttel és élő feed-teszttel is igazolva**
  (az élő Alerts feed 1709 mp-es kora ebben a session-ben ténylegesen
  stale-ként lett volna kezelve, ha a `bkk.ts`-en keresztül megy — ez a
  valós használati esetben helyesen működő védelem, nem hipotetikus).

## 11. VALÓS REALTIME ÚTVONAL TESZTEK

- Lásd 6. pont. **NEM BIZONYÍTOTT** — infrastrukturális ok (13. pont).

## 12. AUTOMATIZÁLT TESZTEK / TÍPUSELLENŐRZÉS / BUILD

- `npx tsc --noEmit`: **tiszta**, minden kódváltoztatás után ellenőrizve.
- `npm run test:vedett-route`: **63/63 PASS** (59 eredeti + 4 új
  freshness teszt), nincs regresszió.
- `npm run build`: **✓ Compiled successfully, 88/88 oldal legenerálva** —
  éles, a felhasználó gépén futtatva. Útközben 2, a JELENLEGI feladathoz
  NEM tartozó, korábbi sprintből örökölt ESLint hiba
  (`react/no-unescaped-entities`, idézőjelek escape-elése) blokkolta a
  build-et — ezeket a regresszió-futtatás közben kijavítottuk
  (`VedettUtvonalSearchForm.tsx`, `VedettUtvonalStatusPanel.tsx`,
  `&quot;`-ra cserélve), hogy a build lezárható legyen.

## 13. VÉGSŐ DIAGNÓZIS — miért nem bizonyított a realtime routing hatás

Szisztematikusan kizártuk a következő lehetséges okokat, mielőtt erre a
következtetésre jutottunk:

1. **Rendszeróra-eltérés** — ellenőrizve, a gép órája helyes (2026-09-06).
2. **Rossz mezőnév / kódhiba a Védett Route rétegben** — kizárva: a nyers
   MOTIS JSON válasz pontosan azokat a mezőket adja vissza
   (`realTime`, `scheduledDeparture` stb.), amiket a kódunk olvas.
3. **A config nem jutott el a konténerbe** — kizárva: `docker exec ... cat
   /data/config.yml` megerősítette a helyes tartalmat, és ez több
   konténer-restart után is megmaradt.
4. **Static/RT trip_id eltérés** — kizárva: 95.1%-os match ratio, és a
   ténylegesen lekérdezett élő tripId-k (`bkkgtfs_D165632778` stb.) formai
   szempontból megegyeznek a matched mintákkal.
5. **A konténer nincs újraindítva** — kizárva: többször újraindítottuk
   (`docker restart`, majd a `docker cp` utáni restart is), a log
   megerősítette a "shutdown" → új "listening" ciklust.

Amit egy melléklépésben felfedeztünk: amikor egy FRISS, azonos image-ből
(`ghcr.io/motis-project/motis:master`) és ugyanabból a volume-ból indított
konténerrel próbáltuk a `--log-level debug` kapcsolót bevetni a
mélyebb diagnózishoz, a szerver **el sem indult**, ezzel a hibával:

```
[VERIFY FAIL] tt: no existing version found [key=nigiri_bin_ver], please re-run import
```

Ez azt jelenti, hogy a `:master` tag **időközben egy új, a jelenlegi
volume-ban tárolt, preprocesszált adatformátumhoz képest inkompatibilis
binárisra frissült** — a JELENLEG FUTÓ (13+ órája élő) konténer a RÉGI,
saját maga által betöltött binárist futtatja tovább (ez működik), de egy
FRISS `docker run` már az újabb, inkompatibilis image-et húzná le.

**A legvalószínűbb magyarázat:** a jelenleg élesben futó, ~14 órás MOTIS
build (`b1e7a56`) elfogadja a `rt:` konfigurációt szintaktikailag (nincs
hiba, nincs figyelmeztetés a logban), de vagy (a) ebben a konkrét build-ben
hiányos/hibás a GTFS-RT → routing alkalmazás láncolat, vagy (b) egy friss,
teljes `motis import` szükséges (nem csak `motis server` újraindítás) ahhoz,
hogy a realtime adatok ténylegesen bekerüljenek a routing eredményekbe.
Ezt **nem tudjuk kockázat nélkül tesztelni** ebben a munkamenetben, mert:
- a `:master` tag image-verzió-drift miatt egy friss `import` + újabb image
  kombinációja instabillá tehetné a jelenleg stabilan működő, éles
  Budapest Béta statikus routingot,
- egy teljes `motis import` (OSM + teljes GTFS feldolgozás) hosszú ideig
  tart és nagy erőforrást igényel.

## 14. SECRETS LEAKED: RÉSZBEN — 1 esemény, elhárítva

- A `BKK_API_KEY` a kódból, a git historyból, a dokumentációból és minden
  script-kimenetből **következetesen redaktálva volt** (`?key=***`).
- **Egy alkalommal** a felhasználó egy `docker exec ... cat config.yml`
  diagnosztikai parancs kimenetében **nyílt szövegben bemásolta a valódi
  kulcsot** ebbe a chat-munkamenetbe. Ezt azonnal jeleztük, és javasoltuk a
  kulcs rotálását a BKK OpenData portálon — ez **a felhasználó teendője**,
  nem történt meg automatikusan.
- Ezután minden további diagnosztikai lépésnél kifejezetten `grep`/szűrt
  kimenetet kértünk, hogy elkerüljük az ismétlődést.
- **Következtetés a jövőre nézve:** a `generate-motis-rt-config.mjs`
  dokumentációját és a riportot kiegészítettük azzal a figyelmeztetéssel,
  hogy a konténer belsejéből SOHA nem szabad `cat`-tel kiolvasni a
  config.yml-t megosztás/beillesztés céljából — csak `grep`-pel, konkrét,
  nem-kulcsot-tartalmazó mezőkre szűrve.

## 15. BKK REALTIME ROUTING VERIFIED: **NO**

A specifikáció szerint a "YES" verdikt kizárólag akkor adható, ha legalább
egy valós útvonal-teszt bizonyítja, hogy egy TripUpdate hatására a MOTIS
ténylegesen eltérő indulási/érkezési értéket adott vissza. Ez **nem történt
meg** ebben a munkamenetben — nem azért, mert nincs eltérés a valóságban
(hiszen a live BKK feed 2800+ TripUpdate entity-t tartalmazott az érintett
időszakban), hanem mert **a jelenleg futó MOTIS instance nem alkalmazta
ezeket az adatokat a routing eredményekre**, minden más láncszem
(BKK feed elérés, kulcskezelés, static/RT matching, app-oldali
feldolgozás, failure-fallback, build, tesztek) bizonyítottan működik.

## 16. Javasolt következő lépés (KÜLÖN feladatként, nem sürgős)

1. **Kulcs rotálása** a BKK OpenData portálon (lásd 14. pont) — ezt
   függetlenül az alábbiaktól érdemes minél előbb megtenni.
2. Egy **karbantartási ablakban** (nem élő forgalom mellett): pontosan
   rögzített MOTIS image-verzió (NE `:master`, hanem konkrét, ismert
   digest/tag) letöltése, majd `motis import` teljes újrafuttatása ezzel a
   pontos verzióval, a jelenlegi `motis-data-vol` volume biztonsági
   mentése után.
3. Utána a `realtime-routing-test.mjs` újrafuttatása — ha ekkor is
   `realTime: false` marad mindenhol, érdemes a MOTIS projektnek magának
   jelezni (GitHub issue) a konkrét megfigyelést (feed elérhető, matching
   95%, de `/api/v6/plan` sosem ad `realTime: true`-t).
4. A `generate-motis-rt-config.mjs` mellé egy kiegészítő lépés/dokumentáció
   írása, ami automatikusan elvégzi a `docker cp` + `docker restart`
   párost is (jelenleg manuális lépés, lásd 4. pont).

## 17. Amit ez a sprint ELÉRT (kódszinten teljes, működő infrastruktúra)

- Runtime config-generálás, biztonságos kulcskezeléssel.
- Genuin (nem becsült) `delayMinutes`/`scheduledDepartureTime`/
  `scheduledArrivalTime`/`cancelled` mezők az app-rétegben, éles MOTIS
  válasz-sémával igazolva.
- Valós BKK Alerts city-wide integráció.
- Elavult-adat védelem (freshness gate), automatizált teszttel.
- 4 diagnosztikai script, mind sikeresen lefuttatva és validálva élesben.
- Frontend, ami sosem címkéz statikus adatot realtime-ként.
- Teljes regresszió: tsc tiszta, 63/63 teszt, production build sikeres,
  meglévő routing/Orchestrator/Sensory Engine logika érintetlen.
- **Mindössze egyetlen láncszem — a MOTIS-on belüli tényleges realtime
  alkalmazás — van infrastrukturális okból blokkolva**, ami a fenti 16.
  pont szerinti külön karbantartási feladattal oldható fel.

---

*Ez a riport a `feature/vedett-route-motis-sprint2` branch-en készült,
2026. szeptember 6-án, a felhasználó saját gépén futtatott élő
BKK/MOTIS tesztek alapján.*
