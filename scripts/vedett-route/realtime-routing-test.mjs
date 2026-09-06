#!/usr/bin/env node
/**
 * realtime-routing-test.mjs
 *
 * BKK Realtime integráció — 7., 8. és 9. pont.
 *
 * A MOTIS /api/v6/plan API-jának NINCS "realtime be/ki" kapcsolója, ezért a
 * statikus vs. realtime összehasonlítás EGYETLEN válaszon belül történik:
 * minden TRANSIT lábnál összevetjük a menetrend szerinti időt
 * (from.scheduledDeparture / to.scheduledArrival) a ténylegesen visszaadott
 * idővel (leg.startTime / leg.endTime), és megnézzük a leg.realTime /
 * leg.cancelled jelzőket.
 *
 * Legalább 5 valódi budapesti útvonalat lekérdez, és mindegyiknél
 * dokumentálja:
 *   - indulás, érkezés, időtartam, átszállások száma
 *   - van-e realtime-korrigált láb (leg.realTime === true)
 *   - ha igen: menetrendi vs. tényleges idő, késés percben, trip ID
 *   - van-e törölt/kihagyott láb (leg.cancelled === true)
 *
 * A script NEM állítja, hogy "működik a realtime", csak akkor, ha legalább
 * egy konkrét lábnál TÉNYLEGESEN eltér a menetrendi és a tényleges idő —
 * ez a "BKK REALTIME ROUTING VERIFIED" kritérium (18. pont).
 *
 * FUTTATÁS (MOTIS-nak futnia kell, rt: configgal, lásd
 * generate-motis-rt-config.mjs, és a MOTIS-t újra kell indítani utána):
 *   node scripts/vedett-route/realtime-routing-test.mjs
 */

import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const { geocodeAddress } = await import("../../lib/vedett-route/geocode.ts");
const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

// 5 valódi, forgalmas budapesti útvonal — olyan időpontban kérdezzük le
// (most + néhány perc), amikor reálisan van közeli indulás, tehát ha van
// realtime adat, az releváns lehet.
const ROUTES = [
  { id: 1, from: "Deak Ferenc ter, Budapest", to: "Astoria, Budapest" },
  { id: 2, from: "Ors vezer tere, Budapest", to: "Deak Ferenc ter, Budapest" },
  { id: 3, from: "Moricz Zsigmond korter, Budapest", to: "Nyugati palyaudvar, Budapest" },
  { id: 4, from: "Kalvin ter, Budapest", to: "Oktogon, Budapest" },
  { id: 5, from: "Szell Kalman ter, Budapest", to: "Blaha Lujza ter, Budapest" },
];

function fmt(iso) {
  if (!iso) return "N/A";
  try {
    return new Date(iso).toISOString().slice(11, 16);
  } catch {
    return iso;
  }
}

async function main() {
  console.log("\n=== BKK Realtime routing teszt (statikus vs. realtime, egy válaszon belül) ===\n");
  const now = new Date();
  const departAt = new Date(now.getTime() + 5 * 60000).toISOString();

  const report = [];
  let anyRealtimeLegFound = false;
  let anyGenuineDelayProven = false;
  let provenExample = null;

  for (const route of ROUTES) {
    const fromGeo = await geocodeAddress(route.from);
    const toGeo = await geocodeAddress(route.to);
    if (!fromGeo || !toGeo) {
      report.push({ route, error: "Geokódolás sikertelen" });
      console.log(`[${route.id}] ${route.from} -> ${route.to}: GEOKÓDOLÁS SIKERTELEN, kihagyva.`);
      continue;
    }

    const planResult = await fetchMotisPlan({
      fromPlace: `${fromGeo.lat},${fromGeo.lon}`,
      toPlace: `${toGeo.lat},${toGeo.lon}`,
      time: departAt,
      numItineraries: 3,
    });

    if (!planResult.ok) {
      report.push({ route, error: `MOTIS hiba: ${planResult.message}` });
      console.log(`[${route.id}] ${route.from} -> ${route.to}: MOTIS HIBA — ${planResult.message}`);
      continue;
    }

    const itineraries = [...(planResult.data.itineraries ?? []), ...(planResult.data.direct ?? [])];
    console.log(`\n[${route.id}] ${route.from} -> ${route.to} (${itineraries.length} itinerary)`);

    for (const [idx, it] of itineraries.entries()) {
      for (const leg of it.legs ?? []) {
        if (leg.mode === "WALK") continue;
        const hasRt = Boolean(leg.realTime);
        const scheduledDep = leg.from?.scheduledDeparture;
        const scheduledArr = leg.to?.scheduledArrival;
        const actualDep = leg.startTime;
        const actualArr = leg.endTime;

        if (hasRt) anyRealtimeLegFound = true;

        const depDiffMin =
          scheduledDep && actualDep
            ? Math.round((new Date(actualDep).getTime() - new Date(scheduledDep).getTime()) / 60000)
            : null;
        const arrDiffMin =
          scheduledArr && actualArr
            ? Math.round((new Date(actualArr).getTime() - new Date(scheduledArr).getTime()) / 60000)
            : null;

        const genuineDelay = hasRt && ((depDiffMin !== null && depDiffMin !== 0) || (arrDiffMin !== null && arrDiffMin !== 0));

        if (leg.cancelled || hasRt || genuineDelay) {
          console.log(
            `  itinerary #${idx + 1}, ${leg.mode} ${leg.routeShortName ?? ""}: ` +
              `realTime=${hasRt} cancelled=${Boolean(leg.cancelled)} ` +
              `tripId=${leg.tripId ?? "N/A"}`
          );
          console.log(
            `    Menetrend szerint: indul ${fmt(scheduledDep)} / érkezik ${fmt(scheduledArr)}\n` +
              `    Tényleges (MOTIS): indul ${fmt(actualDep)} / érkezik ${fmt(actualArr)}`
          );
          if (depDiffMin !== null) console.log(`    Indulási eltérés: ${depDiffMin} perc`);
          if (arrDiffMin !== null) console.log(`    Érkezési eltérés: ${arrDiffMin} perc`);
        }

        if (genuineDelay && !provenExample) {
          anyGenuineDelayProven = true;
          provenExample = {
            route: `${route.from} -> ${route.to}`,
            tripId: leg.tripId,
            routeShortName: leg.routeShortName,
            scheduledDeparture: scheduledDep,
            scheduledArrival: scheduledArr,
            actualDeparture: actualDep,
            actualArrival: actualArr,
            depDiffMin,
            arrDiffMin,
            cancelled: Boolean(leg.cancelled),
          };
        }
      }
    }

    report.push({
      route,
      itineraryCount: itineraries.length,
      legsWithRealtime: itineraries.reduce(
        (sum, it) => sum + (it.legs ?? []).filter((l) => l.realTime).length,
        0
      ),
    });
  }

  console.log("\n=== ÖSSZESÍTÉS ===");
  console.log(`Realtime-jelzésű láb található valamelyik útvonalon: ${anyRealtimeLegFound ? "IGEN" : "NEM"}`);
  console.log(
    `Legalább egy VALÓDI, bizonyított eltérés (menetrend != tényleges idő) egy realtime lábon: ${
      anyGenuineDelayProven ? "IGEN" : "NEM"
    }`
  );
  if (provenExample) {
    console.log("\nKonkrét bizonyított példa:");
    console.log(JSON.stringify(provenExample, null, 2));
  } else {
    console.log(
      "\nNincs konkrét bizonyított példa ebben a futásban. Ez NEM feltétlenül hiba — előfordulhat, hogy " +
        "a lekérdezés pillanatában egyik tesztelt útvonalon sem volt aktív, eltérést okozó realtime esemény " +
        "(pl. minden busz pontosan időben közlekedett). Futtasd újra csúcsidőben, vagy ismert késéssel érintett " +
        "vonalon, mielőtt FAIL-nek tekinted."
    );
  }

  console.log(
    `\nBKK REALTIME ROUTING TESZT (ebben a futásban): ${anyGenuineDelayProven ? "PROVEN" : "NOT PROVEN THIS RUN"}\n`
  );

  const outDir = path.join(process.cwd(), "motis-data", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "realtime-routing-test-result.json"),
    JSON.stringify({ ranAt: new Date().toISOString(), anyRealtimeLegFound, anyGenuineDelayProven, provenExample, report }, null, 2)
  );
  console.log(`Részletes JSON: motis-data/reports/realtime-routing-test-result.json`);
}

main();
