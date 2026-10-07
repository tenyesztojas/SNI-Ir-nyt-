# BKK Station Intelligence Engine (2026-10-07)

Tájékoztató réteg az aktív navigációhoz és az útvonal-előnézethez: legjobb
kijárat, belső átszállási út, lift-kapcsolat, és pontosabb célpont a
„szerelvény eleje / közepe / vége” ajánláshoz. **Nem routing motor**, nem
indít újratervezést, nem változtat rangsort.

## Adatfolyam

```
/srv/vedett-route/input/bkk_gtfs.zip   (ugyanaz, mint a MOTIS-é)
  └─ sidecar buildIndex.js  → generations/<sha256-16>/accessibility-index.json (+ station-infrastructure.json diagnosztika)
       └─ sidecar betöltés → compileStationInfrastructure() generációnként EGYSZER (memória)
            └─ POST /station-infrastructure {dataset, stopIds≤100}  → csak a kért állomás-komplexumok
                 └─ Next.js szerver (search route, flag mögött) → guidance számítás → JourneyLeg.stationGuidance
                      └─ kliens: csak megjelenítés (fázis szerint), gráf soha nem kerül a böngészőbe
```

- Fordító: `lib/vedett-route/stationInfrastructure/compiler.ts` (kanonikus);
  a sidecar byte-azonos másolatot használ (`src/lib/stationInfrastructureCompiler.ts`,
  teszt ellenőrzi).
- Index-verzió: `schemaVersion` + `sourceGeneration` (a zip SHA-256 első 16 hex
  karaktere). Nincs időbélyeg → determinisztikus.
- Frissítés: új zip → a meglévő `buildIndex.js` új generációt épít és aktivál →
  a sidecar 10 mp-en belül betölti → a station index automatikusan újrafordul.
  Kézi állomásadat nincs. A Next.js oldali cache generáció-váltáskor ürül.

## Modell

- Csomópont: GTFS stop (location_type, parent, koordináta, wheelchair_boarding
  nyersen) + névből kinyert konzervatív címkék (`EXIT_LABEL` „[A]”, `LIFT_LABEL`
  „[lift…]”, `DIRECTION_HINT` „» …”).
- Él: pathways.txt sor; `is_bidirectional=1` → két irány, `0` → csak deklarált.
  `pathway_mode`: 1 walkway, 2 stairs, 3 moving sidewalk, 4 escalator,
  5 elevator, 6 fare gate, 7 exit gate, más → UNKNOWN (fail-safe).
- Hiányzó `traversal_time`: az él használható, de a költség csak becslés, és
  ilyenkor másodperc nem jelenik meg.
- Komplexum: pathway-ekkel és parent_station-nel összekötött csomópontok.
- Kijárat-jelölt: location_type=2, kivéve a címke nélküli belső elosztót
  (≥2 másik bejárat-szomszéd, pl. az Astoria közös csomópontja).

## Capability és confidence

| Capability | Jelentés |
|---|---|
| NONE / GEOMETRY_ONLY | nincs pathway → LEVEL 2 geometria vagy UNKNOWN |
| GRAPH_PARTIAL | van gráf, de peronról nem érhető el kijárat → nincs kijárat-ajánlás |
| GRAPH_USABLE / GRAPH_WITH_LIFT | peronról elérhető kijárat (lifttel) |

Kijárat / állomási út confidence: HIGH = teljes explicit út + explicit idők +
érvényes cél; MEDIUM = becsült élköltség, egyenes vonalú cél vagy nem feloldott
peron; LOW = ismeretlen pathway mód; NONE = nincs adat. UI csak HIGH/MEDIUM.
A boarding-position confidence külön: állomás-csomópont célponttal is legfeljebb
MEDIUM (a kocsi peronon belüli helye nem ismert).

## Akadálymentesség

- `STEP_FREE_CONFIRMED`: minden él explicit lépcsőmentes típus, a cél
  wheelchair_boarding=1 (vagy öröklött), a kiinduló nem 2.
- `HAS_LIFT`: explicit lift-él, minden más él is lépcsőmentes típus, de a
  végpontok nem bizonyítottak.
- Minden más: `ACCESSIBILITY_UNKNOWN`. Lift + lépcső vegyesen = UNKNOWN.
  Névben „[lift]” explicit él nélkül semmit nem bizonyít.
- A meglévő `stepFreeRequired` preferencia: az útkeresés csak explicit
  lépcsőmentes éleket használ; ha nincs ilyen, az ajánlás nem állít semmit.
- UI szöveg legfeljebb: „Liftes kapcsolat is ismert …”. Soha: „akadálymentes”.

## Fallback

explicit állomás-infrastruktúra → LEVEL 2 geometria (gyalogos út / egyenes) →
UNKNOWN. Komplex csomópont (névlista vagy többállomásos komplexum) explicit
célpont nélkül UNKNOWN. Bármilyen hiba (nincs sidecar, timeout, rossz válasz,
ismeretlen stop) → nincs guidance; a routing és a navigáció változatlan.

## Mit NEM állít

Kocsiszámot, ajtót, peron- vagy szerelvényhosszt, a kocsi peronon belüli
helyét, teljes akadálymentességet, és nem talál ki kijárat-címkét.

## Flag / env

- `NEXT_PUBLIC_VEDETT_ROUTE_BOARDING_GUIDANCE_ENABLED=true` – a teljes réteg
  (szerveroldali gazdagítás + boarding + kijárat/átszállás + előnézet). Alapból KI.
- Meglévő: `ACCESSIBILITY_SIDECAR_URL`, `ACCESSIBILITY_SIDECAR_AUTH_TOKEN`
  (`ACCESSIBILITY_SIDECAR_TIMEOUT_MS`, a station hívás max. 1,5 s).

## Validáció (VPS)

```bash
node dist/stationInfrastructureReport.js bkkgtfs --station "Batthyány tér" --station "Szentendre"
# opcionális: --write  (station-infrastructure.json a generáció mappájába)
# offline zipből: --zip /srv/vedett-route/input/bkk_gtfs.zip
```

Fejlesztésben a `[vedett-route:station-guidance]` debug log mutatja a
státuszt (NO_STATION_GRAPH, NO_TARGET, NO_CONNECTED_EXIT, GRAPH_PARTIAL,
EXIT_SELECTED, TRANSFER_PATH, lift, boarding cél); productionben nem logol.

## Bővítési pontok

- `StationInfrastructureProvider` (provider.ts): MÁV/Volán/egyéb GTFS új implementációként.
- `StationEdgeCostModel` (graph.ts): későbbi érzékszervi / közösségi él-költség
  (lépcső, zaj, „lift nem működik”) — most nincs ilyen adat, nincs bekötve.
