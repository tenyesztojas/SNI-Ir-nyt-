# Védett Útvonal — Production Deployment Útmutató (MOTIS)

**Fontos:** ez a dokumentum egy **jövőbeli** VPS/production telepítést ír le.
A jelenlegi (Sprint 2) állapot egy fejlesztői gépen, Docker Desktopon fut —
lásd `MOTIS_GO_LIVE_REPORT.md`. A funkció ma is admin-only és feature
flag mögött van (`VEDETT_ROUTE_ENABLED`), ez a dokumentum NEM változtatja
ezt meg, és NEM jelent automatikus publikus release-t.

## 1. Ajánlott VPS-méret

A Sprint 2 mérése alapján (605 MB gráf, 450 MB csúcs RAM CSAK BKK-val,
Budapest-scope-pal):

| Cél | Ajánlott RAM | Indoklás |
|---|---|---|
| Csak BKK, jelenlegi scope | 2-4 GB a MOTIS konténernek | A mért 450 MB-hoz bőséges tartalék |
| BKK + MÁV + Volán, teljes ország | **legalább 8-16 GB** a MOTIS konténernek | Becslés — a MÁV/Volán GTFS mérete és az importhoz szükséges munkamemória-csúcs jelentősen nagyobb lehet, ezt Sprint 3-ban kell ténylegesen megmérni, NEM feltételezni |

CPU: az import többmagos (a jelenlegi gépen 8 szálon futott, 69 mp alatt) —
production build szerver oldalon 4+ mag ajánlott, ha rendszeresen
frissítjük az adatot.

Lemez: a jelenlegi bemenet (OSM + BKK GTFS) ~373 MB, a feldolgozott kimenet
605 MB — teljes MÁV/Volán hozzáadásával számoljunk néhány GB-tal.

## 2. Docker image verzió-kezelés

A MOTIS projekt NEM ad ki szemver-címkéjű image-eket. Production
telepítésnél:

1. Húzd le a `ghcr.io/motis-project/motis:master` image-et egyszer, egy
   kontrollált időpontban.
2. Rögzítsd a digest-et (`docker inspect ... --format "{{.RepoDigests}}"`).
3. A production `docker-compose.yml`-ben **a digest szerint** hivatkozz rá
   (`ghcr.io/motis-project/motis@sha256:...`), NE `:master` címkével — így
   egy upstream változás nem téríti el váratlanul a production motort.
4. Csak tudatos, tesztelt frissítéskor húzz új image-et és frissítsd a
   digest-et.

## 3. Hálózati elszigetelés (KŐKEMÉNY KÖVETELMÉNY)

- A MOTIS konténer portja **soha** nem publikálható a `0.0.0.0` interfészen.
  Docker Compose-ban: `ports: ["127.0.0.1:8080:8080"]` VAGY még jobb: ne is
  publikáljunk portot a host felé, hanem egy közös Docker hálózaton
  keresztül érje el csak a Next.js szerver konténer (`expose: ["8080"]`,
  nincs `ports:`).
- A `MOTIS_BASE_URL` kizárólag a Next.js szerver folyamat env változója
  (soha `NEXT_PUBLIC_` előtaggal).
- Tűzfal szinten is zárjuk a 8080-as portot kívülről, függetlenül a Docker
  konfigurációtól (védelem a mélységben).

## 4. Adatfrissítési stratégia

A jelenlegi BKK GTFS statikus — nincs beépített automatikus frissítés a
MOTIS oldalán. Javasolt production megoldás:

1. Ütemezett feladat (pl. heti), ami:
   - letölti a friss BKK GTFS-t és (ha releváns) OSM kivonatot,
   - egy ÚJ, párhuzamos MOTIS konténert épít fel az új adatokkal (külön
     Docker volume-ba),
   - health-check-eli az új konténert (pl. egy ismert megállópár
     lekérdezésével),
   - csak SIKERES health-check után állítja át a Next.js szerver forgalmát
     az új konténerre (blue-green váltás), majd leállítja a régit.
2. Ez elkerüli a "fél-frissített gráf" állapotot és a letöltési idő alatti
   szolgáltatás-kiesést.

## 5. Monitorozás

- A `getVedettRouteStatus()` (lásd `lib/vedett-route/status.ts`) már most
  valós `fetch` alapú elérhetőség-ellenőrzést végez a MOTIS ellen — ezt
  production-ben egy külső uptime-monitorral (pl. lekérdezi az admin
  `/api/admin/vedett-utvonal/status` végpontot) érdemes kiegészíteni.
- Logolás: minden routing hiba a `vedettRouteLog()`-on keresztül
  strukturált JSON-ként kerül a szerver logba (`routing_error`, `timeout`,
  `routing_engine_unavailable` eseménytípusok) — production-ben ezt
  érdemes egy log-aggregátorba (pl. meglévő projekt-monitorozó
  eszközbe) irányítani.

## 6. Skálázás / terhelés

A Sprint 2 mérés (60 lekérdezés, BKK-only, ugyanazon a gépen futó kliens és
szerver) p95 = 88 ms, p99 = 155 ms volt — ez production alatt, hálózati
késleltetéssel és nagyobb (multi-provider) gráffal magasabb lesz. Javasolt:

- Route-query cache bevezetése (lásd `VEDETT_ROUTE_CACHE` konfiguráció a
  `lib/vedett-route/config.ts`-ben, jelenleg csak a statikus GTFS
  cache-elésre használt — a route-query cache-t az Orchestrator elé kell
  betenni, kulcs: `fromPlace+toPlace+departAt kerekítve+weights`).
- A MOTIS maga is támogat több szálat (`n_threads`) — production
  konténernél állítsuk a rendelkezésre álló CPU magok számához.

## 7. Amikor a MÁV/Volán is bekerül a gráfba

Lásd `GTFS_OVERLAP_REPORT.md` 4. pontja — ekkor:

1. Újra kell mérni a RAM- és importidő-igényt (ne feltételezzük a jelenlegi
   BKK-only számokat).
2. Az Orchestrator stratégiáit bővíteni kell (`transitModes` bővítés
   `RAIL`/`COACH`-sal).
3. A Sensory Engine `underground` faktora továbbra is csak a `SUBWAY` módra
   vonatkozik — vasúti (`RAIL`) szakaszokra ez a faktor NEM alkalmazandó
   automatikusan (a vonat nem "földalatti" élmény), ezt kódszinten
   ellenőrizni kell, ha a MÁV bekerül.

## 8. Rollback terv

Mivel a funkció admin-only és `VEDETT_ROUTE_ENABLED` feature flag mögött
van, a leggyorsabb rollback: `VEDETT_ROUTE_ENABLED=false` és a szerver
újraindítása (vagy env-változó hot-reload, ha a hosting azt támogatja) —
ez azonnal elrejti a funkciót anélkül, hogy kódot kellene visszaállítani.
A MOTIS konténer leállítása nem szükséges a funkció elrejtéséhez, de
production incidens esetén az is biztonságosan megtehető (a Next.js
oldal ekkor is csak "routing_engine_unavailable" választ ad, sosem hibázik
ki csúnyán).
