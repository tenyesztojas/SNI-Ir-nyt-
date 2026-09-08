# Sprint E.1 — Real Rest Point Discovery (2026-09-08)

## Miért kellett ez a sprint

A Sprint E ("Pihenőre van szükségem" folyamat) UI-ja és állapotgépe már készen állt, de a `/api/vedett-route/rest-stops/nearby` végpont kizárólag a felhasználó SAJÁT (`USER` forrású) pihenőpontjait kérdezte le. Egy induló felhasználónak nincs egyetlen saját pihenőpontja sem, ezért a funkció a gyakorlatban mindig "A pihenőpontok betöltése sikertelen volt." hibát mutatta. Ez a sprint valós, többforrású pihenőpont-felfedezést vezet be: a saját pontok mellett a VédettSarok (`places` tábla) és az OpenStreetMap (Overpass API) adatait is bevonja.

## Architektúra

```
Browser -> Next.js API (/api/vedett-route/rest-stops/nearby)
        -> discoverRestPoints() [aggregator.ts]
             -> userRestPointProvider   (Supabase, RLS, csak saját)
             -> vedettSarokRestPointProvider (places tábla, publikus)
             -> osmRestPointProvider    (Overpass API, publikus)
        -> dedupeRestPoints()
        -> rankRestPoints() [ranking.ts, változatlan Sprint E modul]
        -> RankedRestPoint[] JSON válasz
        -> RestStopFlowPanel.tsx (UI)
```

A böngésző **soha** nem hívja közvetlenül az Overpass API-t, a Supabase admin/service-role réteget, vagy a route-service secret tokent — minden hálózati hívás szerver oldalon (Next.js API route-on és a mögötte futó providereken) történik.

### RestPointProvider interfész

`lib/vedett-route/restStopFlow/discovery/types.ts` — egységes szerződés mindhárom forráshoz:

```ts
interface RestPointProvider {
  readonly name: "user" | "vedettSarok" | "osm";
  findNearby(params: FindNearbyParams): Promise<ProviderResult>;
}
type ProviderResult = { status: "ok"; points: RestPoint[] } | { status: "unavailable"; reason: string };
```

Egyik implementáció sem dob nyers kivételt a hívónak — mindig típusos `ProviderResult`-tal tér vissza, ami lehetővé teszi a partial-failure kezelést (lásd lent).

- **`userProvider.ts`** — a meglévő `listOwnRestPoints()` + `filterVisibleRestPoints()` párost hívja újra (nem duplikálja), a találatokat `category: "USER"`-rel látja el.
- **`vedettSarokProvider.ts`** — a meglévő `getApprovedPlaces()`-t hívja, koordinátával rendelkező, jóváhagyott helyeket alakít `RestPoint` DTO-vá. **Soha nem ír a `rest_points` táblába** — ezt egy DB-szintű `CHECK` constraint (`rest_points_user_source_only`) is kikényszeríti a `supabase/migrations/20260907_rest_points.sql`-ban, függetlenül az alkalmazáskódtól.
- **`osmProvider.ts`** — szerver oldali Overpass-hívás (staging/preview only, lásd lent).

## OSM integráció

### Kategória-szűkítés

Kizárólag 8, explicit felsorolt OSM kategória kerül be találatként (`osmTagMapping.ts` `OSM_CATEGORY_DEFS`): `amenity=toilets`, `amenity=bench`, `leisure=picnic_table`, `leisure=park`, `leisure=garden`, `amenity=shelter`, `amenity=library`, `amenity=community_centre`. Bolt, étterem, kávézó, szolgáltatás **soha** nem kerül be — ez túlterhelné a listát, és nem "pihenőpont" jellegű hely.

### Tag → attribútum leképezés — "UNKNOWN != FALSE"

A `deriveOsmAttributes()` függvény determinisztikus, hálózat-független, tesztelt (lásd `__tests__/vedett-route/sprint-e1-discovery.test.ts`). Alapelv: egy hiányzó OSM tag **soha** nem jelent `false`-t, csak azt, hogy az adott elemről nincs információ — a mező ilyenkor `null` (UNKNOWN) marad.

| OSM tag | RestPoint mező |
|---|---|
| `amenity=bench`, `leisure=picnic_table` | `seating: true` |
| `amenity=toilets`, `toilets=yes` | `toilet: true` |
| `amenity=shelter/library/community_centre` | `indoors: true` |
| `leisure=park/garden`, kültéri kategóriák | `outdoors: true` |
| `fee=yes` / `fee=no` | `purchaseRequired: true/false` |
| `access=private`, `access=no` | az elem **teljesen kizárva**, sosem ajánljuk |
| `access=customers`, `access=permit` | megmarad, de a `notes` mezőben egyértelműen jelölve ("Korlátozott hozzáférés") — nem alapértelmezett ajánlás |

A `quietSpace` mező **soha** nem kerül kitöltésre OSM adatból — egy park nem automatikusan csendes, egy könyvtár nem automatikusan szenzorosan nyugodt, és a rendszer sosem következtet "autizmusbarát" státuszra pusztán az OSM tagekből.

### Hálózati réteg és adatvédelem

- Explicit timeout (`AbortController`, 8s kliens oldali + `[timeout:6]` szerver oldali Overpass direktíva), legfeljebb 1 retry (csak hálózati/timeout hibán, nem HTTP 4xx-en, nem malformed válaszon), sosem végtelen retry.
- Malformed/hibás HTTP válasz esetén a provider `{status:"unavailable", reason}`-t ad vissza, sosem dob nyers hibát.
- A szerver továbbítja a koordinátákat az Overpass felé (ez elkerülhetetlen egy "közelben" kereséshez), de a nyers `lat`/`lon` **soha** nem kerül logolásba — a `vedettRouteLog()` hívások csak a hiba okát/típusát (`timeout`, `provider_error`) rögzítik.
- **Staging/preview-only jelleg**: ez a publikus `overpass-api.de` instance-ra mutató implementáció kifejezetten staging/preview validációhoz készült. Production-ben a `VEDETT_ROUTE_ENABLED` flag változatlanul `false` marad. A jövőbeli, végleges architektúra egy **önhosztolt, a projekt már meglévő Magyarország OSM PBF-jéből épített POI-index** lesz — ezt a `RestPointProvider` absztrakció kifejezetten úgy készült, hogy ez a csere később az `osmProvider.ts` belsejét érintse, az aggregátort és az API route-ot ne.

## Dedupe

`dedupe.ts` — determinisztikus, konzervatív egyesítés: két találat csak akkor számít "ugyanannak a helynek", ha **mindkét** feltétel teljesül — koordináta-közelség (≤30m) ÉS név-hasonlóság (normalizált, ékezet-független prefix/tartalmazás egyezés). Pusztán a közelség (pl. két külön pad ugyanabban a parkban) sosem elég az összevonáshoz. Egyezés esetén a `VEDETT_SAROK` forrás mindig felülírja az `OSM`-et (gondozott adat > nyers OSM adat). `USER` pontok soha nem vonódnak össze semmivel — mindig privát, saját rekordok.

## Aggregátor és sugár-bővítés

`aggregator.ts` — a 3 provider `Promise.all`-lal, egymástól függetlenül fut. Minden provider saját `try/catch`-csel véd, az aggregátor egy másodlagos védelmi hálót is tartalmaz (véletlenül nem kezelt kivétel esetére).

- Első kör: 800 méteres sugár.
- Ha a dedupe **utáni** eredmény nulla, **pontosan egyszer** újra próbálkozunk 1500 méterrel — soha nem végtelen/ismételt bővítés.
- A visszaadott `points` lista **nincs** levágva `MAX_REST_POINTS`-ra az aggregátorban — ezt szándékosan a hívó (`route.ts`) végzi, a `rankRestPoints()` rangsorolás **után**, hogy a megjelenő 10-15 pont ténylegesen a legjobban rangsorolt legyen, ne csak "az első N, amit véletlenül találtunk".

### Partial failure — három különbörő üzenet

1. **Van találat, de valamelyik forrás hibázott** → `ok:true`, `partial:true` — a UI a listával együtt mutatja: *"Néhány közeli hely most nem tölthető be."*
2. **Nulla találat, minden forrás elérhető volt** → `ok:false`, `reason: "NO_REST_POINTS_FOUND"` — *"A közelben most nem találtunk megfelelő pihenőpontot."*
3. **Nulla találat, ÉS legalább egy forrás hibázott** → `ok:false`, `reason: "REST_POINTS_PARTIALLY_UNAVAILABLE"` — *"Néhány közeli hely most nem tölthető be — próbáld meg kicsit később újra."* Ez a szöveg szándékosan **nem** azonos a régi generikus `REST_POINT_LOAD_FAILED` ("A pihenőpontok betöltése sikertelen volt.") szöveggel — a felhasználó így megkülönböztetheti a "valóban nincs itt semmi" és a "most technikai gond van" eseteket.

## Kategóriák és gyorsszűrők

`categoryLabels.ts` — a normalizált kategóriák (`TOILET`, `BENCH`, `PICNIC`, `PARK`, `GARDEN`, `SHELTER`, `LIBRARY`, `COMMUNITY`, `USER`, `VEDETT_SAROK`) mindegyikéhez egy illusztratív magyar címke + emoji tartozik — ez szándékosan nem véglegesített dizájn, könnyen finomítható anélkül, hogy a discovery/ranking logikát érintené.

Az öt gyorsszűrő (`Mind`, `Leülnék`, `Mosdót keresek`, `Zöld hely`, `Beltéri, fedett hely`) kizárólag a `RestPoint` típuson ténylegesen létező mezőkön dolgozik (`seating`, `toilet`, `category`, `indoors`) — nem vezet be új, nem létező attribútumot. A szűrők `null` (ismeretlen) értéket sosem kezelnek "nem felel meg"-ként — csak azokat zárják ki, amikről ténylegesen tudjuk, hogy nem megfelelőek.

## UI

`RestStopFlowPanel.tsx` a `REST_POINTS_READY` állapotban:
- kis MapLibre térképet mutat a jelölt pontok markereivel (kategóriánként megkülönböztethető emoji-jelöléssel, `VedettUtvonalMap.tsx` `RestPointMarker.category` mezője),
- hover/klikk szinkronban a lenti listával (`highlightedRestPointId` state),
- gyorsszűrő-sávot,
- `expandedSearch`/`discoveryPartial` esetén a megfelelő magyarázó szöveget,
- a kiválasztás (`SELECT_REST_POINT`) és az "Ide megyek" gomb változatlan — a Sprint E állapotgépet és a route-to-rest-point/resume folyamatot nem érintettük.

## Biztonság és jogosultság

A végpont (`app/api/vedett-route/rest-stops/nearby/route.ts`) továbbra is `requireVedettRouteAccess()`-en keresztül fut (admin_only + feature flag), a `userProvider.ts` a hívó session-jéhez kötött klienssel dolgozik (RLS érvényesül), a `filterVisibleRestPoints()` egy második, alkalmazás-szintű védelmi réteg. Se a válasz, se a szerver logok nem tartalmaznak `userId`-t, service-role adatot vagy nyers GPS-koordinátát.

## Amit ez a sprint NEM módosított

MOTIS/VPS/Caddy, route-service secret token kezelése, a production `VEDETT_ROUTE_ENABLED` flag (változatlanul `false`), a BKK GTFS-Realtime integráció, az OpenFreeMap alaptérkép/CSP beállítások, a Sprint E állapotgép átmenetei, az `originalDestination` megőrzési logika.
