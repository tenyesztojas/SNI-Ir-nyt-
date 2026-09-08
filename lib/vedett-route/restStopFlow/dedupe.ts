// Sprint E.1 — determinisztikus pihenőpont-deduplikáció.
//
// CÉL (spec 13. pont): amikor több forrás (USER/VEDETT_SAROK/OSM)
// ugyanazt a fizikai helyet adja vissza (pl. egy VédettSarok hely, ami
// egyben egy OSM node is), a listában csak EGYSZER jelenjen meg. A
// preferencia sorrend explicit: VEDETT_SAROK > OSM ugyanarra a fizikai
// helyre (a VédettSarok adat gondozott/ellenőrzött, az OSM nyers).
// USER pontok SOSEM duplikálódnak más forrással (saját, privát rekord —
// lásd userProvider.ts), így USER pontokat nem vonjuk be az
// összehasonlításba, csak VEDETT_SAROK/OSM között.
//
// A "közel van és hasonló néven fut" heurisztika SZÁNDÉKOSAN konzervatív
// (spec 13. pont: "SOHA ne olvassz össze két különböző helyet") — csak
// akkor tekintünk két pontot ugyanannak, ha MINDKÉT feltétel teljesül:
// koordináta-közelség ÉS név-hasonlóság. Pusztán a közelség (pl. két
// külön pad ugyanabban a parkban) NEM elég ok az összevonásra.

import type { RestPoint } from "../../rest-points/types.ts";
import { haversineDistanceMeters } from "./ranking.ts";

// Ugyanazon fizikai hely heurisztikus küszöbe — szándékosan szűk (spec
// 13. pont: inkább maradjon két külön találat, mint hogy tévesen
// összevonjunk két különböző helyet).
const DEDUPE_DISTANCE_METERS = 30;

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Csak akkor "hasonló" a két név, ha az egyik a másiknak (normalizált,
// ékezet-független) prefixe/tartalmazza, vagy egyezik — soha nem
// "megközelítőleg hasonló" fuzzy-matching, ami tévesen összevonhatna két
// különböző nevű helyet.
function namesLikelySamePlace(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na.length === 0 || nb.length === 0) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function sourcePriority(point: RestPoint): number {
  // Alacsonyabb szám = magasabb prioritás, ugyanazon fizikai helyre.
  if (point.source === "VEDETT_SAROK") return 0;
  if (point.source === "OSM") return 1;
  return 2; // USER — elméletileg sosem kerül összevonásra, lásd fent.
}

// Determinisztikus dedupe: a bemeneti tömböt forrás-prioritás szerint
// rendezve dolgozza fel (VEDETT_SAROK előbb, mint OSM), és minden pontot
// összevet a MÁR MEGTARTOTT pontokkal — ha van köztük "ugyanaz a hely"
// egyezés, a jelenlegit eldobja (mert az már megtartott, magasabb
// prioritású forrásból van). USER pontok mindig megmaradnak, sosem
// vetjük össze őket mással.
export function dedupeRestPoints(points: RestPoint[]): RestPoint[] {
  const sorted = [...points].sort((a, b) => sourcePriority(a) - sourcePriority(b));
  const kept: RestPoint[] = [];

  for (const point of sorted) {
    if (point.source === "USER") {
      kept.push(point);
      continue;
    }

    const duplicateOfKept = kept.some((existing) => {
      if (existing.source === "USER") return false;
      const distance = haversineDistanceMeters(
        { lat: point.latitude, lon: point.longitude },
        { lat: existing.latitude, lon: existing.longitude }
      );
      if (distance > DEDUPE_DISTANCE_METERS) return false;
      return namesLikelySamePlace(point.name, existing.name);
    });

    if (!duplicateOfKept) kept.push(point);
  }

  // Az eredeti relatív sorrendet nem garantáljuk itt szándékosan — a
  // hívó (aggregator.ts) a ranking.ts modullal rendezi végül a listát.
  return kept;
}
