# Sprint 2 — Végleges PASS/FAIL riport

**Dátum:** 2026-09-06
**Git branch:** `feature/vedett-route-motis-sprint2` (báziskommit: `a0eb781cdb64cbc288beaf2d21abcc254d724a79`)

## 0. Git biztonság

- [x] Külön branch létrehozva a munka előtt.
- [x] Báziskommit hash rögzítve.
- [x] Titkos kulcs (BKK API key) SOHA nem került commitba (`git grep` ellenőrizve, csak `.env.local`-ban van, ami gitignore-olt).
- [x] `motis-data/` (OSM + GTFS bináris fájlok, ~373 MB) gitignore-olva — soha nem kerül a repóba.

## 1. MOTIS beüzemelés valós adattal

**PASS.** Lásd `MOTIS_GO_LIVE_REPORT.md` — valós Magyarország OSM (Geofabrik) + valós BKK GTFS, sikeres import (exit 0, 69 mp, 605 MB kimenet), digest-tel rögzített image.

## 2. Valós routing smoke tesztek

**PASS.** 5/5 forgatókönyv sikeres, valós, ellenőrizhetően helyes eredménnyel (pl. Deák Ferenc tér → Blaha Lujza tér = 3 perc, M2, 0 átszállás — ez a valóságban is pontosan így van).

## 3. GTFS átfedés-audit

**RÉSZLEGES / NEM ALKALMAZHATÓ ebben a sprintben.** Csak BKK van a MOTIS gráfban (dokumentált, egyeztetett scope-döntés a RAM-korlát miatt) — MÁV/Volán átfedés-audit valós adaton NEM végezhető el, amíg azok nincsenek betöltve a gráfba. Lásd `GTFS_OVERLAP_REPORT.md`.

## 4. Védett Route Orchestrator

**PASS.** Két valós, dokumentált MOTIS `/api/v6/plan` paraméterekkel futó stratégia (alap + metrómentes BUS/TRAM/RAIL/COACH), fingerprint-alapú dedup, mind egységtesztekkel (4 teszt) lefedve.

## 5. Sensory Engine V1

**PASS, a "hiányzó adat ≠ nulla" szabály betartva.** 6 valós/levezethető tényező (átszállás, mód-váltás, földalatti arány, gyaloglás, időtartam, várakozás), 2 tényező (jármű-foglaltság, jármű-szintű akadálymentesség) explicit `missingFactors`-ban, sosem kap hallgatólagos 0 értéket — 5 egységteszttel ellenőrizve.

## 6. Rangsorolás + magyarázatok

**PASS.** CALMEST/FASTEST/FEWEST_TRANSFERS címkék, determinisztikus (nem LLM-alapú) magyarázat-generálás, determinizmus tesztelve.

## 7. Személyre szabás

**PASS.** 0-2 tartományú csúszkák tényezőnként, NINCS diagnózis-alapú preset/mód — csak preferencia-súlyozás.

## 8. Frontend

**PASS (kód szinten, böngészős vizuális ellenőrzés még nem történt meg ebben a sprintben).** Rangsor-címkék, szenzoros pontszám + adatlefedettség, hiányzó tényezők listája, személyre szabás UI, adatforrás/frissesség kijelzés a keresési eredmény felett.

## 9. Teljesítmény-benchmark (≥50 lekérdezés)

**PASS.** 60 valós lekérdezés, p50=32ms, p95=88ms, p99=155ms, csúcs memória 450,5 MB. A 20%-os hibaarány oka azonosítva és dokumentálva (a benchmark script saját, ország-szintű geokódolása — NEM a production keresési útvonal, NEM a routing motor hibája). Lásd `MOTIS_GO_LIVE_REPORT.md` 7. pont.

## 10. Cache

**PASS (egyszerű szintű).** In-memory, TTL-alapú route-query cache, dokumentált korláttal (nem megosztott több instance között), 4 egységteszttel.

## 11. Biztonság

**PASS.**
- MOTIS port kizárólag `127.0.0.1`-re kötve.
- `MOTIS_BASE_URL` sosem `NEXT_PUBLIC_`, sosem kliens kódban.
- Egyetlen "use client" komponens sem importál szerver-only modult (`motisClient`, `orchestrator`, kulcsok).
- Admin + feature flag ellenőrzés minden végponton változatlanul érvényben.
- Rate limiting érvényben (`/api/admin/*` generikus szabály, 30 kérés/perc — lefedi a Védett Útvonal végpontokat is).
- Titkos kulcs leak-ellenőrzés tiszta.

## 12. Tesztlefedettség

**PASS.** 28 → **53 teszt**, mind zöld. `npx tsc --noEmit` hibamentes.

## 13. Dokumentáció

**PASS.** `MOTIS_GO_LIVE_REPORT.md`, `GTFS_OVERLAP_REPORT.md`, `PRODUCTION_DEPLOYMENT.md`, ez a riport, plusz a meglévő `docs/vedett-route.md` és teszt-README frissítve.

## Ismert, NEM elvégzett elemek ebben a sprintben (őszintén jelölve)

- MÁV/Volán a MOTIS gráfban — NINCS betöltve (csak BKK).
- Böngészős, vizuális end-to-end teszt a valódi admin UI-n keresztül — nem történt meg ebben a sprintben (csak API/script szintű valós tesztelés).
- Production-szintű hálózati elszigetelés (Docker belső hálózat portpublikálás nélkül) — csak dokumentálva a `PRODUCTION_DEPLOYMENT.md`-ben, nincs ténylegesen bevezetve (ez fejlesztői gépen fut, nem VPS-en).
- Megosztott (több instance közötti) cache — csak folyamaton belüli cache van.
- Élő GTFS-RT (BKK realtime) összekötése a routing eredménnyel (riasztások/késések az itinerary szintjén) — a `journey.alerts` jelenleg mindig üres tömb, ez egy dokumentált, nyílt hiányosság.

## VÉGSŐ VERDIKT

A funkció admin-only és feature-flag mögött marad — ez a sprint NEM aktivált publikus release-t.

A MOTIS routing engine **ténylegesen, valós adattal, sikeresen fut**, és a kőkemény előfeltétel (valós MOTIS import + legalább egy valós routing teszt) **teljesült**.

Ugyanakkor ez a beüzemelés fejlesztői gépen, egyetlen adatforrással (BKK), production hálózati hardening nélkül történt.

**READY FOR VPS DEPLOYMENT: NO**

(Az admin-only, fejlesztői/staging célú további tesztelésre és iterációra viszont KÉSZ áll.)
