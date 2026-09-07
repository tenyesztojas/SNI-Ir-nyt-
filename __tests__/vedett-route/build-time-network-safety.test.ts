// Build-time hálózati side effect elleni regressziós védelem (2026-09-07,
// utólagos javítás a VPS → Staging Integration Gate sprinthez).
//
// OK: a 2026-09-07-i "npm run build" kimenetében megjelent egy BKK Alerts
// feed timeout hiba, holott a build maga PASS lett. A gyökérok:
// app/admin/vedett-utvonal/page.tsx egy async Server Component, ami
// getVedettRouteStatus()-t hívja (lásd lib/vedett-route/status.ts) —
// EZ VALÓS hálózati hívásokat indít (BKK GTFS-RT Alerts feed
// connection_test, route service /api/v1/health). "force-dynamic" export
// NÉLKÜL a Next.js "next build" a "Collecting page data" fázisban
// megpróbálja statikusan előre kirenderelni az oldalt, ami ténylegesen
// lefuttatja ezeket a hálózati hívásokat BUILD IDŐBEN — a hiba csak
// logolva lett, nem dobott build-failure-t, ezért könnyen észrevétlen
// maradhatott volna.
//
// EZ A TESZT STATIKUS, forráskód-szintű ellenőrzés (nincs élő Next.js
// build-folyamat ebben a tesztkörnyezetben): minden app/ alatti oldal-
// vagy layout-fájlt, ami ténylegesen hálózati hívást indító
// vedett-route modult importál (status.ts vagy providers/*), arra
// kényszerít, hogy explicit "export const dynamic = \"force-dynamic\""
// (vagy \"force-dynamic\" string) jelölést tartalmazzon — különben a
// build-time statikus renderelés újra becsempészhet egy hálózati hívást.
//
//   node --test __tests__/vedett-route/build-time-network-safety.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP_DIR = path.join(process.cwd(), "app");

// Azok a vedett-route import-ok, amik VALÓS hálózati hívást indíthatnak
// (BKK GTFS-RT feed, route service health check) — a tiszta típus-only
// vagy konstans-only modulok (pl. types.ts, config.ts) NEM szerepelnek
// itt, mert azok önmagukban nem hálóznak.
const NETWORK_TRIGGERING_IMPORTS = [
  "@/lib/vedett-route/status",
  "@/lib/vedett-route/providers/registry",
  "@/lib/vedett-route/providers/bkk",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
      out.push(full);
    }
  }
  return out;
}

function findPagesImportingNetworkTriggeringModules(): string[] {
  const files = walk(APP_DIR);
  const offenders: string[] = [];
  for (const file of files) {
    // Csak page/layout fájlokat nézünk — a route.ts (API) handlerek saját
    // maguk kezelik a dynamic viselkedést (POST handlerek eleve sosem
    // statikusak, a GET status route.ts pedig már explicit force-dynamic).
    const base = path.basename(file);
    if (base !== "page.tsx" && base !== "layout.tsx") continue;
    const src = fs.readFileSync(file, "utf-8");
    if (NETWORK_TRIGGERING_IMPORTS.some((imp) => src.includes(imp))) {
      offenders.push(file);
    }
  }
  return offenders;
}

test("legalább egy page/layout fájl ténylegesen importálja a hálózatot indító vedett-route modult (a teszt maga nem hamis-pozitív)", () => {
  const offenders = findPagesImportingNetworkTriggeringModules();
  assert.ok(offenders.length > 0, "nem található page/layout, ami status.ts-t vagy providert importál — ellenőrizd, hogy a teszt import-listája naprakész-e");
});

test("minden vedett-route hálózatot indító modult importáló page/layout explicit 'force-dynamic'-ot deklarál (build-time hívás elleni védelem)", () => {
  const offenders = findPagesImportingNetworkTriggeringModules();
  const missingDynamic: string[] = [];
  for (const file of offenders) {
    const src = fs.readFileSync(file, "utf-8");
    const hasForceDynamic = /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(src);
    if (!hasForceDynamic) missingDynamic.push(path.relative(process.cwd(), file));
  }
  assert.deepEqual(missingDynamic, [], `ezek a fájlok hálózatot indító modult importálnak, de nincs 'export const dynamic = "force-dynamic"' jelölésük: ${missingDynamic.join(", ")}`);
});

test("app/admin/vedett-utvonal/page.tsx konkrétan tartalmazza a force-dynamic jelölést", () => {
  const src = fs.readFileSync(path.join(APP_DIR, "admin", "vedett-utvonal", "page.tsx"), "utf-8");
  assert.match(src, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
});
