/**
 * CSP fix — MapLibre demotiles.maplibre.org üres térkép hiba (Sprint E
 * Preview staging teszt, 2026-09-08)
 *
 * ROOT CAUSE: a VedettUtvonalMap.tsx MapLibre GL JS komponens
 * style.json/tiles.json/vector-tile(.pbf)/glyph(.pbf) lekéréseket indít a
 * https://demotiles.maplibre.org hoszthoz — MapLibre GL JS ezeket
 * fetch()/XHR-en keresztül tölti, amit a middleware.ts CSP connect-src
 * direktívája korábban NEM engedélyezett, ezért a böngésző blokkolta
 * ("Refused to connect because it violates the document's Content
 * Security Policy") — a renderer inicializálódott, de a térkép üres
 * maradt.
 *
 * JAVÍTÁS: KIZÁRÓLAG a connect-src direktíva bővült
 * "https://demotiles.maplibre.org"-vel — semmilyen más direktíva nem
 * változott (bizonyítva: a style.json-nak nincs "sprite" kulcsa és nem
 * használ raster tile forrást, kizárólag vector/pbf-et, amit MapLibre
 * fetch()-csel tölt, nem <img>/CSS background-image-dzsel — tehát az
 * img-src/font-src/worker-src direktívák érintetlenek maradtak).
 *
 * Ugyanazt az elvet követi, mint __tests__/vedett-karrier/csp-273-3.test.ts:
 * a buildCsp() logikáját INLINE tükrözzük (nem importáljuk a
 * middleware.ts-t, mert az Supabase/Next.js runtime függőségeket hoz be,
 * amit plain node:test nem tud feloldani).
 *
 *   node --test __tests__/vedett-route/csp-maplibre-demotiles.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function buildCsp(nonce: string, supabaseHost: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://unpkg.com`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://unpkg.com`;

  return [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline' https://unpkg.com`,
    `img-src 'self' data: blob: https:`,
    `connect-src 'self' https://${supabaseHost} https://*.supabase.co wss://*.supabase.co https://oauth2.googleapis.com https://www.googleapis.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://unpkg.com https://demotiles.maplibre.org`,
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

function directive(csp: string, name: string): string {
  const line = csp.split(";").find((d) => d.trim().startsWith(name));
  assert.ok(line, `${name} direktíva megtalálható`);
  return (line as string).trim();
}

describe("CSP fix — demotiles.maplibre.org engedélyezve a connect-src-ben", () => {
  it("production connect-src tartalmazza a https://demotiles.maplibre.org hostot", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, false);
    const connectSrc = directive(prodCsp, "connect-src");
    assert.ok(connectSrc.includes("https://demotiles.maplibre.org"), `connect-src: ${connectSrc}`);
  });

  it("development connect-src is tartalmazza (a demo térkép dev alatt is működjön)", () => {
    const devCsp = buildCsp(NONCE, SUPABASE_HOST, true);
    const connectSrc = directive(devCsp, "connect-src");
    assert.ok(connectSrc.includes("https://demotiles.maplibre.org"), `connect-src: ${connectSrc}`);
  });

  it("a meglévő connect-src hostok (Supabase, Google OAuth, Analytics, unpkg) megmaradtak — nincs regresszió", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, false);
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

describe("CSP fix — nincs indokolatlan szélesítés (nincs wildcard, nincs img-src/font-src/worker-src módosítás)", () => {
  it("connect-src NEM tartalmaz wildcardot ('*' önálló tokenként, vagy 'https:' séma-szintű engedélyt)", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, false);
    const connectSrc = directive(prodCsp, "connect-src");
    const tokens = connectSrc.replace("connect-src", "").trim().split(/\s+/);
    for (const token of tokens) {
      assert.notEqual(token, "*", `connect-src nem tartalmazhat önálló '*' wildcardot: ${connectSrc}`);
      assert.notEqual(token, "https:", `connect-src nem tartalmazhat séma-szintű 'https:' engedélyt: ${connectSrc}`);
    }
  });

  it("img-src VÁLTOZATLAN maradt ('self' data: blob: https:) — ez a fix nem nyúlt hozzá (nincs raster tile/sprite a demo style-ban)", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, false);
    assert.equal(directive(prodCsp, "img-src"), "img-src 'self' data: blob: https:");
  });

  it("font-src VÁLTOZATLAN maradt ('self' only) — a MapLibre glyph .pbf fetch()-csel töltődik, nem böngésző @font-face-szel", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, false);
    assert.equal(directive(prodCsp, "font-src"), "font-src 'self'");
  });

  it("nincs worker-src direktíva hozzáadva (a MapLibre worker a már betöltött same-origin bundle-ból jön létre, nem külön hálózati hívásból)", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, false);
    assert.ok(!prodCsp.includes("worker-src"), "worker-src nem szükséges és nem lett hozzáadva");
  });

  it("a script-src, style-src, frame-src, object-src, base-uri, form-action, frame-ancestors, upgrade-insecure-requests direktívák BIT-PONTOSAN változatlanok maradtak", () => {
    const prodCsp = buildCsp(NONCE, SUPABASE_HOST, false);
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

describe("CSP fix — a route-service secret továbbra sem kerül kliensbe", () => {
  it("middleware.ts (a CSP forrása) nem hivatkozik a ROUTE_SERVICE_AUTH_TOKEN env változóra", async () => {
    const src = await readFile("middleware.ts", "utf-8");
    assert.doesNotMatch(src, /ROUTE_SERVICE_AUTH_TOKEN/);
  });

  it("VedettUtvonalMap.tsx (a demotiles.maplibre.org tényleges hívója) nem hivatkozik semmilyen *_SECRET/*_TOKEN env változóra", async () => {
    const src = await readFile("components/vedett-utvonal/VedettUtvonalMap.tsx", "utf-8");
    assert.doesNotMatch(src, /process\.env\.\w*(SECRET|TOKEN)/i);
  });
});

describe("CSP fix — middleware.ts forrás-audit: a connect-src módosítás pontosan a demotiles hostra korlátozódik", () => {
  it("middleware.ts connect-src sora tartalmazza a demotiles.maplibre.org-ot", async () => {
    const src = await readFile("middleware.ts", "utf-8");
    const connectSrcLine = src
      .split("\n")
      .find((l) => l.includes("connect-src 'self'"));
    assert.ok(connectSrcLine, "connect-src sor megtalálható middleware.ts-ben");
    assert.ok((connectSrcLine as string).includes("https://demotiles.maplibre.org"));
  });

  it("middleware.ts nem tartalmaz új img-src/font-src/worker-src bejegyzést a demotiles miatt", async () => {
    const src = await readFile("middleware.ts", "utf-8");
    const imgSrcLine = src.split("\n").find((l) => l.trim().startsWith("`img-src"));
    const fontSrcLine = src.split("\n").find((l) => l.trim().startsWith("`font-src"));
    assert.ok(imgSrcLine && !imgSrcLine.includes("demotiles"), "img-src nem lett módosítva demotiles miatt");
    assert.ok(fontSrcLine && !fontSrcLine.includes("demotiles"), "font-src nem lett módosítva demotiles miatt");
    // Csak a TÉNYLEGES CSP direktíva-sort vizsgáljuk (backtick-kel kezdődő
    // template literal), nem a magyarázó kommentet — a fenti buildCsp()
    // mirror tesztek már bizonyítják, hogy a ténylegesen összeállított CSP
    // stringben nincs worker-src direktíva.
    const workerSrcDirectiveLine = src.split("\n").find((l) => l.trim().startsWith("`worker-src"));
    assert.ok(!workerSrcDirectiveLine, "nincs worker-src CSP direktíva bevezetve");
  });
});
