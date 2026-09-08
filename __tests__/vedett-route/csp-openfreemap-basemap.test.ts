/**
 * CSP — OpenFreeMap Liberty valódi utcai alaptérkép (2026-09-08)
 *
 * Ez a fájl a korábbi __tests__/vedett-route/csp-maplibre-demotiles.test.ts
 * UTÓDJA: a demotiles.maplibre.org demo stílust az OpenFreeMap Liberty
 * (valódi OSM utcai alaptérkép) váltotta le, ezért a régi teszt-fájl
 * eltávolításra került, ez váltja fel ugyanazokkal az invariánsokkal,
 * frissítve az új hostra és a dinamikus (MAP_STYLE_URL-ből számolt)
 * connect-src bővítésre.
 *
 * ROOT CAUSE / DÖNTÉS: a demotiles.maplibre.org technikailag működött, de
 * tartalmilag alkalmatlan (ország-szintű demo stílus, nincs utcahálózat).
 * Az OpenFreeMap Liberty (https://tiles.openfreemap.org/styles/liberty)
 * valódi, OSM-alapú utcai vector tile stílus. Minden erőforrása (style,
 * vector tile, glyph, sprite, raster háttér) EGYETLEN hosztról
 * (tiles.openfreemap.org) érkezik — ezt élő style.json + TileJSON
 * lekéréssel ellenőriztük (lásd docs/vedett-route/MAP_GPS_RESTPOINT_SPRINT.md
 * "OpenFreeMap audit" szakasza).
 *
 * middleware.ts a connect-src bővítést DINAMIKUSAN, a MAP_STYLE_URL-ből
 * (new URL(...).hostname) számolja — ez a teszt ugyanazt a logikát
 * tükrözi (nem importálja a middleware.ts-t, mert az Supabase/Next.js
 * runtime függőségeket hoz be, amit plain node:test nem tud feloldani).
 *
 *   node --test __tests__/vedett-route/csp-openfreemap-basemap.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function buildCsp(nonce: string, supabaseHost: string, mapStyleHost: string | null, isDev: boolean): string {
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://unpkg.com`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://unpkg.com`;

  return [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline' https://unpkg.com`,
    `img-src 'self' data: blob: https:`,
    `connect-src 'self' https://${supabaseHost} https://*.supabase.co wss://*.supabase.co https://oauth2.googleapis.com https://www.googleapis.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://unpkg.com${mapStyleHost ? ` https://${mapStyleHost}` : ""}`,
    `frame-src https://www.google.com https://www.youtube.com https://www.youtube-nocookie.com`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

const NONCE = "test-nonce-abc123";
const SUPABASE_HOST = "xyzabc.supabase.co";
const MAP_STYLE_HOST = "tiles.openfreemap.org";

function directive(csp: string, name: string): string {
  const line = csp.split(";").find((d) => d.trim().startsWith(name));
  assert.ok(line, `${name} direktíva megtalálható`);
  return (line as string).trim();
}

describe("CSP — tiles.openfreemap.org engedélyezve a connect-src-ben", () => {
  it("production connect-src tartalmazza a https://tiles.openfreemap.org hostot", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, MAP_STYLE_HOST, false);
    const connectSrc = directive(prodCsp, "connect-src");
    assert.ok(connectSrc.includes("https://tiles.openfreemap.org"), `connect-src: ${connectSrc}`);
  });

  it("development connect-src is tartalmazza (a térkép dev alatt is működjön)", () => {
    const devCsp = buildCsp(NONCE, SUPABASE_HOST, MAP_STYLE_HOST, true);
    const connectSrc = directive(devCsp, "connect-src");
    assert.ok(connectSrc.includes("https://tiles.openfreemap.org"), `connect-src: ${connectSrc}`);
  });

  it("a meglévő connect-src hostok (Supabase, Google OAuth, Analytics, unpkg) megmaradtak — nincs regresszió", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, MAP_STYLE_HOST, false);
    const connectSrc = directive(prodCsp, "connect-src");
    for (const host of [
      `https://${SUPABASE_HOST}`,
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://oauth2.googleapis.com",
      "https://www.googleapis.com",
      "https://www.google-analytics.com",
      "https://region1.google-analytics.com",
      "https://www.googletagmanager.com",
      "https://unpkg.com",
    ]) {
      assert.ok(connectSrc.includes(host), `connect-src-nek tartalmaznia kell: ${host}`);
    }
  });
});

describe("CSP — a demotiles.maplibre.org host NINCS többé runtime használatban", () => {
  it("a buildCsp() connect-src kimenete NEM tartalmazza a demotiles.maplibre.org-ot", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, MAP_STYLE_HOST, false);
    assert.ok(!prodCsp.includes("demotiles.maplibre.org"), `a demotiles hostnak NEM szabad szerepelnie: ${prodCsp}`);
  });

  it("middleware.ts forrása NEM hivatkozik többé a demotiles.maplibre.org-ra", async () => {
    const src = await readFile("middleware.ts", "utf-8");
    assert.ok(!src.includes("demotiles.maplibre.org"), "middleware.ts nem hivatkozhat a régi demotiles hostra");
  });

  it("VedettUtvonalMap.tsx nem használja AKTÍV style URL-ként a demotiles.maplibre.org-ot (a fájl fejlécében egy magyarázó, történeti megjegyzésben megengedett említés, hogy miért NEM ezt választottuk)", async () => {
    const src = await readFile("components/vedett-utvonal/VedettUtvonalMap.tsx", "utf-8");
    assert.ok(
      !src.includes('"https://demotiles.maplibre.org'),
      "VedettUtvonalMap.tsx nem tartalmazhat aktív demotiles URL string literált"
    );
    assert.ok(
      !src.includes("MAP_STYLE ="),
      "a régi, helyben hardcode-olt MAP_STYLE konstans nem térhet vissza — a style URL kizárólag mapStyle.ts-ből jöhet"
    );
  });
});

describe("CSP — nincs indokolatlan szélesítés (nincs wildcard, nincs img-src/font-src/worker-src módosítás)", () => {
  it("connect-src NEM tartalmaz wildcardot ('*' önálló tokenként, vagy 'https:' séma-szintű engedélyt)", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, MAP_STYLE_HOST, false);
    const connectSrc = directive(prodCsp, "connect-src");
    const tokens = connectSrc.replace("connect-src", "").trim().split(/\s+/);
    for (const token of tokens) {
      assert.notEqual(token, "*", `connect-src nem tartalmazhat önálló '*' wildcardot: ${connectSrc}`);
      assert.notEqual(token, "https:", `connect-src nem tartalmazhat séma-szintű 'https:' engedélyt: ${connectSrc}`);
    }
  });

  it("img-src VÁLTOZATLAN maradt ('self' data: blob: https:)", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, MAP_STYLE_HOST, false);
    assert.equal(directive(prodCsp, "img-src"), "img-src 'self' data: blob: https:");
  });

  it("font-src VÁLTOZATLAN maradt ('self' only) — a glyph .pbf fetch()-csel töltődik, nem böngésző @font-face-szel", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, MAP_STYLE_HOST, false);
    assert.equal(directive(prodCsp, "font-src"), "font-src 'self'");
  });

  it("nincs worker-src direktíva hozzáadva", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, MAP_STYLE_HOST, false);
    assert.ok(!prodCsp.includes("worker-src"), "worker-src nem szükséges és nem lett hozzáadva");
  });

  it("a script-src, style-src, frame-src, object-src, base-uri, form-action, frame-ancestors, upgrade-insecure-requests direktívák BIT-PONTOSAN változatlanok maradtak", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, MAP_STYLE_HOST, false);
    assert.equal(
      directive(prodCsp, "script-src"),
      `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic' https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://unpkg.com`
    );
    assert.equal(directive(prodCsp, "style-src"), "style-src 'self' 'unsafe-inline' https://unpkg.com");
    assert.equal(
      directive(prodCsp, "frame-src"),
      "frame-src https://www.google.com https://www.youtube.com https://www.youtube-nocookie.com"
    );
    assert.equal(directive(prodCsp, "object-src"), "object-src 'none'");
    assert.equal(directive(prodCsp, "base-uri"), "base-uri 'self'");
    assert.equal(directive(prodCsp, "form-action"), "form-action 'self'");
    assert.equal(directive(prodCsp, "frame-ancestors"), "frame-ancestors 'none'");
    assert.ok(prodCsp.includes("upgrade-insecure-requests"));
  });
});

describe("CSP — a route-service secret továbbra sem kerül kliensbe", () => {
  it("middleware.ts (a CSP forrása) nem hivatkozik a ROUTE_SERVICE_AUTH_TOKEN env változóra", async () => {
    const src = await readFile("middleware.ts", "utf-8");
    assert.doesNotMatch(src, /ROUTE_SERVICE_AUTH_TOKEN/);
  });

  it("VedettUtvonalMap.tsx és mapStyle.ts nem hivatkozik semmilyen *_SECRET/*_TOKEN env változóra", async () => {
    const mapSrc = await readFile("components/vedett-utvonal/VedettUtvonalMap.tsx", "utf-8");
    const styleSrc = await readFile("lib/vedett-route/mapStyle.ts", "utf-8");
    assert.doesNotMatch(mapSrc, /process\.env\.\w*(SECRET|TOKEN)/i);
    assert.doesNotMatch(styleSrc, /process\.env\.\w*(SECRET|TOKEN)/i);
  });
});

describe("CSP — middleware.ts forrás-audit: a connect-src bővítés dinamikusan, a MAP_STYLE_URL-ből származik", () => {
  it("middleware.ts importálja a MAP_STYLE_URL-t a mapStyle.ts-ből", async () => {
    const src = await readFile("middleware.ts", "utf-8");
    assert.ok(
      src.includes('import { MAP_STYLE_URL } from "./lib/vedett-route/mapStyle"'),
      "middleware.ts a MAP_STYLE_URL-t importálja, nem hardcode-olja a tile hosztot"
    );
  });

  it("middleware.ts connect-src sora a mapStyleHost változóból építkezik, nem hardcode-olt hoszttal", async () => {
    const src = await readFile("middleware.ts", "utf-8");
    const connectSrcLine = src.split("\n").find((l) => l.includes("connect-src 'self'"));
    assert.ok(connectSrcLine, "connect-src sor megtalálható middleware.ts-ben");
    assert.ok((connectSrcLine as string).includes("${mapStyleHost"), "connect-src a mapStyleHost változóból interpolál");
  });

  it("middleware.ts nem tartalmaz új img-src/font-src/worker-src bejegyzést az alaptérkép miatt", async () => {
    const src = await readFile("middleware.ts", "utf-8");
    const imgSrcLine = src.split("\n").find((l) => l.trim().startsWith("`img-src"));
    const fontSrcLine = src.split("\n").find((l) => l.trim().startsWith("`font-src"));
    assert.ok(imgSrcLine && !imgSrcLine.includes("openfreemap"), "img-src nem lett módosítva az alaptérkép miatt");
    assert.ok(fontSrcLine && !fontSrcLine.includes("openfreemap"), "font-src nem lett módosítva az alaptérkép miatt");
    const workerSrcDirectiveLine = src.split("\n").find((l) => l.trim().startsWith("`worker-src"));
    assert.ok(!workerSrcDirectiveLine, "nincs worker-src CSP direktíva bevezetve");
  });
});
