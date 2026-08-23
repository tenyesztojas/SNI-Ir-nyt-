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
