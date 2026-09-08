#!/usr/bin/env node
/**
 * overpass-smoke-test.mjs
 *
 * DIAGNOSZTIKAI SMOKE TEST a Sprint E.1 staging incidenshez (2026-09-09):
 * a Vercel Preview logban megerősített hiba:
 *   provider: osm, errorCode: http_error, reason: overpass_http_406, httpStatus: 406
 *
 * CÉL: ugyanazt a HTTP request-formátumot (endpoint, method, Content-Type,
 * body-kódolás), amit lib/vedett-route/restStopFlow/discovery/osmProvider.ts
 * ténylegesen használ, KÜLÖN, IZOLÁLTAN ki lehessen próbálni két különböző
 * hálózati környezetből (VPS és Vercel) — hogy megállapítható legyen, a 406
 * a KÉRÉS FORNÁTUMÁHOZ, a KIINDULÓ HELY (Vercel platform / IP-tartomány)
 * ÉGRÉSZÉHEZ, vagy valami máshoz kötődik.
 *
 * SZÁNDÉKOSAN KOORDINÁTAMENTES: ez a script NEM egy "közelben" (around:)
 * lekérdezést küld, hanem egy minimális, egyetlen konkrét OSM node ID-t
 * lekérő query-t ([out:json];node(1);out;) — így semmilyen felhasználói
 * GPS-koordináta, userId, auth token vagy secret NEM kerül bele sem a
 * kérésbe, sem a kimenetbe (a --with-around flaggel opcionálisan egy
 * FIX, publikusan ismert, nem-felhasználói tesztkoordinátával — Budapest
 * városközpont — is kipróbálható ugyanez ha a node(1) query önmagában
 * NEM reprodukálja a hibát és a gyanú a tag-szűrős/around-os query
 * SZERKEZETére esik).
 *
 * MIT VIZSGÁL:
 *   1. Az alap kérés-forma (POST, application/x-www-form-urlencoded,
 *      data=<urlencoded query>) — pontosan az osmProvider.ts-ben használt
 *      forma, encodeURIComponent()-tel, NEM URLSearchParams-szal (lásd a
 *      script alján az összehasonlító megjegyzést).
 *   2. Egyedi, azonosító User-Agent header hatása — a script alapból KÜLD
 *      egy egyedi User-Agent-et (lásd USER_AGENT lent), és a --no-ua
 *      flaggel kikapcsolható, hogy A/B — összehasonlítást lehessen végezni
 *      ("406 csak UA nélkül jön-e, vagy UA-val is").
 *   3. A válasz pontos HTTP státusza, a legfontosabb response headerek
 *      (Content-Type, Server, X-* headerek — ha egy CDN/WAF blokkolja a
 *      kérést, ez itt gyakran látszik), és a body első ~500 karaktere.
 *
 * FUTTATÁS:
 *   VPS-ről:
 *     node scripts/vedett-route/overpass-smoke-test.mjs
 *     node scripts/vedett-route/overpass-smoke-test.mjs --no-ua
 *     node scripts/vedett-route/overpass-smoke-test.mjs --no-referer
 *     node scripts/vedett-route/overpass-smoke-test.mjs --with-around
 *
 *   Vercelről: a Vercel platformnak nincs interaktív shellje, ezért ezt a
 *   scriptet onnan KÉT MÓDON lehet futtatni:
 *     a) `vercel dev` a helyi gépen (ez a Vercel dev runtime-ot szimulálja,
 *        de a KIMENŐ HÁLÓZATI ÚT/IP-tartomány nem feltétlenül azonos az
 *        éles Vercel edge/serverless hálózatéval — csak részleges bizonyíték),
 *     b) EGYSZERI, IDEIGLENES debug API route-ként bemásolva (pl.
 *        app/api/_debug/overpass-smoke/route.ts, amely meghívja ugyanezt a
 *        makeOverpassRequest()-et és JSON-ban visszaadja az eredményt) —
 *        ez adja a leghitelesebb, tényleges Vercel-egressz-eredményt, DE
 *        egy admin-gate NÉLKÜLI debug route-ot SOHA nem szabad élesben
 *        commitolni/deployolni — csak egy ideiglenes preview branch-en,
 *        admin-gate mögött, majd törölve.
 *
 * NEM KERÜL BELE (spec szerint):
 *   - felhasználói GPS-koordináta
 *   - userId
 *   - auth token / secret
 *   - a teljes, tag-szűrős valós around-query (csak explicit --with-around
 *     flaggel, akkor is fix, publikus teszt-koordinátával, SOHA valós
 *     felhasználói pozícióval)
 */

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

// Ugyanaz az elv, mint amit a Task 1 hotfix kért (VedettSarok-VedettUtvonal
// azonosítás) — lásd a root cause audit jegyzőkönyvét. A kontakt URL egy
// helyőrző, a tényleges éles értéket a projekt tulajdonosa állítja be.
const USER_AGENT = "VedettSarok-VedettUtvonal/1.0 (+https://vedettsarok.hu)";
const REFERER = "https://vedettsarok.hu/";

const args = process.argv.slice(2);
const sendUserAgent = !args.includes("--no-ua");
const sendReferer = !args.includes("--no-referer");
const withAround = args.includes("--with-around");

// Budapest városközpont — PUBLIKUS, széles körben ismert referenciapont,
// NEM felhasználói GPS-pozíció. Csak akkor használjuk, ha --with-around.
const PUBLIC_TEST_COORD = { lat: 47.4979, lon: 19.0402 };

function buildQuery() {
  if (!withAround) {
    // Legminimálisabb lehetséges, koordinátamentes Overpass QL query —
    // egyetlen konkrét OSM node ID lekérése. Ha ez is 406-ot ad, a hiba
    // NEM a mi tag-szűrős/around-os query-nk SZERKEZETÉHEZ kötődik,
    // hanem a request formátumához/azonosításához/platformjához.
    return "[out:json];node(1);out;";
  }
  // Csak diagnosztikai összehasonlításhoz: ugyanaz a forma, mint az éles
  // osmProvider.ts buildOverpassQuery()-je, de fix, publikus koordinátával.
  const around = `(around:800,${PUBLIC_TEST_COORD.lat},${PUBLIC_TEST_COORD.lon})`;
  return `[out:json][timeout:6];(node["amenity"="bench"]${around};way["amenity"="bench"]${around};);out center tags;`;
}

async function main() {
  const query = buildQuery();
  // STAGING HOTFIX (2026-09-09): pontosan ugyanaz a header-készlet és
  // encoding, mint a production osmProvider.ts fetchOverpassOnce()-e —
  // lásd Content-Type charset, User-Agent, Referer. --no-ua / --no-referer
  // flaggel egyenként kikapcsolható A/B teszthez.
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
  };
  if (sendUserAgent) {
    headers["User-Agent"] = USER_AGENT;
  }
  if (sendReferer) {
    headers["Referer"] = REFERER;
  }

  console.log("=== Overpass smoke test ===");
  console.log("endpoint:", OVERPASS_ENDPOINT);
  console.log("method: POST");
  console.log("headers:", JSON.stringify(headers, null, 2));
  console.log("query (koordinátamentes, ha nincs --with-around):", query);
  console.log("body encoding: new URLSearchParams({ data: query }).toString() — MEGEGYEZIK az osmProvider.ts fetchOverpassOnce()-szel");
  console.log("");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  const startedAt = Date.now();
  try {
    // URLSearchParams — MEGEGYEZIK a production osmProvider.ts
    // fetchOverpassOnce()-szel (nem manuális encodeURIComponent()).
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers,
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
    });
    const elapsedMs = Date.now() - startedAt;

    console.log(`HTTP ${response.status} ${response.statusText} (${elapsedMs}ms)`);
    console.log("--- response headers ---");
    for (const [key, value] of response.headers.entries()) {
      console.log(`${key}: ${value}`);
    }
    console.log("--- body (első ~500 karakter) ---");
    const text = await response.text();
    console.log(text.slice(0, 500));

    if (!response.ok) {
      console.log("");
      console.log(`EREDMÉNY: HTTP ${response.status} hiba — lásd a fenti headereket (Server/X-* mezők gyakran elárulják, ha egy CDN/WAF/reverse proxy blokkolta, nem maga az Overpass motor).`);
      process.exitCode = 1;
    } else {
      console.log("");
      console.log("EREDMÉNY: a kérés sikeres volt ezzel a formátummal/headerekkel ebből a hálózati környezetből.");
    }
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    console.log(`HIBA ${elapsedMs}ms után:`, err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    process.exitCode = 1;
  } finally {
    clearTimeout(timeoutId);
  }
}

main();
