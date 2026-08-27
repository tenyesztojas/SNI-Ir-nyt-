# Védett Útvonal — fejlesztési dokumentáció (Fázis 1)

> Admin-only, fejlesztés alatt álló modul. Nem publikus. Lásd "Élesítési kapu"
> lent a publikálás feltételeiről.

## Architecture

```text
VédettSarok
     │
     ▼
Védett Útvonal UI            app/admin/vedett-utvonal/page.tsx
     │
     ▼
Védett Route Backend         app/api/admin/vedett-utvonal/*
     │
     ├── Transit Provider Interface     lib/vedett-route/types.ts (TransitProvider)
     │        │
     │        ├── BKK Provider          lib/vedett-route/providers/bkk.ts
     │        │
     │        ├── MÁV Provider          [Fázis 2 — nincs implementálva]
     │        │
     │        └── MÁV/Volán Provider    [Fázis 2 — nincs implementálva]
     │
     ▼
Routing Engine (MOTIS)        lib/vedett-route/motisClient.ts [Fázis 1: nincs beüzemelve]
     │
     ▼
Route Normalizer              lib/vedett-route/types.ts (Journey, JourneyLeg)
     │
     ▼
Sensory Engine                [Fázis 3 — nincs implementálva]
```

A meglévő VédettSarok architektúra változatlan: Next.js 14 App Router,
Supabase (auth + Postgres, RLS), a meglévő `profiles.role === "admin"` alapú
admin-jogosultság-kezelés újrafelhasználva. Nem vezettünk be új
frameworköt, adatbázist vagy auth rendszert.

## BKK integration

Hivatalos, dokumentált BKK OpenData végpontok (forrás:
[opendata.bkk.hu](https://opendata.bkk.hu/data-sources), URL-ek megerősítve a
[Transitland Atlas BKK feed leírásából](https://github.com/transitland/transitland-atlas/blob/main/feeds/bkk.hu.dmfr.json)):

| Adat | URL |
| --- | --- |
| Statikus GTFS | `https://go.bkk.hu/api/static/v1/public-gtfs/budapest_gtfs.zip` |
| TripUpdates (GTFS-RT) | `https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/TripUpdates.pb` |
| VehiclePositions (GTFS-RT) | `https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/VehiclePositions.pb` |
| Service Alerts (GTFS-RT) | `https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/Alerts.pb` |

Az authentikáció `key` query paraméterrel történik (`?key=<BKK_API_KEY>`). A
GTFS-RT feedeket a hivatalos `gtfs-realtime-bindings` (Google/MobilityData)
csomaggal dekódoljuk protobuf formátumból — nincs scraping, nincs
BudapestGO-integráció.

Implementáció: `lib/vedett-route/providers/bkk.ts`.

**Fontos korlát ebben a fejlesztési körben:** a Claude sandbox és az ehhez a
munkamenethez kötött géped egyaránt egy szűk hálózati allowlist mögött
fut, amely nem engedi át a `go.bkk.hu`-hoz intézett kéréseket — emiatt a
kapcsolat-tesztet ebből a munkamenetből NEM tudtam élesben lefuttatni és
igazolni. A kód a dokumentált API alapján készült és típusellenőrzésen
átment (`npx tsc --noEmit` hibamentes), de az első éles teszt a
`npm run dev` elindítása után, az admin felületen (`/admin/vedett-utvonal`,
"BKK API" sor) vagy a `GET /api/admin/vedett-utvonal/status` végponton
keresztül történjen — ott a Node szerver folyamat már nem ezen a
sandboxon keresztül ér ki az internetre.

## Environment variables

| Változó | Hely | Leírás |
| --- | --- | --- |
| `BKK_API_KEY` | `.env.local` (szerver-only) | BKK OpenData API kulcs. Soha nem kap `NEXT_PUBLIC_` prefixet. |
| `VEDETT_ROUTE_ENABLED` | `.env.local` | Feature flag — `true`/`false`. |
| `MOTIS_BASE_URL` | `.env.local` | A MOTIS routing engine szolgáltatás elérési címe. Üresen hagyva = routing engine nincs beüzemelve. |
| `VEDETT_GTFS_STATIC_MAX_AGE_SECONDS` | opcionális | Statikus GTFS cache max életkora (alap: 86400). |
| `VEDETT_GTFS_REALTIME_MAX_AGE_SECONDS` | opcionális | Realtime cache max életkora (alap: 20). |

A `.env.local.example` csak a változóneveket tartalmazza, valódi érték nélkül.

## Local development

```bash
npm install
npm run dev
```

Admin felhasználóként jelentkezz be, majd nyisd meg: `/admin/vedett-utvonal`.

## Feature flags

`VEDETT_ROUTE_ENABLED=true|false` (lib/vedett-route/config.ts). A funkció
csak akkor működik, ha ez `true` ÉS a bejelentkezett felhasználó
`profiles.role === "admin"`. Az admin diagnosztikai státusz végpont
(`/api/admin/vedett-utvonal/status`) admin-only, de a flagtől függetlenül
elérhető — hogy admin akkor is lássa a konfigurációt, ha a flag ki van
kapcsolva. A funkcionális végpontok (keresés, GTFS frissítés) admin ÉS
flag-védettek egyszerre (`requireVedettRouteAccess`).

A hozzáférési szint (`VEDETT_ROUTE_ACCESS_LEVEL`) előkészítve a későbbi
`admin_only` → `beta_testers` → `public` bővítésre
(`lib/vedett-route/config.ts`), Fázis 1-ben kódból lezárva `admin_only`-ra.

## Admin access

Ugyanaz a mechanizmus védi, mint a projekt többi admin oldalát:

- **Oldal** (`/admin/vedett-utvonal`): az `app/admin/layout.tsx` már minden
  `/admin/*` oldalt admin-only-ra zár (nem-admin → redirect `/`-re).
- **API végpontok** (`/api/admin/vedett-utvonal/*`): saját maguk is
  ellenőrzik a `supabase.auth.getUser()` + `profiles.role === "admin"`
  párost (`lib/vedett-route/access.ts`), pontosan úgy, ahogy a meglévő
  `app/api/admin/pwa-stats/route.ts` és `app/api/admin/programok/[id]/route.ts`
  teszi — mert az admin oldal alatti route nem véd automatikusan egy külön
  `/api/*` route-ot.

## GTFS update

Fázis 1: manuális, admin által indított frissítés
(`POST /api/admin/vedett-utvonal/gtfs-refresh`, admin+flag védett). A
letöltött zip a `.vedett-cache/gtfs-static/bkk/` alá kerül (git-ignorálva,
lásd `.gitignore`). Az architektúra (`TransitProvider.refreshStaticData()`)
felkészítve arra, hogy ezt később cron / scheduled job hívja automatikusan.

Nem duplikáljuk a GTFS tartalmát az alkalmazás Supabase adatbázisába —
csak a fájlt és egy `meta.json`-t (letöltés időpontja, méret) tárolunk
helyben, amíg nincs routing engine, ami ezt ténylegesen feldolgozná.

## GTFS-Realtime

`TripUpdates`, `VehiclePositions`, `Alerts` — mindhárom implementálva
(`BkkProvider.getTripUpdates/getVehiclePositions/getServiceAlerts`).
Rövid élettartamú cache-elésre felkészítve (`VEDETT_ROUTE_CACHE`), Fázis
1-ben minden admin API hívás friss adatot kér le (nincs bevezetett külön
cache réteg, mivel az admin tesztfelület forgalma alacsony — ha ez
publikus élesítéskor változik, ide kell beépíteni pl. Upstash Redis-t,
ahogy a middleware kommentje is javasolja a rate limithez).

## MOTIS setup

**Jelenlegi státusz: NINCS beüzemelve.** Ennek oka technikai, nem hanyagság
(lásd `lib/vedett-route/motisClient.ts` fejléc-kommentje): a
[MOTIS](https://motis-project.de/) egy különálló, saját gráfot igénylő
szolgáltatás (OpenStreetMap kivonat + BKK statikus GTFS alapján épített
gráf, jellemzően GB-os inputtal és perces-órás build idővel). Egy
tipikus Next.js hosting (pl. Vercel) nem alkalmas ilyen hosszú élettartamú,
nagy memóriaigényű folyamat futtatására — ezért ezt **külön szolgáltatásként**
kell üzemeltetni, ahogy a mesterprompt architektúrája is előírja (12. pont).

Javasolt lépések (manuális, mert külső infrastruktúra-döntést igényel):

1. Szerezz be egy Budapest (vagy Magyarország) OSM kivonatot (pl.
   [Geofabrik](https://download.geofabrik.de/europe/hungary.html)).
2. Töltsd le a BKK statikus GTFS-t (`gtfs-refresh` admin végpont, vagy
   közvetlenül a fenti URL-ről).
3. Indítsd el a `docs/motis-example/docker-compose.yml`-ben vázolt MOTIS
   konténert egy erre alkalmas szerveren (nem feltétlenül ugyanazon, ahol a
   Next.js app fut).
4. Állítsd be a `MOTIS_BASE_URL` környezeti változót a Next.js app
   deploy-jában erre a szolgáltatásra mutatva.
5. A `lib/vedett-route/motisClient.ts`-ben lévő `planJourneyWithMotis`
   függvényt kell majd a ténylegesen üzembe állított MOTIS instance valós
   API válaszformátumához igazítani (a MOTIS API dokumentációja alapján,
   annak függvényében, melyik MOTIS verzió kerül telepítésre).

Amíg ez nem történik meg, a keresés API mindig
`{ ok: false, reason: "routing_engine_unavailable" }` választ ad —
ez a szándékos, dokumentált Fázis 1 viselkedés, nem hiba.

## Admin access & UI

Lásd fent "Admin access". UI komponensek:
`components/vedett-utvonal/VedettUtvonalStatusPanel.tsx` és
`VedettUtvonalSearchForm.tsx`, oldal: `app/admin/vedett-utvonal/page.tsx`.

## Testing

Lásd `__tests__/vedett-route/` — a 31. pontban felsorolt tesztkategóriák
(authorization, API key, BKK, routing, feature flag) dokumentálva és részben
automatizált tesztként megírva; lásd a README-t a `__tests__/vedett-route/`
mappában a futtatáshoz szükséges (jelenleg a projektben hiányzó) test
runner beállításáról.

## Deployment

- A `BKK_API_KEY`, `VEDETT_ROUTE_ENABLED`, `MOTIS_BASE_URL` változókat a
  hosting szolgáltató (pl. Vercel) környezeti változó kezelőjében kell majd
  ugyanígy, szerver-side-only módon beállítani — sosem a kliens felé
  exponált módon.
- A `.vedett-cache/` könyvtár build között elveszhet szerverless
  környezetben (pl. Vercel) — ez a Fázis 1 manuális-frissítés modellel
  még elfogadható, de automatikus/publikus élesítéskor perzisztens
  tárolást (pl. object storage) igényel majd.

## Phase 2 – MÁV/Volán

**Elkezdve, folyamatban.** A MÁV vasúti GTFS statikus feedje ténylegesen be
van kötve és validálva (`lib/vedett-route/providers/staticFileProvider.ts`,
`StaticOnlyGtfsProvider`), a MÁV/Volán autóbusz ugyanezen a providertípuson
keresztül regisztrálva van, de adatra vár.

Fontos architekturális különbség a BKK-hoz képest: a MÁV/Volán GTFS-nek
**nincs dokumentált, kulcsos OpenData API-ja** úgy, ahogy a BKK-nak — ezért
itt nincs automatikus, hálózati `refreshStaticData()`. Helyette az admin
manuálisan szerzi be a GTFS zip-et, és feltölti az admin felületen
("GTFS statikus feed feltöltése" űrlap, `/admin/vedett-utvonal`) vagy
közvetlenül a `POST /api/admin/vedett-utvonal/gtfs-upload` végponton
(admin+flag védett, `multipart/form-data`, mezők: `provider`
(`MAV_RAIL`/`MAV_BUS`), `file`).

A végpont validálja, hogy a zip valóban GTFS statikus struktúrájú-e
(`agency.txt`, `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`
megléte kötelező — hiányukban 400-as választ ad, a hiányzó fájlok
felsorolásával), kiolvassa a `feed_info.txt`-t (ha van), és elmenti a
`.vedett-cache/gtfs-static/<mav_rail|mav_bus>/` alá (gitignorálva).

Jelenlegi valós állapot (ellenőrizve a ténylegesen feltöltött MÁV
adatból): a MÁV vasút feed érvényes és be van olvasva (kiadó: MÁV,
érvényesség 2026.04.26–2027.02.26, verzió `20260826.M2ChangeID`). A
MÁV/Volán busz feed egyelőre nincs feltöltve — az admin felület "Nincs
feltöltve" státuszt mutat rá, nem kitalált adatot.

GTFS-Realtime a MÁV/Volán esetén: **nincs dokumentált forrás**, ezért a
`getServiceAlerts`/`getTripUpdates`/`getVehiclePositions` mindig üres
tömböt ad — ez szándékos, nem hiba. Ha a MÁV/Volán később közzétesz
dokumentált GTFS-RT feedet, a `TransitProvider` interfész változtatása
nélkül bővíthető (új provider osztály, ugyanaz a regisztrációs minta, mint
a BKK-nál).

A routing engine (MOTIS) szempontjából ez azt jelenti, hogy amint mindkét
MÁV feed feltöltve van, a MOTIS gráf-buildhez már 3 GTFS forrás áll
rendelkezésre (BKK + MÁV vasút + MÁV/Volán busz) — ez még mindig a "MOTIS
setup" fejezetben leírt külön szolgáltatásként történő beüzemelést
igényli, ami nem történt meg ebben a körben sem.

## Phase 3 – Sensory Score

Nincs implementálva, nincs kitalált/ál-adat hozzáadva. Dokumentált jövőbeli
adatmodell-entitások (csak tervezésre, még nem léteznek táblaként):
`transit_hubs`, `sensory_profiles`, `sensory_route_feedback`,
`sensory_segments`, `quiet_points`, `sensory_predictions`.

A Sensory Engine a Route Normalizer UTÁN helyezkedik el (lásd fenti
architektúra ábra) — szigorúan elválasztva a routing engine-től: a routing
feladata "milyen utazások lehetségesek", a Sensory Engine feladata "melyik
a jobb az adott felhasználónak". A UI SOHA nem állíthat garanciát
("biztonságos", "autizmusbarát útvonal") — csak "alacsonyabb becsült
szenzoros terhelés" jellegű, döntéstámogató megfogalmazást használhat.

## Phase 4 – Public beta

Nincs aktiválva, és automatikusan nem is válhat azzá. Feltételek publikálás
előtt: BKK integráció stabil, MÁV vasút integrálva, MÁV/Volán busz
integrálva, Sensory Score validálva, biztonsági audit, adatvédelmi
ellenőrzés, tesztelő családok pilotja, külön explicit publikus release
döntés. Eddig: **ADMIN ONLY**.
