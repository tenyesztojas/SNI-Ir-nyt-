# BKK GTFS-Realtime — jelenlegi kapcsolódási státusza a Védett Útvonalhoz

**Dátum:** 2026-09-06
**Módszer:** kódból bizonyítva (grep + a MOTIS `config.yml` tényleges tartalma), NEM feltételezve.

## Válasz

**C) A BKK GTFS-Realtime adat jelenleg EGYÁLTALÁN NINCS bekötve az útvonaltervezésbe.**

Sem (A) a MOTIS routing motorba, sem (B) a Védett Route eredmény kiegészítésébe.

## Bizonyíték

### 1. A MOTIS `config.yml`-je nem hivatkozik semmilyen realtime feedre

A `motis-data/config.yml` `timetable.datasets.bkkgtfs` bejegyzése:

```yaml
datasets:
  bkkgtfs:
    path: gtfs/bkk_gtfs.zip
    extend_calendar: false
    ...
```

Nincs `rt:` alkulcs (összehasonlításképp, a MOTIS hivatalos dokumentációja
szerint egy éles realtime-kötés így nézne ki:
`rt: [{ url: "...", protocol: gtfsrt }]` — ez a mi konfigunkban HIÁNYZIK).
A globális `canned_rt: false` beállítás egy másik, nem idevonatkozó MOTIS
funkció (előre generált/"kanned" realtime szimuláció) kikapcsolása, nem
egy élő feed bekötése.

**Következmény:** a MOTIS maga csak a statikus menetrend alapján tervez —
nem tud késésről, kimaradásról, se semmilyen élő állapotról a mi jelenlegi
beüzemelésünkben.

### 2. A Védett Route Orchestrator sosem tölt fel riasztást az itinerary-ba

`lib/vedett-route/orchestrator.ts`, a `mapMotisItineraryToJourney()`
függvényben:

```ts
alerts: [], // Sprint 2: az élő riasztás<->itinerary összepárosítás még nincs bekötve
```

Ez egy kőkeményen üres tömb — SOHA nem kerül bele valós (vagy kitalált)
riasztás.

### 3. A BKK provider realtime metódusait (`getServiceAlerts`,
`getTripUpdates`, `getVehiclePositions`) a routing/keresési útvonal
sehol nem hívja

Ezeket a metódusokat (lásd `lib/vedett-route/providers/bkk.ts`) kizárólag
a `lib/vedett-route/status.ts` hívja meg — ez az admin diagnosztikai
panelen mutatott "BKK Realtime: Aktív/Nem elérhető" jelzőlámpáért felel,
**nem** a keresési/routing folyamatért. A `lib/vedett-route/orchestrator.ts`,
a `app/api/admin/vedett-utvonal/search/route.ts` és a
`components/vedett-utvonal/*` fájlok grep-elve **nem** hivatkoznak ezekre a
metódusokra.

## Mit LÁT tehát ma a felhasználó?

- A `JourneyLeg.realtime` mező mindig `false` marad minden lábon (mivel a
  MOTIS-tól kapott `realTime` mező sosem `true`, hiszen nincs élő feed).
- A frontend "menetrendi adat" felíratot mutatja minden szakaszon, sosem
  "valós idejű, pontos"-t vagy késés-jelzést.
- Az admin státusz panelen a "BKK Realtime" sor lehet zöld (ha a BKK
  GTFS-RT API elérhető és válaszol), de ez **kizárólag azt jelzi, hogy a
  BKK API technikailag elérhető** — ez FÜGGETLEN attól, hogy a routing
  eredmény felhasználja-e (jelenleg nem).

## Miért van ez így (nem hiba, tudatos scope)

A Sprint 2 fókusza a MOTIS valós, statikus-adatos beüzemelése volt. A
GTFS-Realtime → MOTIS bekötés egy külön, dokumentált MOTIS konfigurációs
lépés (`rt:` blokk hozzáadása + a konténer újraimportálása/újraindítása)
és egy külön Orchestrator-szintű riasztás-összepárosítási logika
(itinerary lábak ↔ aktív riasztások/late adatok) — ezt a jelen sprint
release gate-je (Budapest Béta E2E bizonyítás) nem követeli meg, és ez itt
NEM lett hozzáadva.

## Következő lépés, ha ezt be szeretnénk kötni

1. `config.yml`-ben a `bkkgtfs` dataset alá `rt:` blokk hozzáadása a valós
   BKK GTFS-RT TripUpdates/VehiclePositions/Alerts URL-ekkel (ugyanazok,
   amiket a `BkkProvider` már használ — lásd `lib/vedett-route/providers/bkk.ts`
   `BKK_GTFS_RT_BASE` konstans).
2. MOTIS import/restart az új configgal.
3. A MOTIS `/api/v6/plan` válaszban ellenőrizni, hogy a `realTime` mező
   valóban `true`-ra vált-e az élő lábaknál (ez adja a bizonyítékot, hogy
   tényleg bekötődött, nem csak konfigurálva van).
4. Az Orchestrator riasztás-összepárosítási logikájának megírása (jelenleg
   nem létezik).
