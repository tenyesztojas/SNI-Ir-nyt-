# Védett Útvonal — tesztek

Futtatás (nem igényel új dependency-t, Node beépített test runnerét
használja):

```bash
npm run test:vedett-route
```

## Amit ezek a tesztek automatikusan lefednek

- **Feature flag** (`config.test.ts`): `VEDETT_ROUTE_ENABLED=true/false`,
  hibás érték kezelése, hozzáférési szint mindig `admin_only` Fázis 1-ben.
- **API key** (`config.test.ts`, `bkk-provider.test.ts`): hiányzó/üres
  `BKK_API_KEY` felismerése, és hogy a kulcs értéke SOHA nem jelenik meg a
  `checkConnection()` visszatérési objektumában (JSON-szerializálva
  ellenőrizve).
- **Routing — bemenet validáció** (`search-validation.test.ts`): érvényes
  A→B kérés, hiányzó/üres mezők, érvénytelen dátumformátum, teljesen
  hiányzó body.
- **Routing — routing engine hiánya** (`motisClient.test.ts`): `MOTIS_BASE_URL`
  nélkül mindig kezelt `routing_engine_unavailable` választ ad, sosem dob
  kivételt, sosem ad vissza kitalált útvonalat.
- **GTFS feltöltés validáció — MÁV/Volán** (`gtfs-upload-validation.test.ts`):
  teljes struktúra elfogadása, hiányzó kötelező fájl elutasítása,
  nem-GTFS/nem-zip bemenet kezelése, `feed_info.txt` metaadat kiolvasása.
  Szintetikus fixture-ökkel dolgozik (nem valós forgalmi adat).
- **StaticOnlyGtfsProvider — MÁV/Volán** (`static-only-provider.test.ts`):
  feltöltés hiányában őszinte "nincs konfigurálva" válasz, realtime
  metódusok mindig üres tömböt adnak (sosem kitalált adatot),
  `refreshStaticData()` explicit hibát dob (nincs automatikus letöltés).

## Amit ezek a tesztek szándékosan NEM fednek le, és miért

A 31. pont teljes listája (Authorization, BKK API élő hívások, Routing
teljes A→B) olyan eseteket is felsorol, amik valós Supabase admin/normál
felhasználót, bejelentkezett sessiont, és/vagy élő BKK hálózati elérést
igényelnek:

- **Authorization** (admin eléri / normál user nem éri el / kijelentkezett
  user nem éri el): ez a projekt meglévő mintáját követi
  (`lib/vedett-route/access.ts` ugyanazt csinálja, mint
  `app/api/admin/pwa-stats/route.ts`), de valódi végponthoz-végpontig teszt
  futó dev szervert és két valódi teszt-felhasználót (egy admin, egy
  normál) igényelne a Supabase projektben. Ezt automatikusan, hitelesítő
  adatok nélkül nem lehet biztonságosan előállítani ebből a munkamenetből.
  **Manuális ellenőrzés** (2 perc): jelentkezz be nem-admin userrel, nyisd
  meg `/admin/vedett-utvonal`-t → redirect `/`-re; jelentkezz ki teljesen,
  ugyanaz; próbáld meg `curl -X POST /api/admin/vedett-utvonal/search`
  bejelentkezés nélkül → `401`.
- **BKK API élő hívás** (sikeres válasz, timeout, invalid response,
  authorization error): a munkamenet hálózati allowlistje nem engedi át a
  `go.bkk.hu`-t (lásd docs/vedett-route.md), ezért ezt élesben nem lehetett
  lefuttatni. **Manuális ellenőrzés**: `npm run dev` után nyisd meg
  `/admin/vedett-utvonal`-t, nézd meg a "BKK API" / "BKK Realtime" sort.
- **Routing — teljes A→B eredménnyel**: ehhez működő MOTIS instance
  szükséges, ami Fázis 1-ben szándékosan nincs beüzemelve (lásd
  docs/vedett-route.md "MOTIS setup"). Amint fut egy MOTIS instance, ez a
  teszt-suite bővíthető egy valódi útvonal-eredményt ellenőrző esettel.


## Sprint 2 kiegészítések (Védett Route Orchestrator, Sensory Engine V1)

- **Fingerprinting/dedup** (`fingerprint.test.ts`): azonos tartalmú itinerary-k
  (más objektum) ugyanazt a fingerprintet kapják, eltérő vonal eltérő
  fingerprintet, `deduplicateJourneys` csak az elsőt tartja meg.
- **Sensory Engine V1** (`sensoryEngine.test.ts`): a `crowding` és
  `vehicleAccessibility` tényező MINDIG `missingFactors`-ban van és sosem
  kap hallgatólagos 0 értéket; a confidence sosem 1.0; monotonitás
  (több átszállás -> magasabb score); minden súly 0 -> score 0, de a
  confidence attól függetlenül számít; földalatti szakasz méréstani teszt.
- **Rangsorolás** (`ranking.test.ts`): FASTEST/FEWEST_TRANSFERS/CALMEST
  helyes odaítélése, minden itineraryhez van magyarázat, determinizmus
  (ugyanaz a bemenet mindig ugyanazt a kimenetet adja — nincs LLM-hívás).
- **Személyre szabás** (`personalization.test.ts`): default súlyok,
  0-2 tartományra szorítás, részleges bemenet kezelése, NaN védelem.
- **Orchestrator** (`orchestrator.test.ts`): valós MOTIS válasz-alakú
  fixture helyes Journey-vé alakítása, WALK/TRANSIT mód-leképezés,
  MOTIS_BASE_URL hiánya esetén kezelt hiba, két stratégia (alap +
  metrómentes) találatainak összefésülése/dedup/rangsorolása mock fetch-csel.
- **MOTIS kliens bővítés** (`motisClient.test.ts`): a hivatalos `/api/v6/plan`
  végpont és kizárólag dokumentált query paraméterek kerülnek a kérésbe
  (URL-szintű ellenőrzés).

Amit ez a kiegészítés SZÁNDÉKOSAN nem fed le: élő, hálózaton keresztüli MOTIS
hívás (ehhez lásd `scripts/vedett-route/motis-smoke-test.mjs` és
`motis-benchmark.mjs` — ezeket a fejlesztői gépen, futó MOTIS ellen kell
kézzel futtatni, eredményük `docs/vedett-route/MOTIS_GO_LIVE_REPORT.md`-ben
van dokumentálva).
