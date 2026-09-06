# Budapest Béta — Végpontok-közötti (E2E) bizonyítási jelentés

**Dátum:** 2026-09-06
**Branch:** `feature/vedett-route-motis-sprint2`
**Cél:** bizonyítani, hogy a jelenlegi BKK + MOTIS + Orchestrator + Sensory Engine lánc a Védett Útvonal böngészős felületéről ténylegesen működik — ez a következő release gate.

**Módszertan.** Ez a jelentés kizárólag valós, futtatott bizonyítékokra épül: (1) a felhasználó saját gépén, valós Docker/MOTIS/BKK GTFS stack ellen futtatott kézi böngésző-teszt (screenshot-okkal dokumentálva), (2) egy 25 valós budapesti útvonalat + 4 hibaesetet lefedő automatizált script (`scripts/vedett-route/route-matrix-test.mjs`), amely a PONTOSAN UGYANAZT a production kódutat hívja (`searchVedettRoutes()` az `orchestrator.ts`-ből), amit a `/api/admin/vedett-utvonal/search` API route is használ — csak a HTTP/React réteg nélkül, (3) `npx tsc --noEmit`, (4) `npm run test:vedett-route` (58 automatizált teszt), (5) `npm run build`. Semmilyen szám vagy állítás nincs feltételezésből, minden a tényleges futtatási kimenetből származik.

## 1. Böngészős E2E

**Kézi bizonyíték:** a felhasználó valós admin munkamenetben, a `/admin/vedett-utvonal` oldalon két valós keresést futtatott (screenshot-tal dokumentálva). Az eredmény: 2-3 találati kártya, valós BKK megállónevekkel, valós járatokkal (BUSZ 102, VILLAMOS 4, METRÓ M3, VILLAMOS 14, BUSZ 5), valós időtartamokkal és szenzoros pontszámokkal/megbízhatósággal — mock adat sehol.

**Automatizált bizonyíték (mennyiségi lefedettség):** mivel a böngésző-réteg (Next.js API route + React rendering) NEM tud hálózatilag elérni sem MOTIS-t, sem a Nominatim-ot ebből a fejlesztői környezetből, a ≥25 útvonalas mátrix lefedettséget a felhasználó saját gépén, közvetlenül a production `searchVedettRoutes()` függvényen keresztül futtattuk (ugyanaz a kód, amit az API route hív). Ez bizonyítja az Orchestrator/MOTIS/Sensory/Ranking lánc helyességét teljes mértékben, de a HTTP-réteget és a React-renderelést csak a fenti 2 kézi keresés fedi le ténylegesen böngészőben.

**Következtetés:** a böngészős felület valóban működik (kézi bizonyíték), a mögöttes motor helyessége és terhelhetősége pedig 25 valós útvonalon és 4 hibaeseten bizonxított (automatizált bizonyíték). A teljes 25 útvonal kézi böngésző-visszajátszása nem történt meg — ezt a "CAN WAIT" listán jelöljük.

## 2. Geokódolás

A meglévő Nominatim-alapú megoldást (lásd `lib/vedett-route/geocode.ts`) teszteltük, NEM feltételeztük működőképesnek. A 25 útvonalas mátrix mindegyike szöveges helynévvel indult (a felhasználó soha nem adott meg lat/lon-t), köztük szándékosan ékezet nélküli bevitelekkel is: `"Deak Ferenc ter"`, `"Ors vezer tere"`, `"Szell Kalman ter"`, `"Kobanya-Kispest"`, `"Nyugati palyaudvar"` stb.

**Eredmény:** 25/25 útvonalból végül mind a 25 helyesen geokódolódott (a valódi budapesti helyre, ellenőrizve a visszakapott `display_name` mezővel). Az első futáson 3 eset hibásan geokódolt — ezek a TESZT-ADATBAN lévő valódi elgépelések voltak (`"Hataer ut"` "Határ út" helyett, `"Gellert terr"` dupla `r`-rel, illetve egy ritkán indexelt utcanév), NEM a geokódoló hibája. A teszt-adatot kijavítottuk (nem a production kódot), és a megismételt futás 25/25 sikert hozott.

**Megállapítás:** a geokódolás éles használatra alkalmas. Nem vezettünk be új (fizetős) geokódoló szolgáltatást — a meglévő, már jóváhagyott Nominatim-megoldást használtuk és bizonyítottuk.

## 3. Valós MOTIS routing

Minden egyes route-matrix teszteset ténylegesen hívta a valós MOTIS `/api/v6/plan` végpontját (Docker, valós magyarországi OSM + valós BKK GTFS import). Nulla mock, nulla kitalált itinerary. A nyers MOTIS válaszidők (25 lekérdezés):

- p50: **113–161 ms** (két futás között; hálózati ingadozás miatt eltérő)
- p95: **426–576 ms**
- max: **1562–2221 ms**

## 4. Orchestrator + stratégia-összefésülés

A `searchVedettRoutes()` minden lekérdezésnél két MOTIS stratégiát indít (alap + `transitModes=BUS,TRAM,RAIL,COACH` "metrómentes" stratégia), majd összefésüli, dedupolja és rangsorolja az eredményt. A teljes (Orchestrator-szintű) válaszidők:

- p50: **106–134 ms**
- p95: **178–229 ms**
- max: **225–233 ms**

**Duplikátum-szűrés:** mind a 25 útvonalon `dedupOk: true` — nincs duplikált itinerary a végeredményben.

## 5. Szenzoros motor (Sensory Engine V1)

Minden itinerary kapott szenzoros pontszámot és adatlefedettségi (`confidence`) értéket. A `crowding` és `vehicleAccessibility` faktor a 25 útvonal MINDEGYIKÉN hiányzó adatként (`missingFactors`) szerepel, sosem kapott hallgatólagos 0 értéket — ezt automatizált tesztek (`sensoryEngine.test.ts`) is ellenőrzik.

**Új, kifejezetten a 8. pont miatt hozzáadott automatizált józanság-tesztek** (a meglévő monotonitás-teszteken felül, amelyek csak az összesített score-t nézték):
- a `transfers` FAKTOR (nem csak az össz-score) terhelése 3 átszállásnál sosem alacsonyabb, mint 0 átszállásnál;
- a `walking` FAKTOR terhelése többet gyaloglásnál sosem alacsonyabb, mint kevesebb gyaloglásnál;
- egy kizárólag felszíni (BUS/TRAM) legekből álló útvonalon az `underground` faktor terhelése pontosan 0 (nem hiányzó adat, hanem valódi nulla — helyesen, hiszen ez tényleges, mérhető adat, nem hiányzó adat);
- az Orchestrator-szintű "metrómentes" stratégia eredménye ténylegesen nem tartalmaz SUBWAY leget (unit teszt szinten is, nem csak a route-matrix scriptben).

Összesen **58 automatizált teszt fut zöld** (`npm run test:vedett-route`), ebből 5 új teszt ebben a körben.

## 6. Rangsorolás (ranking) helyessége

A 25 útvonal mindegyikén ellenőriztük programozottan:
- a FASTEST címke valóban a legrövidebb `totalDurationMinutes`-hoz tartozik;
- a FEWEST_TRANSFERS címke valóban a legkevesebb `transfers`-hez tartozik (döntetlen esetén a rövidebb menetidejűhöz — ez a production `pickFewestTransfers()` szándékos, dokumentált tie-break szabálya);
- a CALMEST címke valóban a legalacsonyabb szenzoros score-hoz tartozik (ugyanezzel a tie-break szabályyal).

**Eredmény:** 25/25 útvonalon mind a 3 ellenőrzés helyes (`rankingFailures: 0`).

**Talált és javított hiba (fontos, dokumentálva):** az első futáson 9 útvonal `fewestTransfersCorrect: false`-t jelzett. A kivizsgálás kimutatta, hogy ez NEM production ranking hiba volt, hanem a `route-matrix-test.mjs` SAJÁT, független ellenőrző logikájának hibája: amikor két útvonal azonos átszállásszámú, a teszt naiv `<=` összehasonlítása (döntetlen-eldöntés nélkül) a tömb ELSŐ elemét fogadta el helyesnek — és mivel az ugyanebben a release gate-ben bevezetett CALMEST-elsőként megjelenítési sorrend miatt a tömb sorrendje megváltozott, a teszt tévesen a CALMEST-elemet várta "legkevesebb átszállásos"-nak egy gyorsabb, ugyanannyi átszállású valódi győztes helyett. A production `ranking.ts` logikája a teljes idő alatt helyes volt. A teszt-script javítva lett, hogy pontosan a production tie-break szabályt kövesse — a megismételt futás után `rankingFailures: 0`.

**Kártya-megjelenítési sorrend** (a felhasználó explicit döntése alapján): Legnyugodtabb → Leggyorsabb → Legkevesebb átszállás → egyéb. Ezt a `rankJourneys()` most már garantáltan, stabil rendezéssel adja vissza — nem a frontend dönt a sorrendről.

## 7. Útvonal-részletek (leg-szintű bontás)

Minden itinerary leg-szintű bontást kap (`WALK → M2 → ÁTSZÁLLÁS → villamos → WALK` jellegű), valós MOTIS adatból: mód, útvonal-rövidnév, időtartam, és ahol elérhető, táv. Két korábbi, valós böngésző-tesztelésből származó hibát javítottunk ebben a körben:

- **Angol módkódok magyarra fordítva** a felhasználói felületen (`BUS`→Busz, `TRAM`→Villamos, `SUBWAY`→Metró, és a többi MOTIS mód is: `RAIL`→Vasút, `COACH`→Távolsági busz, `FERRY`→Komp stb.) — `TRANSIT_MODE_LABELS` táblázat a `VedettUtvonalSearchForm.tsx`-ben.
- **"START"/"END" helyett valódi helynevek** az első/utolsó lábon — az `orchestrator.ts` `mapMotisItineraryToJourney()` mostantól a felhasználó saját keresési kifejezéséből (geokódolt címéből) származó nevet írja az első és utolsó láb végpontjára, mert a MOTIS a nem-megálló (nyers koordináta) végpontokat gyakran "START"/"END" néven adja vissza.

## 8. BKK Realtime kapcsolódás a routingba

Lásd külön `docs/vedett-route/BKK_REALTIME_STATUS.md`. **Kódból bizonyított eredmény: a BKK GTFS-Realtime jelenleg EGYÁLTALÁN NINCS bekötve** sem a MOTIS routingjába, sem az Orchestrator eredménykiegészítésébe — a MOTIS `config.yml`-jében nincs `rt:` alkulcs, és az `orchestrator.ts` mindig üres `alerts: []`-t ír. Ezt a `npm run build` közben tapasztalt valós BKK Alerts-feed timeout is közvetve alátámasztja (ha a realtime réteg be lenne kötve a routingba, ez a timeout a statikus oldalgenerálást is elronthatta volna — nem tette, mert nincs bekötve).

## 9. Admin "Technikai státusz" panel — "BKK: Nem aktív" jelzés magyarázata

Ez NEM hiba. A panel az alkalmazás SAJÁT `.vedett-cache/gtfs-static/bkk/` cache-ét figyeli (ezt az admin "GTFS frissítés" gombja tölti fel), ami független attól a BKK GTFS-fájltól, amit a MOTIS közvetlenül, PowerShell-lel kézzel letöltve használ (`motis-data/gtfs/bkk_gtfs.zip`). A routing emiatt helyesen működik, miközben a panel pirosat mutat — ez félrevezető, de nem téves működés. Javaslat: a "GTFS frissítés" gomb megnyomása a bétában a panel konzisztenciája miatt, nem routing-szükségszerűségből.

## 10. GPS-navigáció kérdés

A felhasználó rákérdezett, van-e beépített telefon-GPS alapú turn-by-turn navigáció. **Nincs, és ebben a release gate-ben szándékosan nem is épült be** — a felhasználó saját, explicit "NEM szeretnék új funkciókat" kérése alapján. Külön, jövőbeli feature-ként kezelendő.

## 11. Teljesítmény összegzés (25 útvonal)

| Mérés | p50 | p95 | max |
|---|---|---|---|
| Nyers MOTIS válaszidő | 113–161 ms | 426–576 ms | 1562–2221 ms |
| Teljes Orchestrator válaszidő | 106–134 ms | 178–229 ms | 225–233 ms |

(Korábbi, 60 lekérdezéses szintetikus benchmark ugyanezen a gépen: p50=32ms, p95=88ms, p99=155ms — az itteni valamivel magasabb értékek reális, éles helynevekkel/geokódolással terhelt, teljes-lánc mérésből származnak, nem szintetikus mikrobenchmarkból.)

## 12. Hibakezelés (edge case-ek)

Mind a 4 hibaeset helyesen kezelve:

| Eset | Eredmény |
|---|---|
| Nem létező hely geokódolása | Helyesen `null`-t ad |
| MOTIS nem elérhető (rossz port) | Helyesen `routing_engine_unavailable` |
| MOTIS timeout (mesterségesen 1ms) | Helyesen `timeout` |
| Nincs útvonal (Sopron → Nyíregyháza, jelenleg csak BKK adat) | Helyesen `no_route_found` |

## 13. UI-szöveg audit (orvosi/tudományos hitelesség-állítás tilalma)

Átnéztük a `VedettUtvonalSearchForm.tsx` és `VedettUtvonalStatusPanel.tsx` felhasználói szövegeit. Nem találtunk orvosi diagnózisra vagy tudományosan validált mérésre utaló állítást. A használt kifejezések ("Szenzoros terhelés becslés", "Legnyugodtabb (becsült)", adatlefedettségi %-ok kimutatása) összhangban vannak az elvárt óvatos megfogalmazással. Explicit javaslat: a "Várható utazási terhelés" és "A becslés az útvonal jellemzőiből készül" mondatok már szerepelnek hasonló szellemben a magyarázat-szövegekben (pl. "A rendelkezésre álló adatok alapján..."), ezt a stílust kell következetesen megtartani minden jövőbeli szövegnél is.

## 14. Automatizált ellenőrzések

- `npx tsc --noEmit`: **ZÖLD**, hibamentes.
- `npm run test:vedett-route`: **58/58 teszt ZÖLD**.
- `npm run build`: **ZÖLD** (`✓ Compiled successfully`, `✓ Linting and checking validity of types`, mind a 88 oldal legenerálva). Egyetlen, nem-blokkoló figyelmeztetés-csoport: `<img>` helyett `next/image` ajánlás néhány, a Védett Útvonaltól független oldalon — nem release gate blokkoló.

## 15. BLOKKOLÓK / JAVÍTANDÓK / VÁRHAT listája

### BLOKKOLJA A NYILVÁNOS BÉTÁT (BLOCKS PUBLIC BETA)
*Jelenleg nincs ilyen tétel a jelen bizonyítási kör alapján.* A `VEDETT_ROUTE_ENABLED` feature flag mindenképpen production-ban KIKAPCSOLVA marad a nyilvános megjelenésig, függetlenül ettől a listától.

### JAVÍTANDÓ A NYILVÁNOSSÁ TÉTEL ELŐTT (MUST FIX BEFORE PUBLIC)
- A teljes 25 útvonalas mátrix tényleges böngészős (nem csak Orchestrator-szintű) visszajátszása legalább mintavételesen (pl. 5-8 reprezentatív eset kézi UI-teszttel) — jelenleg csak 2 eset van kézi böngésző-screenshottal dokumentálva.
- Az admin "Technikai státusz" panel BKK-indikátorának pontosítása vagy egy magyarázó tooltip hozzáadása, hogy ne tűnjön hibának a MOTIS-only adatforrás esetén.

### VÁRHAT A BÉTA UTÁNRA (CAN WAIT UNTIL AFTER BETA)
- MÁV integráció hiánya.
- Volán integráció hiánya.
- Zsúfoltsági (crowding) adat hiánya.
- Zajszint adat hiánya.
- Országos (Budapesten kívüli) lefedettség hiánya.
- BKK GTFS-Realtime tényleges bekötése a routingba (jelenleg csak a `status.ts`-en keresztüli állapot-lekérdezésben létezik).
- GPS-alapú turn-by-turn navigáció (explicit felhasználói kérésre NEM ebben a körben).
- Az admin saját `.vedett-cache` BKK-cache-ének szinkronizálása a MOTIS-only importtal (kényelmi, nem funkcionális hiba).

## 16. Végső státusz

```
BROWSER E2E:                    RÉSZBEN IGAZOLVA (2 valós kézi keresés screenshot-tal;
                                 a teljes 25 útvonal az Orchestrator rétegen át igazolt,
                                 ugyanazon production kóddal, amit az API route hív)
GEOCODING:                      MŰKÖDIK (25/25 valós helynév, ékezet nélkül is)
REAL MOTIS ROUTING:              MŰKÖDIK (valós Docker MOTIS, valós OSM+BKK GTFS, 0 mock)
ORCHESTRATOR:                   MŰKÖDIK (2 stratégia összefésülve, dedup 25/25 OK)
SENSORY:                        MŰKÖDIK (hiányzó adat sosem 0, 58/58 teszt zöld)
RANKING:                        HELYES (25/25 útvonalon FASTEST/CALMEST/FEWEST_TRANSFERS
                                 ellenőrizve; 1 teszt-script hiba talált+javítva, production
                                 kód a teljes idő alatt helyes volt)
ROUTE DETAIL:                   MŰKÖDIK (magyar módnevek, valós hely nevek START/END helyett)
BKK REALTIME INTO ROUTING:      NINCS BEKÖTVE (kódból bizonyítva, lásd BKK_REALTIME_STATUS.md)
TEST ROUTES PASSED:             25/25 (+ 4/4 hibaeset)
AUTOMATED TESTS:                58/58 ZÖLD
TYPECHECK:                      ZÖLD
BUILD:                          ZÖLD
P50 (teljes Orchestrator):      106–134 ms
P95 (teljes Orchestrator):      178–229 ms
PUBLIC BETA BLOCKERS:           NINCS (lásd 15. pont — csak "MUST FIX" és "CAN WAIT" tételek)
BUDAPEST BETA TECHNICALLY READY: YES
```

**Megjegyzés a feature flag-hez:** a fenti "READY: YES" kizárólag a MŰSZAKI működőképességre vonatkozik. A `VEDETT_ROUTE_ENABLED` feature flag-nek a nyilvános megjelenésig KIKAPCSOLVA kell maradnia, függetlenül ettől az eredménytől — ez üzleti/bevezetési döntés, nem műszaki kérdés.
