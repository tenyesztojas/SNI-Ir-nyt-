# VPS → Staging Integration Gate — Zárójelentés

**Dátum: 2026-09-07.** Cél: a Next.js/Vercel alkalmazás biztonságosan a
VPS-en futó, valós BKK realtime adatokkal működő MOTIS-t használja,
**Sprint E fejlesztése NÉLKÜL** (azt szándékosan nem kezdtük el, lásd I)
szakasz).

**FONTOS, ŐSZINTE FIGYELMEZTETÉS A JELENTÉS ELEJÉN:** ez a munkamenet
egy felhőben futó sandboxból dolgozik, amely (a korábbi sprintekben
megismételten megerősítve) **nem ér el tetszőleges külső hosztot** —
nincs hálózati kapcsolata sem a VPS-hez, sem a go.bkk.hu-hoz, és nem fér
hozzá a felhasználó valódi Docker démonjához vagy a VPS shell-jéhez. Ezért
**a VPS-en ténylegesen elvégzendő infrastruktúra-munkát (reverse proxy,
HTTPS, DNS, auth) NEM tudtam elvégezni vagy tesztelni** — ezeket pontosan
leírom lentebb (H) VPS oldali teendők), de **nem állítom, hogy kész
állapotban vannak**. Amit ténylegesen elvégeztem és teszteltem: a Next.js
alkalmazás kódrétegét (kliens, konfiguráció, hibakezelés, tesztek,
típusellenőrzés, build).

## Infra tények (a felhasználó által megadott, élesben megfigyelt adatok)

Ezeket a tényeket a felhasználó saját VPS munkamenetéből kaptam — nem én
mértem/teszteltem, csak dokumentálom.

| Tulajdonság | Érték |
| --- | --- |
| VPS OS | Debian 13 |
| CPU / RAM / lemez | 4 vCPU / 8 GB RAM / 256 GB NVMe / 8 GB swap |
| Docker | fut |
| MOTIS verzió | pinned `v2.11.2` |
| Saját image | `vedett-motis:2.11.2` |
| Hungary OSM import | PASS |
| BKK static GTFS import | PASS |
| Valós Budapest routing | PASS |
| Static kontroll port | `127.0.0.1:8080` (NEM publikus) |
| Realtime MOTIS port | `127.0.0.1:8081` (NEM publikus) |
| BKK GTFS-RT ingest | működik, `/api/v1/health` → `{"rt":true,"gbfs":false}` |
| Mért realtime feed siker-arány | 5397 entity összesen, 5193 sikeres (96.22%) |
| Realtime routing bizonyítva | **IGEN** — kontrollteszt a 70-es járatra: `realtimeMode=OFF` → 10:54/11:09 (realTime:false), `realtimeMode=REALTIME` → startTime 10:58 / endTime 11:13 (realTime:true), **ténylegesen eltérő indulási/érkezési idővel** |

## A) Audit — a jelenlegi MOTIS kliensréteg és a szükséges módosítás

### A.1 Mit találtam az audit előtt

- `lib/vedett-route/motisClient.ts` — a `fetchMotisPlan()` egyetlen,
  konfigurálható `MOTIS_BASE_URL` env változóra épült, közvetlen `fetch`
  hívással, **auth fejléc nélkül**, timeout-tal, de retry nélkül.
- `lib/vedett-route/config.ts` — `getMotisBaseUrl()` egyszerűen kiolvasta
  a `MOTIS_BASE_URL`-t, semmilyen production/dev megkülönböztetés vagy
  auth-koncepció nélkül.
- `lib/vedett-route/status.ts` — a MOTIS elérhetőségét egy `/api/v1/geocode`
  hívással tesztelte, szintén auth nélkül.
- Ez a modell KIZÁRÓLAG akkor biztonságos, ha a Next.js szerver és a
  MOTIS ugyanazon a gépen/Docker hálózaton fut — ez volt az eredeti
  feltételezés (lásd a korábbi `PRODUCTION_DEPLOYMENT.md` 3. pontja). A
  jelenlegi valós architektúrában (Next.js Vercel-en, MOTIS a VPS-en,
  `127.0.0.1`-re kötve) ez **NEM teljesül** — a Next.js szerver
  fizikailag nem tudná elérni a `127.0.0.1:8081`-et, mert az a VPS saját
  loopback-je, nem a Vercel függvényé.
- Egyetlen hívási hely (`orchestrator.ts`) használja `fetchMotisPlan()`-t
  — ez leegyszerűsítette az auditot: a routing-hoz szükséges módosítás
  **kizárólag a kliensrétegben** (motisClient.ts + config.ts) történhet,
  az orchestrator/route API réteget nem kellett módosítani.

### A.2 A szükséges módosítás (implementálva, lásd B/C/D szakaszok)

1. Egy ÚJ, elsődleges hívási út bevezetése: `ROUTE_SERVICE_URL` +
   `ROUTE_SERVICE_AUTH_TOKEN` — a Next.js szerver ezt hívja HTTPS-en,
   `Authorization: Bearer <token>` fejléccel.
2. A régi `MOTIS_BASE_URL` közvetlen elérés **megtartása, de KIZÁRÓLAG
   fejlesztői gépen** (`NODE_ENV !== "production"` — production-ben fail
   closed, MÉG AKKOR IS, ha a változó véletlenül be van állítva).
3. Timeout + explicit AbortSignal, EGY retry hálózati hibán (nem
   időtúllépésen, nem HTTP hibaválaszon), és pontos hibafelosztás:
   `timeout` / `routing_engine_unavailable` (hálózat/nincs konfigurálva)
   / `routing_error` (HTTP hiba, auth hiba, malformed JSON).
4. Health/readiness kiterjesztés a meglévő admin status végponton, a
   route service `/api/v1/health`-jét lekérdezve (ugyanazt, amit a
   felhasználó élesben tesztelt).

## B) Production-safe konfiguráció (implementálva)

`lib/vedett-route/config.ts`:

- `getRouteServiceConfig(): RouteServiceConfig | null` — csak akkor ad
  vissza konfigurációt, ha **mindkét** env változó (`ROUTE_SERVICE_URL`,
  `ROUTE_SERVICE_AUTH_TOKEN`) be van állítva, ÉS az URL `https://`-sel
  kezdődik (localhost kivétel csak fejlesztői teszthez). Timeout
  konfigurálható (`ROUTE_SERVICE_TIMEOUT_MS`, alapértelmezett 8000 ms,
  felső korlát 25000 ms — a Vercel function időkorlátja alatt kell
  maradnia).
- `getLegacyDirectMotisBaseUrl()` — a régi `MOTIS_BASE_URL`, de
  **production-ben mindig `null`**, függetlenül attól, be van-e állítva.

`lib/vedett-route/motisClient.ts`:

- `resolveRouteTarget()` — route service elsőbbséget élvez, utána
  legacy dev fallback, utána `null` (fail closed).
- Timeout: `AbortSignal.timeout(...)`, felső korlát 30 mp.
- Retry/fallback stratégia: **EGYETLEN retry, kizárólag hálózati szintű
  hibán** (kapcsolat elutasítva, DNS hiba), 250 ms várakozással. Nincs
  retry időtúllépésen (duplázná a válaszidőt) és nincs retry HTTP
  hibaválaszon (4xx/5xx — a route service/MOTIS szándékosan adta vissza).
- Error mapping: `timeout` / `routing_engine_unavailable` (nincs
  konfigurálva vagy hálózati hiba) / `routing_error` (HTTP hiba, auth
  hiba, malformed JSON) — a végfelhasználó felé MINDIG ugyanaz az
  általános magyar üzenet, a pontos ok csak a szerver logban jelenik meg.

## C) Client-side leakage audit — EREDMÉNY: TISZTA

Elvégzett ellenőrzés (`grep`, lásd a munkamenet parancsai):

- Egyetlen `"use client"` jelölésű fájl SEM importálja a
  `lib/vedett-route/config.ts`, `motisClient.ts`, `status.ts` vagy
  `access.ts` modulokat.
- Nincs `NEXT_PUBLIC_`-előtaggal ellátott MOTIS/ROUTE_SERVICE/BKK
  változó sehol a kódbázisban.
- A `ROUTE_SERVICE_AUTH_TOKEN` string KIZÁRÓLAG két fájlban fordul elő:
  `config.ts` (kiolvassa) és `motisClient.ts` (a kommentben említi) —
  mindkettő szerver-only modul, sosem kerül a kliens bundle-be (Next.js
  App Router: `app/api/*/route.ts` fájlok mindig szerver oldalon futnak,
  a `lib/vedett-route/*` modulokat pedig kizárólag ilyen route
  handlerek és szerver komponensek importálják).
- A token SOHA nem kerül a lekérdezés URL-jébe (query stringbe) —
  kizárólag `Authorization` HTTP fejlécben utazik. Ezt automatizált teszt
  is ellenőrzi (`route-service-client.test.ts`, "a route service auth
  token SOHA nem kerül a kimenő URL-be" teszt).
- A `logger.ts` `redact()` függvénye emellett is véd (kulcs/token nevű
  mezőket automatikusan `[redacted]`-re cserél), de a `motisClient.ts`
  eleve sosem adja át a headert vagy a tokent a `vedettRouteLog()`
  hívásoknak — csak azt logolja, hogy TÖRTÉNT-e auth hiba (`status: 401`),
  magát az értéket soha.

## D) Health/readiness integráció (implementálva)

A meglévő `GET /api/admin/vedett-utvonal/status` végpontot bővítettem
(nem hoztam létre új végpontot — az admin diagnosztikai felület már
eleve ezt hívja, ide illesztettem be a route service health-et):

- `routingEngine.mode`: `"route_service"` / `"legacy_direct"` /
  `"unconfigured"`.
- `routingEngine.reachable`: a route service `/api/v1/health`
  hívásának eredménye (auth fejléccel, 3 mp timeout-tal).
- `routingEngine.realtimeIngest` / `routingEngine.gbfs`: a health
  válasz `rt`/`gbfs` mezői — pontosan az a formátum, amit a felhasználó
  élesben megfigyelt (`{"rt":true,"gbfs":false}`).
- Admin-only végpont (`requireVedettRouteAdmin`), soha nem tartalmazza
  a tokent vagy a route service belső URL-jét a válaszban túl azon,
  amit az admin már ismer (a saját maga állította be env változóként).

## E) Realtime mezők megőrzése (implementálva)

A felhasználó VPS kontrolltesztjében megfigyelt itinerary-szintű mezőket
(`scheduledStartTime`, `startTime`, `scheduledEndTime`, `endTime`,
`realTime`, `cancelled`) végigvezettem a teljes láncon:

1. `motisTypes.ts` — `MotisItinerary` kiegészítve `scheduledStartTime?`,
   `scheduledEndTime?`, `realTime?`, `cancelled?` mezőkkel (mind
   opcionális — soha nem feltételezünk mezőt, amit nem láttunk).
2. `orchestrator.ts` — `mapMotisItineraryToJourney()` ezeket átemeli a
   `Journey` objektumba: `scheduledDepartureTime`, `scheduledArrivalTime`,
   `realTime`, `cancelled`.
3. `types.ts` — `Journey` interfész kiegészítve ugyanezekkel a mezőkkel.
4. **FONTOS, MEGLÉVŐ (nem ehhez a sprinthez tartozó, de releváns) tény:**
   a LEG-szintű realtime mezők (`leg.realTime`, `leg.scheduledArrival`,
   `leg.cancelled`, `delayMinutes` számítás) már a korábbi BKK Realtime
   sprintben implementálva voltak (`orchestrator.ts`
   `computeDelayMinutes()`) — ez a sprint az ITINERARY-szintű mezőket
   adta hozzá, amik korábban hiányoztak a típusokból.

## F) UI szabály (implementálva, + megerősítve egy meglévő komponensben)

**Leg-szinten ez már a korábbi BKK Realtime sprintben implementálva
volt** (`TransitLegRealtimeNote` komponens,
`components/vedett-utvonal/VedettUtvonalSearchForm.tsx`) — pontosan a
kért szabály szerint: `realtime=false` → "Menetrend szerinti indulás:
HH:mm", `realtime=true` és van kiszámítható eltérés → mindkét idő
egyértelműen megjelenítve, késés/korábbi indulás jelzéssel.

Ehhez a sprinthez ÚJ komponenst adtam hozzá: `JourneyRealtimeSummary` —
ugyanaz a szabály, de a **teljes útvonalra** (nem csak egy lábra)
vonatkozóan, a most bevezetett `journey.realTime` /
`journey.scheduledDepartureTime` mezőkből:

- `journey.cancelled` → piros, félkövér figyelmeztetés.
- `journey.realTime` hiányzik/false → "Menetrend szerinti indulás: HH:mm".
- `journey.realTime === true` ÉS a menetrend szerinti és a tényleges
  indulás eltér → mindkettő megjelenik, egyértelműen elkülönítve.
- `journey.realTime === true`, de nincs eltérés → "Valós idejű adat
  szerint pontosan a menetrend szerint indul."

## G) Staging E2E tesztek (implementálva, unit-szinten mockolt fetch-csel)

**ŐSZINTE MEGJEGYZÉS:** ezek NEM élő E2E tesztek a valódi VPS route
service ellen (nincs hálózati elérésem hozzá ebből a sandboxból) — a
`global.fetch` mockolásával a KLIENS KÓD tényleges hibakezelési útjait
tesztelik, ugyanazt a mintát követve, mint a projekt már meglévő
`motisClient.test.ts` 3. tesztje. Fájl:
`__tests__/vedett-route/route-service-client.test.ts` (10 teszt, mind
PASS):

1. Normál realtime útvonal — `ok:true`, `realTime:true` adat átadva.
2. Nincs realtime adat — `ok:true` marad, `realTime` mező hiányzik,
   nincs hiba.
3. Realtime feed unavailable (upstream 503) — `routing_error`, nem akad
   el kivétellel.
4. MOTIS/route service timeout — `reason: "timeout"`.
5. MOTIS/route service unavailable (hálózati hiba) — `reason:
   "routing_engine_unavailable"`, pontosan 1 retry után.
6. Auth failure (401) — `routing_error`, a token bizonyítottan sosem
   kerül a válaszba.
7. Malformed upstream response (HTTP 200, invalid JSON) —
   `routing_error`, nem dob kivételt.
8. A token sosem kerül a kimenő URL-be (csak headerbe).
9. Production módban a legacy `MOTIS_BASE_URL` fallback fail closed.
10. Nem-HTTPS `ROUTE_SERVICE_URL` esetén a konfiguráció érvénytelen.

## H) VPS oldali teendők — EZEKET NEM VÉGEZTEM EL, PONTOS LEÍRÁS

**Ez a szakasz a legfontosabb figyelmeztetés ebben a jelentésben: az
alábbiak egyike sincs kész, és NEM tudom innen elvégezni vagy
tesztelni.** A Next.js oldali kód (B/C/D/E/F/G fent) készen áll arra,
hogy EGY, a lenti leírás szerint felállított route service-t hívjon —
de amíg a route service ténylegesen nem létezik a VPS-en, a
`ROUTE_SERVICE_URL` bármire is mutat, a routing "nincs konfigurálva"
vagy "nem elérhető" választ fog adni (fail closed, ez SZÁNDÉKOS).

### H.1 — Reverse proxy létrehozása a VPS-en

Egy TLS-t terminátoló reverse proxy (pl. Caddy vagy Nginx) telepítése,
ami:

- Egy ÚJ, dedikált subdomainen figyel (pl. `route.vedettsarok.hu` — a
  pontos nevet a felhasználó választja).
- Csak a szükséges MOTIS végpontokat proxyzza tovább a
  `127.0.0.1:8081`-re: `/api/v6/plan` és `/api/v1/health` (NE proxyzzon
  tetszőleges MOTIS útvonalat — a felület szándékosan szűkített).
- MINDEN bejövő kérésen ellenőrzi az `Authorization: Bearer <token>`
  fejlécet, és a `ROUTE_SERVICE_AUTH_TOKEN`-nel egyező érték hiányában
  `401`-et ad vissza, MIELŐTT a kérés eljutna a MOTIS-hoz. Ez az
  authentikáció lehet a reverse proxy szintjén (pl. Caddy
  `basicauth`/egyedi header-check plugin, vagy Nginx
  `if ($http_authorization != "Bearer <token>") { return 401; }` —
  utóbbi Nginx-ben `map` direktívával biztonságosabb, mint nyers `if`).
- A `127.0.0.1:8080`/`127.0.0.1:8081` portok maradjanak `127.0.0.1`-re
  kötve (NE `0.0.0.0`) — a reverse proxy ugyanazon a gépen fut, eléri
  loopback-en, kívülről csak a proxy HTTPS portja (443) legyen elérhető.

### H.2 — DNS

- Egy A/AAAA rekord felvétele a választott subdomainhez (pl.
  `route.vedettsarok.hu`), a VPS publikus IP-jére mutatva.

### H.3 — HTTPS tanúsítvány

- Let's Encrypt (pl. Caddy automatikusan intézi, vagy `certbot` Nginx-hez)
  — a tanúsítvány automatikus megújítással.

### H.4 — Tűzfal

- A VPS tűzfalán (pl. `ufw`) csak a 443 (HTTPS) és a szükséges SSH port
  legyen nyitva kívülről. A 8080/8081 portok maradjanak zárva kívülről,
  még akkor is, ha Docker-szinten `127.0.0.1`-re vannak kötve (védelem a
  mélységben, ugyanaz az elv, mint a korábbi `PRODUCTION_DEPLOYMENT.md`
  3. pontjában).

### H.5 — Auth token generálása és biztonságos átadása

- Egy kellően hosszú, random secret generálása (pl. `openssl rand -hex 32`)
  a VPS-en.
- Ez az érték kerül be:
  - a reverse proxy konfigurációjába (a fenti H.1 ellenőrzéshez),
  - a Vercel projekt szerver-oldali env változójába
    (`ROUTE_SERVICE_AUTH_TOKEN`, lásd lentebb "Szükséges env változók").
- A secret **SOHA** nem kerül git-be, chat-be, vagy bármilyen logba — a
  generált értéket csak egyszer, biztonságos csatornán (pl. a VPS saját
  terminálján generálva és közvetlenül a Vercel dashboardba bemásolva)
  szabad mozgatni.

### H.6 — Health check ellenőrzés a proxyn keresztül

- Miután a fenti kész, a felhasználónak (VPS-ről vagy egy külső gépről)
  ellenőriznie kell:
  ```
  curl -H "Authorization: Bearer <token>" https://route.vedettsarok.hu/api/v1/health
  ```
  Elvárt válasz: `{"rt":true,"gbfs":false}` (vagy hasonló, a tényleges
  aktuális realtime állapotot tükrözve).
- Auth token NÉLKÜL ugyanez a hívás `401`-et kell, hogy adjon — ezt is
  érdemes explicit ellenőrizni, mielőtt a Vercel oldal élesítésre kerül.

## I) Sprint E — NEM implementálva (a spec explicit utasítása szerint)

A "Pihenőre van szükségem" folyamatot, vagy bármilyen Sprint E
funkciót ez a munkamenet SZÁNDÉKOSAN nem érintett.

## Módosított/új fájlok listája

```
Módosítva:
  lib/vedett-route/config.ts        — getRouteServiceConfig(), getLegacyDirectMotisBaseUrl()
  lib/vedett-route/motisClient.ts   — teljes újraírás: route service + legacy dev fallback,
                                       retry, error mapping, auth header
  lib/vedett-route/status.ts        — health/readiness a route service /api/v1/health ellen
  lib/vedett-route/motisTypes.ts    — MotisItinerary: scheduledStartTime/scheduledEndTime/realTime/cancelled
  lib/vedett-route/orchestrator.ts  — az új itinerary mezők átemelése Journey-be
  lib/vedett-route/types.ts         — Journey: scheduledDepartureTime/scheduledArrivalTime/realTime/cancelled
  components/vedett-utvonal/VedettUtvonalSearchForm.tsx — JourneyRealtimeSummary komponens

Új:
  __tests__/vedett-route/route-service-client.test.ts   — 10 teszt (G) pont)
  docs/vedett-route/VPS_STAGING_INTEGRATION_GATE.md      — ez a dokumentum

Frissítve (státusz megjegyzés, nem tartalmi újraírás):
  docs/vedett-route/VPS_MOTIS_HANDOFF.md — "elavult" figyelmeztetés a tetején
```

## Architektúra összefoglaló

```
böngésző
   │  (SOHA nem hívja a MOTIS-t közvetlenül)
   ▼
VédettSarok Next.js szerver/API  (Vercel, VEDETT_ROUTE_ENABLED=false marad)
   │  requireVedettRouteAccess() — admin-only + feature flag, változatlan
   ▼
lib/vedett-route/motisClient.ts  — fetchMotisPlan()
   │  Authorization: Bearer <ROUTE_SERVICE_AUTH_TOKEN>
   │  HTTPS, timeout + 1 retry hálózati hibán, teljes error mapping
   ▼
HTTPS route service (VPS, reverse proxy — H) szakasz, MÉG NINCS FELÁLLÍTVA)
   │  auth ellenőrzés, csak /api/v6/plan + /api/v1/health engedélyezett
   ▼
127.0.0.1:8081 MOTIS (VPS, NEM publikus port)
```

## Teszteredmények

```
node --test __tests__/vedett-route/*.test.ts __tests__/rest-points/*.test.ts __tests__/hooks/*.test.ts
  tests 125
  pass 125
  fail 0

npx tsc --noEmit
  (hibamentes, 0 sor kimenet)
```

A 125 teszt tartalmazza a korábbi Map/GPS/Rest Points sprint mind a 115
tesztjét (regresszió nélkül) + az ehhez a sprinthez tartozó 10 új
`route-service-client.test.ts` tesztet.

**A production build (`npm run build`) ebben a munkamenetben NEM
futott le újra** — a legutóbbi (Map/GPS/Rest Points sprint végi) build
PASS volt, és a mostani változtatások kizárólag a `lib/vedett-route/*`
réteget és egy meglévő UI komponenst érintik, típushibát a `tsc
--noEmit` már kiszűrt volna. Mindazonáltal a build tényleges
újrafuttatását és visszaigazolását javaslom, mielőtt a branch
mergelésre kerül (lásd Deployment checklist).

## Security audit eredmény

| Ellenőrzés | Eredmény |
| --- | --- |
| Browser közvetlenül hívja-e a MOTIS-t? | NEM — grep-ellenőrizve, egyetlen kliens komponens sem importál szerver-only routing modult |
| Secret kliens bundle-be kerül-e? | NEM — `ROUTE_SERVICE_AUTH_TOKEN` csak 2 szerver-only fájlban fordul elő |
| Secret URL query stringbe kerül-e? | NEM — automatizált teszttel ellenőrizve, csak `Authorization` fejlécben utazik |
| Secret logba kerül-e? | NEM — `vedettRouteLog()` sosem kapja meg a headert/tokent, csak a HTTP státuszkódot |
| `NEXT_PUBLIC_`-előtaggal van-e bármi MOTIS/route service infó? | NEM |
| Production-ben elérhető-e a régi, auth nélküli közvetlen MOTIS út? | NEM — `NODE_ENV === "production"` esetén `getLegacyDirectMotisBaseUrl()` mindig `null`, teszttel bizonyítva |
| Fail closed minden hibaágon? | IGEN — nincs konfiguráció / hálózati hiba / timeout / auth hiba / malformed response mind `ok:false`-t ad, sosem dob kivételt a hívó felé, sosem generál kitalált útvonalat |
| GPS koordináták logolva vannak-e? | NEM — ez a szabály a korábbi Map/GPS sprintből változatlan, ehhez a sprinthez nem nyúltunk hozzá |
| `VEDETT_ROUTE_ENABLED` production-ben | Változatlanul `false`-nak kell maradnia, amíg ez a gate nincs teljesítve (lásd lent) |

**Amit ez az audit NEM tud igazolni** (mert nincs hozzáférésem a VPS-hez
innen): hogy a ténylegesen felállított reverse proxy helyesen
implementálja-e az auth ellenőrzést, hogy a tűzfal valóban zárja-e a
8080/8081 portokat kívülről, és hogy a HTTPS tanúsítvány érvényes-e. Ezt
a felhasználónak kell live ellenőriznie a H.6 pontban leírt módon.

## Szükséges VPS/Vercel env változók

### VPS (a reverse proxy konfigurációjában, NEM a Next.js-ben)

- A generált auth token (lásd H.5) — a proxy konfigurációs fájljában,
  NEM környezeti változóként a MOTIS konténerben.

### Vercel (Next.js szerver, Production + Preview/Staging environment-enként külön beállítva)

| Változó | Kötelező? | Megjegyzés |
| --- | --- | --- |
| `ROUTE_SERVICE_URL` | IGEN | pl. `https://route.vedettsarok.hu` — SOHA `NEXT_PUBLIC_` előtaggal |
| `ROUTE_SERVICE_AUTH_TOKEN` | IGEN | a H.5-ben generált secret, "Sensitive" jelöléssel a Vercel dashboardon |
| `ROUTE_SERVICE_TIMEOUT_MS` | Nem (van alapérték: 8000) | csak ha a mért p95 válaszidő indokolja |
| `VEDETT_ROUTE_ENABLED` | Változatlan, marad `false` | amíg ez a gate nincs teljesítve |
| `MOTIS_BASE_URL` | NE legyen beállítva production-ben | ha véletlenül be van állítva, a kód akkor is fail closed-ol (production-ben figyelmen kívül hagyja) — de tisztább, ha egyáltalán nincs jelen |

## Deployment checklist

```
[ ] VPS: reverse proxy telepítve és fut (H.1)
[ ] VPS: csak /api/v6/plan és /api/v1/health van proxyzva
[ ] VPS: auth ellenőrzés a proxy szintjén, token nélkül 401
[ ] DNS: subdomain A/AAAA rekord felvéve (H.2)
[ ] HTTPS: érvényes tanúsítvány, automatikus megújítás (H.3)
[ ] Tűzfal: 8080/8081 zárva kívülről, csak 443 nyitva (H.4)
[ ] Auth token generálva, biztonságosan átadva (H.5)
[ ] curl teszt tokennel: 200 + {"rt":true,...} (H.6)
[ ] curl teszt token NÉLKÜL: 401 (H.6)
[ ] Vercel: ROUTE_SERVICE_URL beállítva (Production env)
[ ] Vercel: ROUTE_SERVICE_AUTH_TOKEN beállítva, Sensitive jelölve
[ ] Vercel: MOTIS_BASE_URL NINCS beállítva production-ben
[ ] npm run build sikeres (a felhasználó PowerShellben visszaigazolja)
[ ] Admin /api/admin/vedett-utvonal/status: routingEngine.mode === "route_service", reachable: true
[ ] Admin felületen egy valós keresés lefuttatva, realtime mező ellenőrizve
[ ] VEDETT_ROUTE_ENABLED marad false, amíg ez a checklist nincs 100%-ban kész
```

## STAGING INTEGRATION READY: NO

**Indoklás:** a Next.js/kód oldali munka (A-G szakaszok) készen áll,
tesztelve (125/125 teszt, tiszta típusellenőrzés), és biztonságilag
auditálva (fail closed minden hibaágon, nincs secret-szivárgás). DE a
H) szakaszban leírt VPS-oldali infrastruktúra (reverse proxy, DNS,
HTTPS, tűzfal, auth token) **még nincs felállítva** — ezt egy
felhasználó által, a VPS-en elvégzett munka kell, hogy kövesse, a fenti
Deployment checklist szerint. A gate csak akkor NO → YES, ha a
checklist minden sora pipálva van, ÉS a live health check (H.6) valós
`{"rt":true,...}` választ ad a route service-en keresztül.
