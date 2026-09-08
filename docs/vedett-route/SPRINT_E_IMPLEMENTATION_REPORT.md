# Sprint E — "Pihenőre van szükségem" — Implementációs riport

2026-09-08 · branch: `feature/vedett-route-rest-stop-flow` (a
`feature/vedett-route-map-restpoints`-ből ágaztatva, ami tartalmazza a
lezárt Staging Integration Gate-et, a Preview middleware hardeninget és a
Sprint E Preparation Gate-et)

Ez a dokumentum a Sprint E **teljes implementációját** írja le. A
Preparation Gate (`docs/vedett-route/SPRINT_E_PREPARATION_GATE.md`) hozta
létre az állapotgép, a rangsorolás és a láthatóság alapjait — ez a sprint
azokat **evolválta** (nem duplikálta) és ténylegesen bekötötte a UI-ba, a
route-service-be és 3 új API végpontba.

## 1. Implementált user flow

A meglévő `/admin/vedett-utvonal` admin tesztfelületen (`VEDETT_ROUTE_ACCESS_LEVEL = "admin_only"`,
`VEDETT_ROUTE_ENABLED` marad `false` productionben), az "Aktív útvonal a
térképen" panelben, egy keresés után:

1. **"Pihenőre van szükségem"** gomb jelenik meg, ha az aktív útvonalnak
   van MOTIS által ténylegesen visszaadott célkoordinátája (lásd 6. pont).
2. Megnyomásra: GPS pozíció lekérése (a már meglévő, megosztott
   `useGeolocation()` instance-on keresztül — nincs második GPS-watch).
3. A felhasználó SAJÁT pihenőpontjainak determinisztikus rangsorolása
   (`POST /api/vedett-route/rest-stops/nearby`).
4. Lista megjelenítése (név, távolság, valós attribútumok — pl. "220 m •
   van ülőhely • beltéri"), "Ide megyek" gombbal pontonként.
5. Kiválasztás után "Indulás" — útvonaltervezés a pihenőponthoz
   (`POST /api/vedett-route/rest-stops/route-to-rest-point`, valós
   route-service → MOTIS hívás).
6. Térképes navigáció (a meglévő `VedettUtvonalMap` MapLibre komponens
   újrafelhasználásával, a pihenőponthoz vezető útvonal lábjaival).
7. "Megérkeztem" → pihenő állapot → "Folytatom az utat".
8. Friss GPS pozíció + új útvonaltervezés az EREDETI célig
   (`POST /api/vedett-route/rest-stops/resume` — mindig friss, sosem a
   pihenőpont előtti itinerary újrafelhasználása).
9. Az új Journey átveszi a "aktív útvonal" helyét a térképen
   (`onRouteResumed` → `setActiveJourney`), a panel visszaáll egy friss
   ROUTE_ACTIVE state-re.

Hiba esetén (bármelyik lépésben) a felhasználó egy magyar, nem-technikai
üzenetet lát, és egy "Vissza az aktív útvonalhoz" gombbal térhet vissza —
sosem végtelen retry, sosem nyers exception.

## 2. Architektúra

```
components/vedett-utvonal/VedettUtvonalSearchForm.tsx
  └─ RestStopFlowPanel.tsx (client, "use client")
       ├─ lib/vedett-route/restStopFlow/stateMachine.ts   (pure, evolválva)
       ├─ lib/hooks/useGeolocation.ts                     (megosztott, változatlan)
       └─ fetch(): 3 ÚJ Next.js API route
            ├─ POST /api/vedett-route/rest-stops/nearby
            ├─ POST /api/vedett-route/rest-stops/route-to-rest-point
            └─ POST /api/vedett-route/rest-stops/resume
                 ├─ lib/vedett-route/restStopFlow/rerouteRequest.ts (pure, evolválva)
                 ├─ lib/vedett-route/restStopFlow/pickBestItinerary.ts (ÚJ, pure)
                 ├─ lib/vedett-route/restStopFlow/errorMapping.ts   (ÚJ, pure)
                 ├─ lib/vedett-route/motisClient.ts fetchMotisPlan() (VÁLTOZATLAN)
                 └─ lib/vedett-route/orchestrator.ts mapMotisItineraryToJourney() (VÁLTOZATLAN)
```

A böngésző **soha** nem hívja közvetlenül a MOTIS-t vagy a route
service-t — csak a saját `/api/vedett-route/rest-stops/*` végpontjait
(regressziós teszttel védve, lásd 9. pont). A `ROUTE_SERVICE_AUTH_TOKEN`
kizárólag szerver oldalon (`fetchMotisPlan()` belsejében) kerül
felhasználásra — ez a réteg NEM változott.

## 3. State machine végleges állapota

```
ROUTE_ACTIVE
  --REQUEST_REST--> REST_REQUESTED
  --START_LOADING_REST_POINTS--> REST_POINTS_LOADING
  --REST_POINTS_LOADED--> REST_POINTS_READY
  --SELECT_REST_POINT--> REST_POINT_SELECTED
  --START_ROUTE_TO_REST_POINT--> ROUTING_TO_REST_POINT      [ÚJ, Sprint E]
  --ROUTE_TO_REST_POINT_READY--> NAVIGATING_TO_REST_POINT
  --ARRIVED_AT_REST_POINT--> AT_REST_POINT
  --REQUEST_RESUME--> RESUME_REQUESTED
  --START_REROUTE--> REROUTING_TO_ORIGINAL_DESTINATION
  --REROUTE_SUCCEEDED--> ROUTE_RESUMED (végállapot)

Bármelyik köztes állapotból (REST_REQUESTED .. ROUTING_TO_REST_POINT):
  --CANCEL_REST_STOP--> ROUTE_ACTIVE

Bármelyik hibázható lépésből:
  --*_FAILED (típusos RestStopFlowErrorReason)--> ERROR
ERROR --RESET_TO_ROUTE_ACTIVE--> ROUTE_ACTIVE
```

A `ROUTING_TO_REST_POINT` állapot a Sprint E teljes implementáció során
került be — a Preparation Gate-ben a `REST_POINT_SELECTED` közvetlenül a
`NAVIGATING_TO_REST_POINT`-ra lépett, de a valós route-service hívás alatt
a felhasználó még nem navigál, csak vár — ezért a spec 2. pontja szerinti
`ROUTING_TO_REST_POINT` köztes állapot lett hozzáadva a MEGLÉVŐ
állapotgéphez (nem jött létre párhuzamos második gép).

Az `errorReason` mostantól zárt `RestStopFlowErrorReason` típus (14 kód,
szó szerint a spec 9. pontja szerint), nem szabad szöveg.

## 4. UI flow

Lásd 1. pont. Vizuálisan a meglévő Tailwind osztályokat és komponens-
mintát követi (`btn-primary`/`btn-secondary`, `card`, `sni-text` színek) —
nincs redesign. A pihenőpont forrása (USER/VEDETT_SAROK/OSM) sehol nem
jelenik meg a felhasználó felé.

## 5. Pihenőpont ranking működés

Változatlanul a Preparation Gate `ranking.ts`-e (nem módosult) —
determinisztikus, LLM nélküli, súlyozott pontszám. A `NÉZET` réteg
(`RestStopFlowPanel.tsx` `explainRestPoint()`) a magyarázatot KIZÁRÓLAG a
pihenőpont valós mezőiből építi (`220 m • van ülőhely • beltéri`), soha
nem állít semmit a hiányzó adatokról.

## 6. GPS/privacy audit

- Egyetlen GPS-watch instance van aktív útvonalanként (`activeRouteGeo`,
  a `RestStopFlowPanel` ezt kapja meg propként — nem hoz létre másikat).
- A folyamatos koordináta továbbra sem kerül DB-be, logba vagy analyticsba
  (lásd `lib/hooks/useGeolocation.ts`, VÁLTOZATLAN).
- Az aktuális pozíció a 3 új API híváshoz KERÜL elküldve (ez szükséges a
  route-service híváshoz — ez nem "tárolás/logolás", hanem a kérés
  paramétere, pontosan úgy, mint a fő útvonalkeresésnél).
- Regressziós teszt (`rest-stop-security-regression.test.ts`) statikusan
  ellenőrzi, hogy egyik új API route `vedettRouteLog()` hívása sem
  tartalmaz `lat`/`lon`/`currentPosition` mezőt.
- Explicit "Pihenőpont hozzáadása" (`RestPointQuickAdd`, VÁLTOZATLAN)
  marad az egyetlen hely, ahol koordináta ténylegesen perzisztálódik.

## 7. Auth/security audit

- Mindhárom új API végpont `requireVedettRouteAccess()`-en keresztül fut
  (admin + feature flag, ugyanaz a kapu, mint minden más Védett Útvonal
  funkció) — statikus regressziós teszttel védve.
- A pihenőponthoz vezető útvonal célja (`route-to-rest-point`) KIZÁRÓLAG a
  hívó SAJÁT pihenőpontjai közül választható (`listOwnRestPoints()`,
  RLS-scoped) — más felhasználó pontjára nem tervezhető útvonal.
- Az RLS (`rest_points_own_select/insert/update/delete`) NEM módosult —
  a meglévő, korábban auditált policy-k változatlanul érvényesülnek.
- A `ROUTE_SERVICE_AUTH_TOKEN` és a MOTIS/route-service URL-ek sehol nem
  jelennek meg a kliens komponensben — statikus regressziós teszttel
  védve.

## 8. Route-service integráció

`fetchMotisPlan()` (VÁLTOZATLAN — nem módosult a security architektúra)
mindkét új útvonal-hívásnál (pihenőponthoz, illetve resume) ugyanazt a
fail-closed, egyetlen retry hálózati hibán mintát követi, mint a fő
keresés. Az eredmény itinerary-jét `pickBestItinerary()` (ÚJ, pure)
választja ki determinisztikusan (legrövidebb idő → legkevesebb átszállás →
korábbi indulás), majd `mapMotisItineraryToJourney()` (VÁLTOZATLAN)
alakítja Journey-vé — ugyanaz a típus, ugyanazok a realtime mezők
(`scheduledStartTime`/`realTime`/`cancelled`), mint a fő keresésnél.

## 9. Hibaágak

14 explicit `RestStopFlowErrorReason` kód (szó szerint a spec 9. pontja):
`GPS_PERMISSION_DENIED`, `GPS_UNAVAILABLE`, `GPS_TIMEOUT`,
`NO_REST_POINTS_FOUND`, `REST_POINT_LOAD_FAILED`, `REST_POINT_NO_ROUTE`,
`ROUTE_SERVICE_TIMEOUT`, `ROUTE_SERVICE_UNAVAILABLE`,
`ROUTE_SERVICE_AUTH_FAILURE`, `MALFORMED_ROUTE_RESPONSE`, `NETWORK_LOST`,
`REROUTE_FAILED`, `ORIGINAL_DESTINATION_MISSING`,
`INVALID_STATE_TRANSITION`. Mindegyikhez van magyar, nem-technikai UI
szöveg (`ERROR_COPY` a `RestStopFlowPanel.tsx`-ben). Nincs automatikus
retry-loop — a felhasználónak explicit kell újraindítania a folyamatot.

## 10. Tesztek

Új/bővített fájlok:
- `rest-stop-flow-state-machine.test.ts` — evolválva (ROUTING_TO_REST_POINT,
  típusos hibakódok), 18 teszt.
- `rest-stop-ranking.test.ts` — VÁLTOZATLAN (14 teszt, már fedte a
  tie-breaket és a hiányzó adat kezelését).
- `rest-stop-visibility.test.ts` — VÁLTOZATLAN (5 teszt).
- `rest-stop-reroute-request.test.ts` — bővítve `buildRouteToRestPointRequest`
  tesztekkel, 9 teszt.
- `rest-stop-error-mapping.test.ts` — ÚJ, 6 teszt (timeout/unavailable/
  auth failure/malformed leképezés).
- `rest-stop-pick-best-itinerary.test.ts` — ÚJ, 6 teszt (determinisztikus
  választás, tie-break, üres lista).
- `rest-stop-security-regression.test.ts` — ÚJ, 6 teszt (GPS nem kerül
  logba, auth token nem kerül kliensbe, csak saját API hívás, auth check
  minden route-on, /resume mindig friss hívás).

## 11. tsc eredmény

`npx tsc --noEmit`: **tiszta**, hibaüzenet nélkül.

## 12. Build eredmény

A sandbox környezetben az `npm run build` a korábbi sprintekhez hasonlóan
nem fut le a device_bash időkorláton belül (ismert, dokumentált
korlátozás) — a felhasználó saját PowerShell-jében kell megerősítenie.

## 13. Ismert korlátok

- A pihenőpont-forrás gyakorlatilag csak `USER`/`PRIVATE` (a
  `VEDETT_SAROK`/`OSM` séma-szinten előkészített, de nincs éles adatuk —
  változatlan a Preparation Gate óta).
- `openingHours` faktor mindig `unavailable` (nincs ilyen mező a sémában).
- A `/nearby` végpont jelenleg a felhasználó ÖSSZES saját pontját lekéri,
  majd rangsorolja (nincs földrajzi bounding-box szűrés az adatbázis
  szinten) — kis pontszámmal ez nem probléma, nagy pontszám esetén jövőbeli
  optimalizálási lehetőség.
- Nincs push/hangjelzés a "megérkeztél" detektáláshoz — a "Megérkeztem"
  gomb explicit felhasználói megerősítés (V1 foreground-only GPS, a spec
  6/7. pontjának megfelelően).
- A UI komponens (`RestStopFlowPanel.tsx`) maga nincs unit-tesztelve —
  ugyanaz a korlát, mint a projekt összes többi React komponensénél
  (`VedettUtvonalMap`, `RestPointQuickAdd`, `VedettUtvonalSearchForm`)
  — nincs jsdom/React Testing Library a projektben, a tesztelési
  konvenció a pure logika rétegre koncentrál.

## 14. Staging kézi teszt-checklist

- [ ] `/admin/vedett-utvonal`, valós keresés (pl. Deák Ferenc tér → Blaha
      Lujza tér), "Térkép megnyitása".
- [ ] Legalább 1 saját pihenőpont mentve (`RestPointQuickAdd`).
- [ ] "Pihenőre van szükségem" → GPS engedély → pihenőpont-lista.
- [ ] "Ide megyek" → "Indulás" → route-service hívás → térképes navigáció.
- [ ] "Megérkeztem" → "Folytatom az utat" → friss GPS → új útvonal az
      eredeti célig.
- [ ] Hálózat/route-service kikapcsolása közben tesztelt hibaágak (timeout,
      unavailable) → felhasználóbarát üzenet, nincs crash.
- [ ] Production `VEDETT_ROUTE_ENABLED=false` mellett a teljes admin oldal
      (beleértve ezt a panelt) `disabled` állapotban jelenik meg.

## 15. Mit NEM implementáltam

- Nem publikus (nem admin-only) hozzáférés — `VEDETT_ROUTE_ACCESS_LEVEL`
  változatlanul `admin_only`.
- Push/hangalapú "megérkeztél" detektálás.
- Háttérben futó / lezárt képernyős navigáció.
- MÁV/Volán provider bekötés.
- VédettSarok/OSM pihenőpont-források éles adatimportja.
- Semmilyen VPS/Caddy/route-service auth architektúra módosítás.

---

**SPRINT E IMPLEMENTATION COMPLETE: YES**
**READY FOR SPRINT E STAGING TEST: YES** (a build-megerősítés a
felhasználó saját PowerShell-jétől függ)
