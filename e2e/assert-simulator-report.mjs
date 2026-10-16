// iOS-szimulátoros elrendezési riport GÉPI ellenőrzése (CI-ben ez dönt,
// nem a képernyőkép és nem a workflow zöld állapota).
//
// Használat:
//   node e2e/assert-simulator-report.mjs <riport-könyvtár> <portrait|landscape> [eszköznév]
// Kilépési kód: 0 = minden feltétel teljesül; 1 = hiba (a részletek a kimeneten).

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function evaluateReport(report, { orientation }) {
  const failures = [];
  if (!report || typeof report !== "object") return ["nincs riport"];
  if (report.schema !== 1) failures.push(`ismeretlen riport-séma: ${report.schema}`);
  if (report.native?.platformIos !== true) failures.push("nem natív iOS platformon futott");
  if (report.native?.ok !== true) failures.push("a getSafeAreaInsets natív hívás nem sikerült");
  const raw = report.native?.raw;
  const edges = ["top", "right", "bottom", "left"];
  if (!raw || !edges.every((k) => Number.isFinite(raw?.safe?.[k]) && Number.isFinite(raw?.adjusted?.[k])))
    failures.push("a natív safe-area válasz hiányos (safe/adjusted)");
  if (report.layout !== "ios-v2") failures.push(`az elrendezés nem ios-v2 (${report.layout})`);
  if (report.viewport?.orientation !== orientation) failures.push(`tájolás: várt ${orientation}, kapott ${report.viewport?.orientation}`);
  if (!(report.viewport?.scrollWidth <= report.viewport?.innerWidth)) failures.push("vízszintes túllógás");
  for (const k of ["topBar", "instruction", "eta", "bottomBar"]) if (!report.rects?.[k]) failures.push(`hiányzó elem: ${k}`);
  for (const k of ["restNeed", "restAdd"]) if (!report.restButtons?.[k]) failures.push(`hiányzó pihenőpont-gomb: ${k}`);
  if (!Array.isArray(report.mapControls) || report.mapControls.length === 0) failures.push("hiányzó térképvezérlők");
  if (!Array.isArray(report.problems)) failures.push("hiányzó problems lista");
  else for (const p of report.problems) failures.push(`mérés: ${p}`);
  if (report.ok !== true) failures.push("a riport ok mezője nem true (ELRENDEZÉS OK hiányzik)");
  if (orientation === "portrait" && report.restFlowOk !== true) failures.push("a pihenőpont-gomb nem nyitotta meg a panelt");
  if (Array.isArray(report.nativeCalls) && report.nativeCalls.some((c) => c.method === "start" && c.outcome !== "suppressed"))
    failures.push("a natív navigációs start nem lett elkülönítve (értesítési engedélykérés)");
  return [...new Set(failures)];
}

export function pickReport(dir, orientation) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const reports = files.map((f) => ({ file: f, data: JSON.parse(readFileSync(path.join(dir, f), "utf8")) }));
  const matching = reports.filter((r) => r.data?.viewport?.orientation === orientation);
  return (matching.at(-1) ?? reports.at(-1)) ?? null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, orientation, device = ""] = process.argv.slice(2);
  if (!dir || !["portrait", "landscape"].includes(orientation)) {
    console.error("Használat: node e2e/assert-simulator-report.mjs <dir> <portrait|landscape> [eszköz]");
    process.exit(2);
  }
  let picked = null;
  try {
    picked = pickReport(dir, orientation);
  } catch (e) {
    console.error(`Riport nem olvasható: ${e}`);
  }
  const failures = picked ? evaluateReport(picked.data, { orientation }) : ["nem érkezett riport"];
  const v = picked?.data?.viewport;
  console.log(`[${device}] ${orientation} — ${picked?.file ?? "nincs riport"} — ${v ? `${v.innerWidth}×${v.innerHeight}` : ""} layout=${picked?.data?.layout} native=${picked?.data?.native?.ok}`);
  if (picked?.data?.native?.raw) console.log(`  natív safe-area: ${JSON.stringify(picked.data.native.raw)}`);
  if (failures.length) {
    console.log(`  HIBA:\n   - ${failures.join("\n   - ")}`);
    process.exit(1);
  }
  console.log("  ELRENDEZÉS OK (gépi ellenőrzés)");
}
