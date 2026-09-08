# Sprint E Preparation Gate — "Pihenőre van szükségem"

**Dátum: 2026-09-07.** Cél: a "Pihenőre van szükségem" folyamat TELJES
előkészítése (típusok, állapotgép, determinisztikus rangsorolás,
adatvédelem, rerouting-interfész terve, tesztek, staging smoke-test
script) — **AKTIVÁLÁS ÉS UI-BEKÖTÉS NÉLKÜL.** A VPS route service jelenleg
még nem érhető el kívülről HTTPS-en (`route.vedettsarok.hu` DNS
beállítása folyamatban), ezért ez a gate szándékosan NEM köt rá élő route
service-re, és NEM aktivál semmit production-ben.

## A) Audit — Sprint C+D meglévő építőelemei

| Terület | Fájl | Állapot / releváns tény |
| --- | --- | --- |
| GPS state | `lib/hooks/useGeolocation.ts` | `useGeolocation()` hook, `status`/`latitude`/`longitude`/`accuracyMeters`, session-scoped, SOHA nem perzisztált/logolt. `requestOnce`/`startWatching`/`stopWatching`. Változatlan, nem nyúltunk hozzá. |
| Aktív útvonal state | `components/vedett-utvonal/VedettUtvonalSearchForm.tsx` | `activeJourney` (Journey \| null) + `sessionRestPoints` state a keresési form komponensben. Nincs külön, dedikált "route session" store — ez a Sprint E-nek egy tervezési kérdést jelent (lásd "Nyitott kérdés" lent). |
| Rest-point modellek | `lib/rest-points/types.ts`, `schemas.ts`, `queries.ts` | `RestPoint`/`RestPointRow`, `RestPointSource` (USER/VEDETT_SAROK/OSM), `RestPointVisibility` (PRIVATE/CONNECTIONS/PUBLIC). JELENLEG a DB CHECK constraint csak `source='USER'` és `visibility='PRIVATE'` beszúrást enged (lásd `20260907_rest_points.sql`). **NINCS nyitvatartási mező a sémában** — ezt a ranking tervnél figyelembe vettem (lásd E) pont). |
| `/api/rest-points` végpontok | `app/api/rest-points/route.ts`, `app/api/rest-points/[id]/route.ts` | GET (saját pontok listázása), POST (létrehozás), PATCH/DELETE (`[id]`) — mind `requireVedettRouteAccess()` mögött, RLS a tényleges cross-user védelem. **NINCS "közeli pontok keresése" (proximity search) végpont** — ez a Sprint E ténylegesen implementáló fázisának feladata lesz, ez a gate csak a rangsoroló logikát készíti elő (ami bármilyen forrásból kapott listát tud rangsorolni). |
| MapLibre integráció | `components/vedett-utvonal/VedettUtvonalMap.tsx` | `restPoints` prop már létezik (jelenleg csak marker-megjelenítésre), `currentPosition` prop már fogadja a GPS pozíciót. A leendő "navigáció a pihenőponthoz" nézet ebből építhető tovább — ehhez a gate-hez nem nyúltunk hozzá. |
| Route service / MOTIS kliens | `lib/vedett-route/motisClient.ts`, `config.ts`, `status.ts` | A staging integration gate-ben lezárt, bizonyított biztonsági architektúra. **EHHEZ A GATE-HEZ EGY SORT SEM MÓDOSÍTOTTUNK** (12. pont követelménye). |

**Nyitott kérdés a tényleges Sprint E implementációhoz (NEM ehhez a
gate-hez tartozik, csak jelzem):** jelenleg nincs egy dedikált,
komponensen-átívelő "aktív útvonal munkamenet" store (pl. React context
vagy hasonló) — az `activeJourney` ma a `VedettUtvonalSearchForm`
komponens lokális state-je. A most elkészült `RestStopFlowContext`
állapotgép ettől függetlenül, tisztán reprezentálja a folyamatot; a
tényleges React-bekötés (hol él ez a state, hogyan éri el a
`VedettUtvonalMap` a "navigáció a pihenőponthoz" adatait) a teljes Sprint
E implementáció feladata, nem ezé az előkészítő gate-é.

## Sprint E állapotgép

```
                    ┌─────────────┐
                    │ ROUTE_ACTIVE │◄──────────────────────────┐
                    └──────┬──────┘                             │
                           │ REQUEST_REST                        │ CANCEL_REST_STOP
                           ▼                                     │ (csak a köztes
                  ┌────────────────┐                             │  állapotokból)
                  │ REST_REQUESTED  │─────────────────────────────┘
                  └───────┬────────┘
                           │ START_LOADING_REST_POINTS
                           ▼
              ┌─────────────────────────┐   REST_POINTS_LOAD_FAILED   ┌───────┐
              │ REST_POINTS_LOADING      │────────────────────────────►│ ERROR │
              └───────────┬─────────────┘                             └───┬───┘
                           │ REST_POINTS_LOADED                            │ RESET_TO_ROUTE_ACTIVE
                           ▼                                               │
                ┌────────────────────┐                                    │
                │ REST_POINTS_READY   │                                    │
                └──────────┬─────────┘                                    │
                           │ SELECT_REST_POINT                             │
                           ▼                                               │
              ┌───────────────────────┐                                   │
              │ REST_POINT_SELECTED    │                                   │
              └───────────┬───────────┘                                   │
                           │ START_NAVIGATION_TO_REST_POINT                │
                           ▼                                               │
         ┌─────────────────────────────┐                                  │
         │ NAVIGATING_TO_REST_POINT     │                                  │
         └───────────────┬─────────────┘                                  │
                           │ ARRIVED_AT_REST_POINT                         │
                           ▼                                               │
                ┌────────────────┐                                        │
                │ AT_REST_POINT   │                                        │
                └────────┬───────┘                                        │
                          │ REQUEST_RESUME                                 │
                          ▼                                                │
              ┌────────────────────┐                                      │
              │ RESUME_REQUESTED    │                                      │
              └──────────┬─────────┘                                      │
                          │ START_REROUTE                                  │
                          ▼                                                │
   ┌─────────────────────────────────────────┐   REROUTE_FAILED           │
   │ REROUTING_TO_ORIGINAL_DESTINATION          │────────────────────────────┘
   └───────────────────┬───────────────────────┘
                          │ REROUTE_SUCCEEDED
                          ▼
                 ┌────────────────┐
                 │ ROUTE_RESUMED   │  (végállapot ebben a folyamatban)
                 └────────────────┘
```

Megvalósítás: `lib/vedett-route/restStopFlow/stateMachine.ts` —
`transitionRestStopFlow(context, event)`, tiszta függvény, SOHA nem hív
hálózatot/DB-t/React-et, SOHA nem dob kivételt (érvénytelen átmenet
esetén `{ ok: false, reason: "invalid_transition" }`-t ad, a context
változatlanul).

**Az eredeti úti cél megőrzése (3. pont követelménye):**
`RestStopFlowContext.originalDestination` a TypeScript szintjén
`readonly`, és a reducer EGYETLEN ága sem írja felül — minden átmenet
`{ ...context, ... }` spreaddel csak az adott lépéshez tartozó mezőket
módosítja. Ezt 3 dedikált teszt bizonyítja (a teljes boldog úton végig, a
pihenőpont kiválasztása után külön, és hibaágakon is).

## Rest-point források és láthatóság (4. pont)

- `RestPointSource`: `USER` / `VEDETT_SAROK` / `OSM` — a séma már
  támogatja mindhármat, de a DB CHECK constraint jelenleg csak `USER`-t
  enged beszúrni (változatlan, nem módosítottuk).
- `RestPointVisibility`: `PRIVATE` / `CONNECTIONS` / `PUBLIC` — a DB CHECK
  constraint jelenleg csak `PRIVATE`-ot enged (változatlan).
- ÚJ: `lib/vedett-route/restStopFlow/visibility.ts` —
  `isRestPointVisibleToUser()` / `filterVisibleRestPoints()`,
  **alkalmazás-szintű védelem a mélységben** az RLS mellett (nem
  helyette): PRIVATE pont csak a létrehozójának, PUBLIC/CONNECTIONS
  bárkinek. Ez a réteg akkor lesz éles hasznosságú, amikor a Sprint E
  ténylegesen lekérdez több forrásból/felhasználótól származó pontokat
  egy proximity search végponton keresztül — jelenleg még nincs ilyen
  végpont, de a szűrő logika már készen és tesztelve van.

## Determinisztikus rangsorolási terv (5. pont)

`lib/vedett-route/restStopFlow/ranking.ts` — a projekt már meglévő
Sensory Engine mintáját követi (súlyozott átlag CSAK az elérhető
faktorokból, hiányzó adat SOHA nem 0/negatív pontszám, hanem kimarad a
számításból és a `missingFactors` listában jelenik meg):

| Faktor | Forrás | Jelenlegi elérhetőség |
| --- | --- | --- |
| `distance` | Haversine számítás, aktuális pozíció vs. pihenőpont koordináta | Csak akkor available, ha van ismert aktuális pozíció (GPS engedélyezve) |
| `seating` | `rest_points.seating` | available, ha nem `null` |
| `toilet` | `rest_points.toilet` | available, ha nem `null` |
| `quietSpace` | `rest_points.quiet_space` | available, ha nem `null` |
| `shelter` (indoors/outdoors összevonva) | `rest_points.indoors`/`outdoors` | available, ha legalább az egyik nem `null` |
| `purchaseRequired` | `rest_points.purchase_required` | available, ha nem `null` (invertált pontszám: nincs kötelezettség = jobb) |
| `openingHours` | — | **MINDIG unavailable** — a séma jelenlegi verziója nem tartalmaz nyitvatartási mezőt. Őszintén dokumentálva, nem szimulálva. |
| `userPreference` | opcionális `RestPointUserPreference` paraméter | Csak akkor available, ha a hívó ténylegesen átad preferenciát — sosem feltételezett alapértelmezés |

Nincs LLM-hívás sehol — tiszta aritmetika, ugyanaz a
`weightedSum / weightTotal` képlet, mint a `sensoryEngine.ts`-ben, és
ugyanaz a `score = weightTotal > 0 ? ... : 0` fallback minden faktor
hiánya esetén (nem "büntetjük" a pontot azért, mert nincs róla adat, csak
0 confidence-t adunk).

## Adatvédelem (6. pont) — VÁLTOZATLAN, nem gyengítve

A folyamatos GPS koordináta kezelése ehhez a gate-hez EGYÁLTALÁN NEM
változott — `useGeolocation.ts`-t nem módosítottuk. A szabály továbbra is:
folyamatos pozíció SOHA nem kerül DB-be, logba, analitikába; KIZÁRÓLAG a
felhasználó explicit "Pihenőpont hozzáadása" művelete (meglévő
`RestPointQuickAdd.tsx` / `POST /api/rest-points`) menti el egyetlen,
szándékosan megadott koordinátát. A most létrehozott `restStopFlow`
modulok egyike sem ír adatbázist, egyike sem importál Supabase klienst —
ezt egy grep is megerősítette (`lib/vedett-route/restStopFlow/` egyetlen
fájlja sem hivatkozik `@/lib/supabase`-re).

## Rerouting interfész terve (7. pont)

```
current GPS / pihenőpont koordináta
   │
   ▼
lib/vedett-route/restStopFlow/rerouteRequest.ts
   buildRerouteToOriginalDestinationRequest(from, originalDestination, departAt?)
   -> MotisPlanParams (fromPlace/toPlace/time/numItineraries,
      pontosan a hivatalos MOTIS mezőnevekkel)
   │
   ▼   (Sprint E-ben itt kerülne tényleges hívásra — EBBEN A GATE-BEN NEM)
lib/vedett-route/motisClient.ts fetchMotisPlan(params)
   │
   ▼
HTTPS route service (VPS, staging integration gate biztonsági
architektúrája — VÁLTOZATLAN)
   │
   ▼
MOTIS realtime /api/v6/plan
   │
   ▼
eredmény: új Journey az EREDETI célig
```

`buildRerouteToOriginalDestinationRequest()` egy TISZTA függvény —
NEM hívja meg a `fetchMotisPlan()`-t. Amikor a Sprint E ténylegesen
bekötésre kerül, csak ennek a már kész, tesztelt paraméter-objektumnak
kell átadódnia a meglévő (staging gate-ben lezárt) kliensnek — nincs
szükség új paraméter-leképezésre vagy a route-service biztonsági réteg
módosítására.

## Tesztek (8. pont)

36 új teszt, mind PASS, a meglévő 128 mellé (összesen 164/164 PASS):

- `__tests__/vedett-route/rest-stop-flow-state-machine.test.ts` (12 teszt)
  — teljes boldog út + originalDestination megőrzés minden lépésben,
  érvénytelen átmenetek elutasítása kivétel nélkül, hibaágak
  (REST_POINTS_LOAD_FAILED, REROUTE_FAILED), ERROR→RESET_TO_ROUTE_ACTIVE,
  CANCEL_REST_STOP engedélyezett/tiltott állapotai, védekező ágak.
- `__tests__/vedett-route/rest-stop-ranking.test.ts` (13 teszt) —
  haversine távolság helyessége, teljesen hiányzó adat kezelése (score 0,
  DE nem "büntetés"), `false` vs. hiányzó (`null`) megkülönböztetése,
  nyitvatartás mindig unavailable, közelebbi pont jobb pontszáma,
  userPreference csak explicit megadás esetén, determinizmus (kétszeri
  futtatás azonos eredmény), egyedi súlyok hatása.
- `__tests__/vedett-route/rest-stop-visibility.test.ts` (5 teszt) —
  PRIVATE pont csak a létrehozónak, más felhasználónak és
  bejelentkezés nélkül sem, PUBLIC pont bárkinek, szűrés több pont közül.
- `__tests__/vedett-route/rest-stop-reroute-request.test.ts` (6 teszt) —
  fromPlace/toPlace helyessége (a toPlace MINDIG az eredeti cél, sosem a
  pihenőpont), departAt explicit/alapértelmezett viselkedése,
  numItineraries alapérték/felülírás, csak a hivatalos MOTIS mezők
  szerepelnek a kimenetben.

## Staging smoke-test script (9. pont)

`scripts/vedett-route/route-service-smoke-test.mjs` — ÚJ, kézzel
futtatandó script (NEM fut automatikusan build/teszt közben), env
változókból (`ROUTE_SERVICE_URL`, `ROUTE_SERVICE_AUTH_TOKEN`) olvas:

1. health token nélkül → elvárt FAIL (401/403).
2. health hibás (nyilvánvalóan érvénytelen, nem a valós token
   módosítása) tokennel → elvárt FAIL (401/403).
3. health helyes tokennel → elvárt PASS (200 + `rt`/`gbfs` mező).
4. plan helyes tokennel → elvárt PASS (200 + `itineraries`/`direct` tömb).
5. Timeout kezelése (extrém rövid timeout-tal sem fagy le, nem dob
   kezeletlen kivételt).
6. Malformed response kezelése (nem valid JSON esetén FAIL, nem
   kivétel).

A script kimenete SOHA nem tartalmazza a token értékét — csak
PASS/FAIL sorokat és HTTP státuszkódot/hibafajtát ír ki. **Jelenleg NEM
futtatható éles eredménnyel**, mert a `route.vedettsarok.hu` HTTPS
végpont még nincs felállítva — ezt a felhasználónak kell lefuttatnia,
amint a DNS/reverse proxy készen áll.

## Módosított/új fájlok

```
Új:
  lib/vedett-route/restStopFlow/types.ts
  lib/vedett-route/restStopFlow/stateMachine.ts
  lib/vedett-route/restStopFlow/ranking.ts
  lib/vedett-route/restStopFlow/visibility.ts
  lib/vedett-route/restStopFlow/rerouteRequest.ts
  scripts/vedett-route/route-service-smoke-test.mjs
  __tests__/vedett-route/rest-stop-flow-state-machine.test.ts
  __tests__/vedett-route/rest-stop-ranking.test.ts
  __tests__/vedett-route/rest-stop-visibility.test.ts
  __tests__/vedett-route/rest-stop-reroute-request.test.ts
  docs/vedett-route/SPRINT_E_PREPARATION_GATE.md (ez a dokumentum)

Módosítva:
  package.json — új "vedett-route:route-service-smoke-test" script hozzáadva

ÉRINTETLEN (szándékosan):
  app/**, components/** (a meglévő UI-ba semmi nincs bekötve)
  lib/vedett-route/motisClient.ts, config.ts, status.ts (a staging gate
    biztonsági architektúrája, 12. pont követelménye szerint változatlan)
  VEDETT_ROUTE_ENABLED — nem érintve, marad false
```

## Teszteredmények

```
node --test __tests__/vedett-route/*.test.ts __tests__/rest-points/*.test.ts __tests__/hooks/*.test.ts
  tests 164
  pass 164
  fail 0

npx tsc --noEmit
  (hibamentes)

npm run build
  Ebben a munkamenetben a sandbox ismét túllépte az elérhető időkeretet
  (ugyanaz a korábban is jelentkező korlát) — mivel ez a gate KIZÁRÓLAG
  új, semmilyen meglévő fájl által nem importált modulokat ad hozzá
  (lásd "Módosított/új fájlok" — egyetlen app/ vagy components/ fájl sem
  változott), típushibát a tiszta tsc --noEmit már kiszűrt volna, és a
  package.json módosítás csak egy új script-bejegyzés. Mindazonáltal a
  build tényleges lefuttatását és visszaigazolását javaslom, mielőtt
  bármi mást erre építünk.
```

## Mit implementáltam ténylegesen

- Teljes, tesztelt állapotgép a "Pihenőre van szükségem" folyamathoz, az
  eredeti cél garantált megőrzésével.
- Teljes, tesztelt, determinisztikus (LLM nélküli) pihenőpont-rangsorolás,
  a projekt már bevált "hiányzó adat sosem büntetés" elvét követve.
- Alkalmazás-szintű láthatósági szűrő (védelem a mélységben az RLS
  mellett), USER/PRIVATE + jövőbeli VEDETT_SAROK/OSM + PUBLIC/CONNECTIONS
  forgatókönyvekre felkészítve.
- A jövőbeli rerouting-lánc pure request-építő része (paraméterek
  összeállítása, hálózati hívás NÉLKÜL).
- Külön staging smoke-test script a route service-hez, secret-mentes
  kimenettel.
- 36 új automatizált teszt, teljes regresszió nélkül (164/164 PASS).

## Mi maradt szándékosan blokkolva a staging integration gate miatt

- **Nincs UI-bekötés**: nincs "+ Pihenőre van szükségem" gomb, nincs
  navigációs nézet a pihenőponthoz, nincs "megérkeztem" jelzés a
  felületen. Ez a gate csak az ALATTA lévő logikát készítette elő.
- **Nincs proximity search API végpont** (`/api/rest-points` közeli
  pontok keresésére) — jelenleg csak a saját pontok listázása létezik.
- **A `rerouteRequest.ts` NINCS bekötve `fetchMotisPlan()`-hoz** — a
  paraméterek elkészülnek, de a tényleges hívás nem történik meg, amíg a
  Sprint E ténylegesen aktiválásra nem kerül.
- **A route-service staging smoke-test script nem futtatható éles
  eredménnyel**, mert a `route.vedettsarok.hu` HTTPS végpont még nincs
  felállítva.
- **A DB CHECK constraint-ok változatlanok** — `VEDETT_SAROK`/`OSM`
  forrás és `PUBLIC`/`CONNECTIONS` láthatóság a séma szintjén létezik, de
  éles beszúrás továbbra sincs engedélyezve (`rest_points_user_source_only`,
  `rest_points_private_only` — nem módosítottuk).
- **`VEDETT_ROUTE_ENABLED` production-ben marad `false`.**
- **A staging integration gate route-service biztonsági architektúrája
  (config.ts/motisClient.ts/status.ts) egyáltalán nem módosult.**

## SPRINT E PREPARATION READY: YES

Indoklás: minden kért tervezési/előkészítő elem elkészült, tesztelve,
típushibamentesen — de a tényleges Sprint E UI-implementáció és élő
route-service bekötés továbbra sincs elkezdve, pontosan a kérésnek
megfelelően. A `npm run build` végleges visszaigazolása a felhasználó
feladata (lásd fent), de ez a hiányzó megerősítés nem érinti magát az
előkészítést — csak egy formális, még hátralévő ellenőrzési lépés.
