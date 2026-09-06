# GTFS adathalmaz-átfedési audit — Sprint 2

**Dátum:** 2026-09-06
**Készítette:** Claude (automatizált audit), a projekt tényleges adatai alapján.

## Összefoglaló

Ebben a sprintben a ténylegesen üzembe állított MOTIS routing engine **kizárólag
a BKK statikus GTFS-adatát** importálta. Ez tudatos, dokumentált döntés volt
(lásd "Döntési pont" lentebb), NEM technikai mulasztás.

A MÁV (vasút) és a MÁV/Volán (autóbusz) statikus GTFS-adatai a Sprint 1
Fázis 2 munkája során **már validálva és feltöltve vannak** az admin felületen
keresztül (lásd `lib/vedett-route/providers/staticFileProvider.ts` és a
`data-sources/gtfs-raw/` archívum), de **még NEM kerültek bele a MOTIS
gráfjába** — ezért egy tényleges átfedés-audit (pl. közös megállók
azonosítása azonos GPS-koordinátán/néven MÁV és BKK között) ebben a
sprintben **nem végezhető el valós adaton**, mert csak egy adatforrás van
ténylegesen a routing motorban.

## Döntési pont (dokumentált, a felhasználóval egyeztetve)

A fejlesztői gép RAM-kapacitása (7,8 GB összesen, ebből induláskor mindössze
456 MB szabad) nem tette lehetővé a teljes országos lefedettségű (BKK + MÁV +
Volán, teljes magyarországi OSM gráf) import biztonságos, megbízható
elvégzését ezen a sprinten. A felhasználó explicit döntése alapján a
scope-ot erre a sprintre leszűkítettük: **Budapest + a teljes magyarországi
OSM térkép + kizárólag a BKK GTFS** — ez garantáltan elfér a rendelkezésre
álló (WSL2-nek juttatott ~5,8 GB RAM) keretben, és ténylegesen, sikeresen le
is futott (lásd `MOTIS_GO_LIVE_REPORT.md`).

## Mit NEM állítunk

- Nem állítjuk, hogy a jelenlegi MOTIS-instance multi-provider (BKK+MÁV+Volán)
  útvonalakat tud tervezni — ez false lenne. Jelenleg **kizárólag BKK
  (budapesti) adatot lát**.
- Nem gyártunk kitalált átfedési statisztikát a MÁV/Volán adatra vonatkozóan,
  amíg az nincs ténylegesen betöltve a routing gráfba.

## Következő lépés (Sprint 3 vagy erősebb gépen/VPS-en)

1. MÁV (vasút) és MÁV/Volán (autóbusz) GTFS hozzáadása a MOTIS
   `config.yml` `timetable.datasets` szekciójához (`mav_rail`, `mav_bus`
   kulcsokkal, a már validált fájlok alapján).
2. Újraimport (várhatóan nagyobb RAM- és időigénnyel — becslés: legalább
   2-3x a jelenlegi 605 MB-os/69 másodperces importhoz képest, mivel a MÁV
   és Volán adathalmazok mérete a `data-sources/gtfs-raw/` alapján
   jelentős).
3. **Ekkor** végezhető el ténylegesen a megálló-szintű átfedés-audit (pl.
   azonos GPS-koordináta ±50 méteren belül, vagy azonos `stop_name` BKK és
   MÁV/Volán között — ez adja meg, mely pontokon lehetséges valós
   átszállás a jelenleg különálló hálózatok között).
4. Az Orchestrator stratégiáit (lásd `lib/vedett-route/orchestrator.ts`)
   bővíteni kell a multi-provider esettel (pl. `transitModes` bővítése
   `RAIL`/`COACH` módokkal MÁV/Volán viszonylatokon).

## Jelenlegi adatforrás pontos állapota (ellenőrizve)

| Forrás | Státusz a MOTIS gráfban | Fájlméret | Forrás |
|---|---|---|---|
| BKK (Budapest) | **Betöltve, aktív** | 49 008 424 bájt | `go.bkk.hu/api/static/v1/public-gtfs/budapest_gtfs.zip` |
| MÁV (vasút) | Validálva, admin-feltöltve, **MOTIS-ban NINCS betöltve** | lásd `data-sources/gtfs-raw/` | Felhasználó által biztosított |
| MÁV/Volán (busz) | Validálva, admin-feltöltve, **MOTIS-ban NINCS betöltve** | lásd `data-sources/gtfs-raw/` | Felhasználó által biztosított |
