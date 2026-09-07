# VPS MOTIS Handoff — Tiszta környezetben végzett realtime bizonyítás terve

> ## STÁTUSZ FRISSÍTÉS (2026-09-07) — ELAVULTNAK JELÖLVE RÉSZBEN
>
> **A VPS provisioning és a BKK realtime MOTIS integráció időközben
> ELKÉSZÜLT.** Az alábbi B) és C) szakaszok "jövőbeli terv"-ként íródtak —
> ez a keret MÁR MEGTÖRTÉNT, ezért a lenti tartalom mostantól **történeti
> feljegyzés**, nem élő terv. A tényleges, megvalósult állapotot lásd itt:
>
> - Infra tények (VPS méret, Docker image, portok, MOTIS verzió): lásd
>   `VPS_STAGING_INTEGRATION_GATE.md` "Infra tények" szakasza.
> - A realtime routing bizonyítása: **MEGTÖRTÉNT, BKK REALTIME ROUTING
>   VERIFIED: YES** (kontrollteszt a 70-es járatra, realtimeMode=OFF vs
>   REALTIME, ténylegesen eltérő indulási idővel) — a lenti D) szakasz
>   release gate sablonja pontosan ezt a formátumot kapta meg kitöltve.
> - A KÖVETKEZŐ feladat NEM a VPS provisioning (az kész), hanem a Next.js/
>   Vercel alkalmazás biztonságos becsatlakoztatása a VPS-en futó
>   realtime MOTIS-hoz — lásd `VPS_STAGING_INTEGRATION_GATE.md`.
>
> Az A) BKK kulcs-ellenőrzés és a D) release gate SABLON (a táblázat
> szerkezete) továbbra is érvényes és követendő mintaként szolgál —
> ezeket NEM kell újraírni.

**Állapot (EREDETI, a fenti frissítés előtti szöveg): DOKUMENTÁCIÓ, NEM
VÉGREHAJTVA.** A jelenlegi lokális MOTIS
környezet ehhez a dokumentumhoz **NEM lett módosítva** — a B) pont
adatait kizárólag a felhasználó saját, éles PowerShell/Docker
munkamenetéből kapott, read-only `docker inspect`/`docker image
inspect`/`docker exec --version` kimenetek alapján rögzítjük. Ez a
dokumentum egy jövőbeli, tiszta VPS-en végzett bizonyítási menetrend —
nem egy most futtatott lépéssorozat.

## A) BKK API kulcs — biztonsági ellenőrzés eredménye

A 2026-09-07-i futtatás mindhárom BKK GTFS-Realtime feedre PASS-t adott
(`npm run vedett-route:gtfs-rt-feed-test`):

- TripUpdates: **PASS** (6923 entity)
- VehiclePositions: **PASS** (1658 entity)
- Alerts: **PASS** (79 entity)

A kulcs értéke ehhez a dokumentumhoz **sehol nem került be** — a
terminál/log kimenet is csak PASS/FAIL státuszt és entity-számot
tartalmazott.

## B) Jelenlegi lokális MOTIS állapot — csak megfigyelt tények, NEM módosítva

Ez a szakasz kizárólag a felhasználó saját gépén futó `docker
inspect`/`docker image inspect`/`docker exec --version` parancsok valós
kimenetét rögzíti (2026-09-06/07). **Semmilyen `docker` parancs nem
futott ehhez a dokumentumhoz — csak a korábban kapott kimenetet
dokumentáljuk.**

| Tulajdonság | Érték |
| --- | --- |
| Image tag | `:master` |
| Image digest | `sha256:2a99b5f811f1694570914359417b82641eb622c9228b24aa6cfb2e863282f547` |
| MOTIS build/verzió | `b1e7a56` |
| Konténer neve | `motis-vedett` |
| Adat volume | `motis-data-vol` → mountolva `/data`-ra |
| Konténer indítási időpontja | `2026-09-06T21:08:57.411279072Z` |
| Statikus routing működik-e | **IGEN** — a `/api/v6/plan` hívások sikeresek, valós itinerary-kat adnak vissza |
| Realtime routing bizonyítva-e | **NEM** — lásd `BKK_REALTIME_INTEGRATION_REPORT.md`, végső verdikt: `BKK REALTIME ROUTING VERIFIED: NO` (infrastrukturális ok, nem kódhiba) |

**FONTOS KORLÁTOZÁS (a felhasználó explicit utasítása alapján, ehhez a
sprinthez):**

> A jelenlegi működő lokális MOTIS data volume-ot NE módosítsd. NE
> indíts új MOTIS importot. NE frissíts `:master` image-re. NE próbáld
> most újra bizonyítani a MOTIS realtime routingot. Ezt majd tiszta VPS
> környezetben végezzük el.

Ennek megfelelően a lokális `motis-data-vol` volume-ot, a futó
`motis-vedett` konténert és a `:master` image-et ez a sprint
**érintetlenül hagyta** — nem történt `docker restart`, `docker cp`,
`motis import`, vagy image pull.

### Miért `:master` NEM alkalmas hosszú távra

A `:master` tag egy mozgó céltábla — minden pull más binárist hozhat,
ami reprodukálhatatlanná teszi a "melyik MOTIS verzió alkalmazza-e a
realtime frissítést a routingra" kérdést. A fenti riport szerint éppen
ez volt a nyitott gyanú: a jelenleg futó `b1e7a56` build esetleg nem
alkalmazza teljeskörűen a realtime konfigurációt anélkül, hogy egy friss,
teljes újraimport ne futna le ugyanazzal a binárissal.

## C) VPS setup terv — pinned, reprodukálható MOTIS környezet

### C.1 — Image kiválasztás

- **SOHA `:master`** production/VPS környezetben.
- Válassz egy konkrét, publikált MOTIS release tag-et (pl. `v X.Y.Z`),
  **ideálisan digest szerint pin-elve**:
  ```
  docker pull motis/motis@sha256:<pinned-digest>
  ```
- Rögzítsd a választott digest-et és a MOTIS commit hash-t egy
  `VPS_MOTIS_VERSION.md` fájlban (vagy ebben a dokumentumban egy külön
  "Aktuális VPS verzió" szakaszban), hogy jövőbeli frissítés esetén
  visszakövethető legyen, mi változott.
- Az import és a serving konténer **UGYANAZT a pin-elt image-et/digest-et
  használja** — soha ne importálj egy verzióval, és szolgálj ki egy
  másikkal.

### C.2 — Friss OSM adat

- Friss OSM extract letöltése Magyarországra/Budapestre (pl.
  Geofabrik `.osm.pbf`), dátumozva a fájlnévben (pl.
  `budapest-fovaros-2026-XX-XX.osm.pbf`).
- Az extract forrását és letöltési dátumát dokumentáld — ne "valamikori"
  fájlt használj újra egy korábbi importból.

### C.3 — Friss BKK statikus GTFS

- A BKK statikus GTFS zip-jét frissen töltsd le a VPS-re (ne a lokális
  gépről másolt, esetlegesen elavult fájlt).
- Rögzítsd a letöltés dátumát és — ha elérhető — a GTFS `feed_info.txt`
  verziójelzését.

### C.4 — Friss import

- `motis import` a fenti pin-elt image-dzsel, a friss OSM + friss BKK
  GTFS adatokkal, **egy ÚJ data volume-ba** (lásd C.6) — nem a lokális
  gépen jelenleg használt `motis-data-vol`-ba, és nem is annak egy
  másolatába, hogy elkerüljük bármilyen korábbi, esetlegesen inkonzisztens
  állapot öröklését.

### C.5 — BKK GTFS-Realtime runtime konfiguráció

- Ugyanazt a `generate-motis-rt-config.mjs` mintát használd, amit ez a
  projekt már implementált (lásd `BKK_REALTIME_INTEGRATION_REPORT.md`,
  4. pont) — a 3 hivatalos BKK GTFS-RT feed (`TripUpdates`,
  `VehiclePositions`, `Alerts`) `timetable.datasets.bkkgtfs.rt`
  tömbként, `protocol: gtfsrt` jelöléssel.
- **KRITIKUS, a lokális környezetben megtapasztalt hiba elkerülése
  végett:** győződj meg arról, hogy a VPS-en a MOTIS konténer a
  config-ot ugyanabból a helyről olvassa, ahova a generátor ír — ha a
  konténer named volume-ot használ (mint a lokális `motis-data-vol`),
  a config módosítása után explicit `docker cp` + `docker restart`
  szükséges, VAGY állítsd be a konténert úgy, hogy a config fájlt egy
  host-oldali bind mountról olvassa, hogy a generátor írása azonnal
  látható legyen a konténerben.
- Az API kulcsot **soha** ne írd be a Docker image-be vagy a git
  repóba — kizárólag runtime env változóból/generált, gitignore-olt
  config fájlból.

### C.6 — Új, tiszta data volume

- Hozz létre egy ÚJ, névvel megkülönböztethető data volume-ot (pl.
  `motis-data-vol-vps-v1`), hogy a lokális gépen futó `motis-data-vol`-lal
  soha ne keveredjen össze, és a VPS-en végzett import/teszt sose
  érintse a lokális fejlesztői környezetet.

### C.7 — Ugyanaz a MOTIS verzió importhoz és kiszolgáláshoz

- Az import lépés (C.4) és a serving konténer (ami a `/api/v6/plan`-t és
  a realtime feed-eket kezeli) **ugyanazt a pin-elt image digest-et**
  használja. Egy verzióeltérés az import és a serving között lehet
  pontosan az oka annak, hogy egy realtime konfiguráció nem érvényesül
  a routingban (ez volt a lokális környezetben azonosított gyanú is).

## D) Realtime release gate — sablon a végső bizonyításhoz

A VPS-en végzett teszt során a következő táblát kell kitölteni, **csak
valós, élesben megfigyelt eredményekkel** — feltételezés vagy
extrapoláció nem elegendő:

```
STATIC/RT MATCH:              [PASS/FAIL] — a statikus GTFS menetrend és
                               a realtime feed ugyanarra a útvonalra/
                               trip_id-ra vonatkozik-e
MOTIS RT FEED LOADED:         [PASS/FAIL] — a MOTIS logban/health
                               endpoint-on látható-e, hogy betöltötte a
                               3 BKK realtime feedet, friss timestamp-pel
STATIC DEPARTURE:             [HH:MM, forrás: statikus GTFS menetrend]
REALTIME DEPARTURE:           [HH:MM, forrás: BKK TripUpdates feed,
                               ugyanarra a trip_id-ra]
MOTIS ITINERARY DEPARTURE:    [HH:MM, forrás: MOTIS /api/v6/plan válasz,
                               ugyanarra az útvonalra]

Döntési szabály: ha MOTIS ITINERARY DEPARTURE == REALTIME DEPARTURE
ÉS REALTIME DEPARTURE != STATIC DEPARTURE (azaz van tényleges realtime
eltérés, amit a MOTIS válasz tükröz) -> a MOTIS bizonyítottan
alkalmazza a realtime frissítést a routingra.

Ha MOTIS ITINERARY DEPARTURE == STATIC DEPARTURE, DE a REALTIME
DEPARTURE eltér -> a MOTIS NEM alkalmazza a realtime adatot (ugyanaz a
hiba, mint a lokális környezetben feltételezett).

BKK REALTIME ROUTING VERIFIED: [YES/NO]
```

**YES verdikt kizárólag akkor adható, ha mind az 5 fenti sor valós,
egyidejűleg megfigyelt adatot tartalmaz, és a döntési szabály explicit
YES-t eredményez.** Feltételezésen vagy "valószínűleg működik" jellegű
indoklás alapján NO-t kell írni, és dokumentálni, mi hiányzik a
bizonyításhoz.

## E) Mit NEM tartalmaz ez a dokumentum

Ez a dokumentum kizárólag terv — nem tartalmaz tényleges VPS
provisioning parancsokat, szerver hozzáférési adatokat, vagy a
tényleges import/teszt eredményét, mert ezek még nem történtek meg.
A VPS-en végzett tényleges végrehajtás egy külön, ezt a tervet követő
munkamenet feladata.
