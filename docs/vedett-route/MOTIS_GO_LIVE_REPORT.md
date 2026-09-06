# MOTIS Go-Live Riport — Sprint 2

**Dátum:** 2026-09-06
**Környezet:** felhasználó saját Windows gépe, Docker Desktop + WSL2 (helyi fejlesztői/staging jellegű beüzemelés, NEM production VPS)

## 1. Géperőforrás-alapállapot (import ELŐTT mért, valós)

| Metrika | Érték |
|---|---|
| Operációs rendszer | Windows (a felhasználó gépe) |
| Összes RAM | ~7,8 GB |
| Szabad RAM induláskor | 456 MB (!) |
| Docker | nem volt telepítve induláskor |
| WSL2 | nem volt telepítve induláskor |

Ez a keret a specifikáció "országos lefedettségű, 3 GTFS-forrásos" ambíciójához
szűkösnek bizonyult — ez vezetett az 1. sz. dokumentált scope-döntéshez (lásd
`GTFS_OVERLAP_REPORT.md`).

## 2. Telepített komponensek (valós verziószámok)

| Komponens | Verzió |
|---|---|
| WSL2 | 2.7.13 |
| Docker Desktop (app) | v4.89.0 |
| Docker Engine | 29.7.2, build a7dcaa6 |
| MOTIS image | `ghcr.io/motis-project/motis:master` |
| MOTIS image digest (rögzített) | `sha256:2a99b5f811f1694570914359417b82641eb622c9228b24aa6cfb2e863282f547` |

**Verzió-rögzítési megjegyzés:** a MOTIS projekt nem publikál szemver
(pl. `2.11.2`) címkéjű Docker image-eket a saját konténerregiszterében —
ezt a hivatalos GHCR csomag oldalán és a projekt saját referencia
`docker-compose.yml`-jén (ami maga is `:master`-t használ) ellenőriztük.
Emiatt a helyes rögzítési stratégia a fenti **digest rögzítése**, nem egy
nem létező verziószám kitalálása.

## 3. Bemeneti adatok (valós, ellenőrzött)

| Adat | Forrás | Méret | Megjegyzés |
|---|---|---|---|
| `hungary-260905.osm.pbf` | Geofabrik (`download.geofabrik.de/europe/hungary.html`) | 323 804 321 bájt | Teljes magyarországi OSM kivonat, 2026-09-03T20:21:51Z állapot |
| `bkk_gtfs.zip` | `go.bkk.hu/api/static/v1/public-gtfs/budapest_gtfs.zip` (API kulccsal) | 49 008 424 bájt | Tartalmazza: `feed_info`, `agency`, `shapes`, `routes`, `stops`, `trips`, `stop_times`, `calendar_dates`, `pathways`, `translations` — érvényes GTFS |

## 4. Az import útja — valós akadályok és megoldásaik

Az import ELSŐRE és MÁSODSZORRA is elhasalt — ezeket NEM hallgatjuk el:

1. **1. hiba: `unable to import: resize error`.** Ok: a Windows-meghajtóról
   közvetlenül becsatolt (`bind mount`) mappa nem támogatja a MOTIS által
   használt memory-mapped fájlok dinamikus növelését. Megoldás: átállás egy
   Docker "named volume"-ra (natív Linux-fájlrendszer a WSL2 VM-en belül).
2. **2. hiba: `unable to import: basic_ios::clear: iostream error`,
   AZONNAL, munkakönyvtár létrehozása előtt.** Ok: a named volume-ot egy
   root felhasználós (`alpine`) konténerrel hoztuk létre, míg a MOTIS image
   nem-root (`uid=100 motis`) felhasználóval fut — a `motis` felhasználónak
   nem volt írási joga a kötetre. Megoldás: `chown -R 100:101` a köteten.
3. **3. (majdnem-)hiba: elégtelen Docker-memória.** A Docker alapértelmezett
   WSL2-memóriakerete csak 3,6 GB volt (1 GB swap-pel) — ezt előzetesen
   6 GB memóriára és 8 GB swap-re növeltük (`%USERPROFILE%\.wslconfig`),
   mielőtt az import véglegesen sikerült volna.

**Végeredmény (3. próbálkozás): SIKERES import, exit code 0.**

## 5. Import teljesítmény (valós, mért)

Teljes import idő: **1 perc 9 másodperc** (lásd a lenti bontást).

| Fázis | Idő |
|---|---|
| `osr` (utcahálózat) | 37,09 s |
| `adr` (geokódolás index) | 20,70 s |
| `tt` (menetrend) | 7,86 s |
| `adr_extend` | 1,41 s |
| `matches` (megálló-utca illesztés) | 2,25 s |
| **Összesen** | **1m 09s** |

Kimeneti adatméret: **605,4 MB** (ebből `tt.bin` — a menetrendi gráf —
94,5 MB, `way_matches.bin` 17,2 MB, `shapes_data.bin` 16,7 MB).

## 6. Routing smoke tesztek (valós, `npm run vedett-route:motis-smoke-test` kimenete)

Mind az 5 tesztelt forgatókönyv **sikeres** volt:

| Forgatókönyv | Válaszidő | Eredmény |
|---|---|---|
| Egy megálló, azonos vonal (Deák Ferenc tér → Blaha Lujza tér) | 1118 ms | 3 perc, 0 átszállás, SUBWAY (M2) — ellenőrizhetően helyes a valóságban is |
| Hosszabb, átszállásos (Kelenföld vasútállomás → Örs vezér tere) | 716 ms | 23 perc, 1 átszállás, SUBWAY→WALK→SUBWAY |
| Metrómentes stratégia (BUS/TRAM/RAIL) ugyanarra a párra | 51 ms | 3 perc, 0 átszállás — a rendszer talált gyors, nem-metrós alternatívát is |
| Jövőbeli időpont (holnap 8:00) | 374 ms | 14 perc, 1 átszállás |
| Nem létező célpont | — | Helyesen NEM talált feloldható helyet — nincs kitalált útvonal |

Teljes gépi kimenet: `motis-data/reports/smoke-test-result.json` (nem
verziókövetett, helyi gépi bizonyíték).

## 7. Teljesítmény-benchmark (valós, `npm run vedett-route:motis-benchmark`, 60 lekérdezés)

| Metrika | Érték |
|---|---|
| Összes lekérdezés | 60 |
| Sikertelen válasz | 12 (20%) |
| Válaszidő min | 5 ms |
| Válaszidő p50 | 32 ms |
| Válaszidő p95 | 88 ms |
| Válaszidő p99 | 155 ms |
| Válaszidő max | 155 ms |
| Csúcs memóriahasználat (konténer) | 450,5 MB |

**A 20%-os hibaarányról — őszinte megjegyzés:** a benchmark script a MOTIS
saját, beépített (ország-szintű, nem Budapest-torzított) geokódolóját
használja néhány magyar helynévre, ami esetenként egy, a keresett
Budapest-i megállótól földrajzilag távoli, azonos nevű országos találatot
ad vissza (pl. azonos utcanév egy másik magyar településen) — ez a MOTIS
`/api/v1/geocode` első találatának naiv elfogadásából ered, NEM a routing
motor hibája. **A production alkalmazás ezt nem érinti**, mert a
felhasználó-néző keresés (`lib/vedett-route/geocode.ts`) a Nominatim
geokódolót használja `countrycodes=hu` + Budapest-közeli súlyozással, nem a
MOTIS beépített geokódolóját. Ez egy dokumentált, ismert korlátja a
BENCHMARK SCRIPTNEK, nem a terméknek — de production előtt érdemes
hasonló torzítást (`place`/`placeBias` paraméter) hozzáadni a benchmark
scripthez is a pontosabb méréshez.

A csúcs memóriahasználat (450 MB) messze a rendelkezésre álló ~5,8 GB WSL2
keret alatt van — ez a jelenlegi (BKK-only, Budapest) scope-nál komfortos
tartalék.

## 8. Biztonság

- A MOTIS konténer portja **kizárólag `127.0.0.1:8080`-ra** van kötve —
  soha nem `0.0.0.0`-ra —, tehát a gazdagépen kívülről (a hálózat felől)
  nem érhető el.
- A `MOTIS_BASE_URL` szerver-oldali env változó, sosem `NEXT_PUBLIC_`
  előtagú, sosem kerül a kliens bundle-be.
- Kizárólag a Next.js szerver oldali `lib/vedett-route/motisClient.ts` éri
  el a MOTIS-t — a kliens (böngésző) sosem hív közvetlenül MOTIS-t.

## 9. Végső státusz

**A MOTIS ténylegesen fut, valós adatot szolgál ki, és a valós smoke tesztek
sikeresek** — ez a specifikáció kőkemény előfeltétele volt bármilyen "READY"
állításhoz. A teljes PASS/FAIL összegzést lásd a session végi jelentésben.
