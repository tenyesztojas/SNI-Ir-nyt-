# Map / GPS / Rest Points sprint — Zárójelentés

**Dátum: 2026-09-07.** Ez a sprint a Védett Útvonal térkép megjelenítést
(MapLibre), a GPS V1 funkciót és egy teljesen új, elkülönített
pihenőpont (rest point) adatmodellt vezette be — a VPS provisioning
folyamat közben, a lokális MOTIS környezet érintése NÉLKÜL.

## Státusz-checklist

```
BKK NEW KEY CHECK:            PASS (mindhárom feed: TripUpdates 6923,
                               VehiclePositions 1658, Alerts 79 entity —
                               2026-09-07-i futtatás, npm run
                               vedett-route:gtfs-rt-feed-test)
LOCAL MOTIS FROZEN:           YES — a motis-data-vol volume, a
                               motis-vedett konténer és a :master image
                               NEM lett módosítva, NEM indult új import.
                               Lásd VPS_MOTIS_HANDOFF.md B) pont a
                               rögzített (csak megfigyelt) állapotért.
VPS HANDOFF:                  DOCUMENTED — docs/vedett-route/
                               VPS_MOTIS_HANDOFF.md, terv, NEM
                               végrehajtva.
MAPLIBRE:                     DONE — maplibre-gl@^4.7.1 telepítve
                               (package.json + node_modules
                               megerősítve), VedettUtvonalMap.tsx
                               komponens elkészült, next/dynamic
                               { ssr: false } wrapperrel a
                               VedettUtvonalSearchForm.tsx-ben.
MOTIS GEOMETRY:                VERIFIED SUFFICIENT — valós MOTIS
                               válaszban megfigyelt legGeometry.points
                               (Google encoded polyline, precision: 6)
                               mezőt dekódoljuk (lib/vedett-route/
                               geometry.ts), NEM lett hozzáadva
                               második utcaszintű routing engine.
GPS:                           DONE (V1) — lib/hooks/useGeolocation.ts,
                               explicit felhasználói engedélykéréssel
                               (getCurrentPosition + watchPosition),
                               denied/unavailable/timeout állapotokkal.
GPS STORED:                    NEVER (folyamatos pozíció) — kizárólag
                               React state-ben, session-scoped, soha
                               nem kerül Supabase-be, soha nem
                               logolva. EGYETLEN kivétel: a
                               felhasználó EXPLICIT pihenőpont-mentése,
                               ami csak azt az egy, aktívan létrehozott
                               koordinátát perzisztálja — lásd Q)
                               szakasz lent.
REST POINT SCHEMA:             DONE — supabase/migrations/
                               20260907_rest_points.sql, teljesen
                               elkülönített rest_points tábla
                               (nincs kapcsolat a places/providers/
                               partners/service-location táblákkal).
RLS:                            DONE — SELECT/INSERT/UPDATE/DELETE
                               mind created_by = auth.uid()-ra
                               korlátozva, cross-user hozzáférés nincs
                               engedélyezve semmilyen műveletre.
PRIVATE USER REST POINT:       DONE — minden USER forrású pont
                               alapból PRIVATE (DB default + CHECK
                               constraint), csak a létrehozó látja,
                               nincs automatikus közösségi ajánlás.
MAP DISPLAY:                   DONE — induló pont, célpont, teljes
                               útvonal (mode szerint színezett
                               LineString-ek), gyaloglás/tömegközlekedés
                               szakaszok, megállók (intermediateStops),
                               aktuális GPS pozíció (ha engedélyezett),
                               saját pihenőpontok — mind megjelenik a
                               VedettUtvonalMap.tsx-ben.
VEDETT SAROK INTEGRATION PLAN: DOCUMENTED — lásd O) szakasz lent,
                               NEM implementálva.
OSM REST POINT PLAN:           DOCUMENTED — lásd P) szakasz lent,
                               NEM implementálva, nincs tömeges import.
AUTOMATED TESTS:                PASS (115/115) — lásd "Automatizált
                               tesztek" szakasz lent a pontos
                               fájllistáért és lefedettségért.
TYPECHECK:                      PASS — `npx tsc --noEmit` hibamentesen
                               lefutott (a maplibre-gl telepítése
                               után).
BUILD:                          PENDING — a `npm run build` ebben a
                               munkamenetben nem futott le a
                               futtatási időkorlát miatt (a build
                               konzisztensen túllépte a rendelkezésre
                               álló időkeretet); a felhasználónak
                               PowerShellben kell lefuttatnia és
                               visszaigazolnia.
READY FOR VPS:                  YES (a Sprint E./VPS provisioning terv
                               dokumentálva van, a lokális MOTIS
                               környezet érintetlen; a tényleges VPS
                               végrehajtás egy külön munkamenet
                               feladata)
READY FOR SPRINT E:             CONDITIONAL — a kód/RLS/architektúra
                               kész, DE a `npm run build` PowerShell
                               visszaigazolása még hiányzik (lásd
                               BUILD sor) — ezt érdemes elvégezni,
                               mielőtt a branch mergelésre kerül.
```

## Automatizált tesztek

Az R) pontban felsorolt kategóriák lefedettsége, `node --test`
futtatással (115/115 teszt PASS ebben a sprintben, a korábbi tesztek is
mind megőrizve, regresszió nélkül):

- **MOTIS geometry parsing / malformed geometry handling** —
  `__tests__/vedett-route/geometry.test.ts` (7 teszt, valós MOTIS
  encoded polyline stringgel + hibás/hiányzó bemenet biztonságos
  kezelésével).
- **Coordinate validation** — `__tests__/rest-points/schemas.test.ts`
  (16 teszt: érvényes/érvénytelen szélességi-hosszúsági fok tartomány,
  hiányzó/üres/túl hosszú név, típushiba, update-séma).
- **Private rest point creation / read, cross-user read/update/delete
  forbidden** — `__tests__/rest-points/rls-policy.test.ts` (10 teszt).
  **FONTOS MEGJEGYZÉS AZ ŐSZINTESÉGHEZ:** ez egy STATIKUS, a migrációs
  SQL szövegét ellenőrző "policy shape" teszt, NEM egy élő Supabase
  adatbázison futó integrációs teszt (ebben a futtatási környezetben
  nincs élő DB kapcsolat). A tényleges cross-user tiltás élesben való
  bizonyítása a felhasználó saját, live Supabase környezetben végzett
  manuális/scriptelt ellenőrzésének a feladata.
- **Authenticated architecture** —
  `__tests__/vedett-route/access-architecture.test.ts` (8 teszt):
  `VEDETT_ROUTE_ACCESS_LEVEL` regresszió (`"admin_only"` marad),
  `requireVedettRouteAuthenticated`/`requireVedettRouteAccess` forráskód-
  szintű létezés- és elágazás-ellenőrzés. Szintén STATIKUS —
  `access.ts` futásidejű importja `next/server`-t igényelne, ami plain
  `node --test` alatt (Next.js runtime kontextus nélkül)
  `ERR_MODULE_NOT_FOUND`-ot dob, ezért a forráskódot szövegesen
  ellenőrizzük, nem futtatjuk.
- **GPS denied fallback / GPS unavailable fallback** —
  `__tests__/hooks/geolocation-error-mapping.test.ts` (5 teszt): a
  `mapError()` logikai függvény PERMISSION_DENIED/TIMEOUT/
  POSITION_UNAVAILABLE/ismeretlen kód → denied/timeout/unavailable
  leképezése, valós DOM/böngésző nélkül.
- **Route remains active after rest point save** —
  `__tests__/vedett-route/rest-point-route-stability.test.ts` (4 teszt):
  forráskód-szintű ellenőrzés, hogy a `RestPointQuickAdd` `onCreated`
  callback-je a `VedettUtvonalSearchForm`-ban kizárólag
  `sessionRestPoints`-ot bővíti, sosem hívja `setActiveJourney`-t vagy
  bármilyen újratervezést.
- **Unauthenticated access denied** — ezt a meglévő admin API route-
  minta (`requireVedettRouteAdmin` → 401 bejelentkezés nélkül) már
  korábban lefedte a projekt más admin route-jaihoz hasonlóan; ehhez a
  sprinthez nem készült új, külön teszt, mert a `rest-points` API
  route-ok ugyanazt a `requireVedettRouteAccess()` helpert hívják,
  amit az `access-architecture.test.ts` forráskód-szinten ellenőriz.

## O) VédettSarok pihenőpont integrációs terv (csak dokumentáció, NEM implementálva)

**Cél:** a jövőben a meglévő VédettSarok helyek/szolgáltatók egy
alkérdése ("van itt hely leülni/pihenni?") megjelenhessen a
pihenőpont-térképen — **anélkül, hogy a `rest_points` tábla duplikálná
a `places`/`providers`/`partners`/service-location adatokat.**

Javasolt megközelítés (referencia, NEM másolat):

1. A `rest_points` séma már előkészítve van erre: `source =
   'VEDETT_SAROK'` és az `external_ref_table` / `external_ref_id`
   oszlopok — egy `rest_points` sor ilyenkor NEM tartalmazná a hely
   nevét/koordinátáit közvetlenül másolva, hanem egy KÜLSŐ, meglévő
   `places` (vagy hasonló) rekordra hivatkozna.
2. Egy jövőbeli, KÜLÖN sprintben egy Postgres VIEW vagy egy
   megjelenítési célú lekérdezés kombinálhatná a `places` tábla
   releváns mezőit (név, koordináta) a `rest_points`-ban tárolt
   "capability" metaadatokkal (pl. van-e WC, ülőhely) — anélkül, hogy a
   `places` tábla bármilyen mezőjét a `rest_points`-ba írnánk.
3. **Kritikus feltétel:** egy VédettSarok hely soha nem válik
   automatikusan pihenőponttá — mindig explicit, admin vagy
   moderációs döntés (vagy egy jövőbeli "jelölje meg pihenőpontként"
   admin funkció) hozná létre a referenciát, hasonlóan ahhoz, ahogy a
   USER pihenőpontok is csak explicit felhasználói művelet
   eredményeként jönnek létre.
4. Nem történt és ebben a sprintben nem is terveztünk tömeges
   `INSERT INTO rest_points SELECT ... FROM places` jellegű migrációt
   — ez pontosan az adatduplikáció, amit a spec kizár.

## P) OSM pihenőpont terv (csak dokumentáció, NEM implementálva)

**Cél:** nyilvános OSM POI adatok (pl. nyilvános WC, park, könyvtár,
váróterem) jövőbeli hasznosításának dokumentálása — ebben a sprintben
**nincs tömeges OSM import.**

- A `rest_points.source` CHECK constraint már tartalmazza az `'OSM'`
  értéket a séma szintjén, de a jelenlegi
  `rest_points_user_source_only` constraint (lásd migráció) blokkolja a
  tényleges beszúrást — ez szándékos, amíg nincs kialakítva egy OSM
  adatminőség-ellenőrzési és frissítési folyamat.
- Jövőbeli hasznosítási ötletek: Overpass API lekérdezés
  `amenity=toilets`, `amenity=library`, `leisure=park` tagekre egy adott
  útvonal-korridor mentén; az eredmény `external_ref_table = 'osm'`,
  `external_ref_id = <OSM node/way id>` formában kerülne be, SOSEM
  másolt, hosszú szöveges leírással.
- Fontos kockázat, amit egy jövőbeli sprintnek kezelnie kell: az OSM
  adat minősége/frissessége változó lehet (pl. bezárt létesítmény még
  szerepelhet a térképen) — ezért egy validációs/jelentési mechanizmus
  szükséges, mielőtt bármilyen OSM pont alapértelmezetten látható lenne
  más felhasználóknak.

## Q) Adatvédelem — összefoglaló

- **Folyamatos GPS pozíció:** soha nem kerül Supabase-be, soha nem
  logolva (sem `console.log`, sem a projekt saját `vedettRouteLog`
  mechanizmusa), nincs mozgásprofil vagy helyzet-történet — a pozíció
  kizárólag a böngésző React state-jében él, a jelenlegi session alatt,
  memóriában. Oldal-újratöltéskor elvész.
- **Explicit pihenőpont létrehozás koordinátája:** EZ AZ EGYETLEN
  eset, amikor egy GPS-ből származó (vagy manuálisan megadott)
  koordináta perzisztálódik — **kizárólag azért, mert a felhasználó
  aktívan létrehozott egy pihenőpontot**, és a mentés célja pontosan az,
  hogy a pont később visszakereshető legyen. Ez nem folyamatos
  helyzetkövetés, hanem egyetlen, felhasználó által szándékosan
  megadott adatpont, ugyanúgy, mint egy cím vagy egy jegyzet mentése.
- A `rest_points` tábla `latitude`/`longitude` mezői emiatt NEM sértik a
  "nincs GPS-tárolás" szabályt — a szabály a *folyamatos*, *automatikus*
  pozíciógyűjtésre vonatkozik, nem az explicit, egyszeri felhasználói
  adatmentésre.

## S) Explicit NEM ebben a sprintben (a spec szerint)

A következők SZÁNDÉKOSAN nem kerültek implementálásra ebben a
sprintben, a spec explicit kizárása alapján: "Pihenőre van szükségem"
funkció, felépülési (recovery) rangsorolás, navigáció a pihenőponthoz,
automatikus újratervezés, MÁV/Volán integráció, natív alkalmazás,
háttérben futó GPS, hangalapú navigáció.

## Nyitott pontok a következő lépéshez

1. A felhasználónak PowerShellben le kell futtatnia és visszaigazolnia
   a `npm run build` production build-et (BUILD: PENDING fentebb).
2. A branch (`feature/vedett-route-map-restpoints`) commitja még nem
   történt meg ebben a munkamenetben — lásd a következő commit
   lépést.
3. A VPS-en végzett tényleges realtime bizonyítás
   (`VPS_MOTIS_HANDOFF.md` D) szakasz release gate sablonja) egy külön,
   jövőbeli munkamenet feladata.
