// Rangsorolás + determinisztikus (NEM LLM-alapú) trade-off magyarázatok —
// Sprint 2, 17-18. pont.
//
// A CALMEST/FASTEST/FEWEST_TRANSFERS címkéket egyszerű, reprodukálható
// összehasonlítások adják a candidate journey-k (már dedupolt, sensory
// score-ral ellátott) halmazán. Egy adott journey több címkét is kaphat,
// ha egyszerre a leggyorsabb ÉS a legkevesebb átszállásos is például.

import type { Journey, RankedJourney, RankingLabel } from "./types.ts";

function pickFastest(journeys: Journey[]): Journey {
  return journeys.reduce((best, j) => (j.totalDurationMinutes < best.totalDurationMinutes ? j : best));
}

function pickFewestTransfers(journeys: Journey[]): Journey {
  return journeys.reduce((best, j) => {
    if (j.transfers < best.transfers) return j;
    if (j.transfers === best.transfers && j.totalDurationMinutes < best.totalDurationMinutes) return j;
    return best;
  });
}

function pickCalmest(journeys: Journey[]): Journey {
  return journeys.reduce((best, j) => {
    const jScore = j.sensory?.score ?? Number.POSITIVE_INFINITY;
    const bestScore = best.sensory?.score ?? Number.POSITIVE_INFINITY;
    if (jScore < bestScore) return j;
    if (jScore === bestScore && j.totalDurationMinutes < best.totalDurationMinutes) return j;
    return best;
  });
}

function explain(journey: Journey, labels: RankingLabel[], fastest: Journey, calmest: Journey, fewestTransfers: Journey): string {
  const parts: string[] = [];

  if (labels.includes("FASTEST") && labels.includes("CALMEST") && labels.includes("FEWEST_TRANSFERS")) {
    return "Ez az útvonal egyszerre a leggyorsabb, a legnyugodtabb és a legkevesebb átszállással jár a felkínált lehetőségek közül.";
  }

  if (labels.includes("FASTEST")) {
    parts.push("Ez a leggyorsabb felkínált útvonal.");
  } else {
    const delta = Math.round(journey.totalDurationMinutes - fastest.totalDurationMinutes);
    if (delta > 0) parts.push(`${delta} perccel hosszabb, mint a leggyorsabb lehetőség.`);
  }

  if (labels.includes("FEWEST_TRANSFERS")) {
    parts.push(journey.transfers === 0 ? "Nincs benne átszállás." : "Ez jár a legkevesebb átszállással.");
  } else {
    const delta = journey.transfers - fewestTransfers.transfers;
    if (delta > 0) parts.push(`${delta} átszállással többel jár, mint a legkevesebb átszállásos lehetőség.`);
  }

  if (labels.includes("CALMEST")) {
    parts.push("A rendelkezésre álló adatok alapján ez a legkevésbé megterhelő szenzoros szempontból.");
  } else if (journey.sensory && calmest.sensory) {
    const delta = Math.round(journey.sensory.score - calmest.sensory.score);
    if (delta > 5) parts.push("A rendelkezésre álló adatok alapján valamivel megterhelőbb, mint a legnyugodtabb lehetőség.");
  }

  if (
    journey.walkingDistanceMeters !== undefined &&
    fastest.walkingDistanceMeters !== undefined &&
    journey !== fastest
  ) {
    const deltaMeters = Math.round(journey.walkingDistanceMeters - fastest.walkingDistanceMeters);
    if (Math.abs(deltaMeters) >= 50) {
      parts.push(
        deltaMeters < 0
          ? `${Math.abs(deltaMeters)} méterrel kevesebb gyaloglást tartalmaz, mint a leggyorsabb lehetőség.`
          : `${deltaMeters} méterrel több gyaloglást tartalmaz, mint a leggyorsabb lehetőség.`
      );
    }
  }

  const undergroundLegs = journey.legs.filter((l) => l.mode === "TRANSIT" && l.transitMode === "SUBWAY").length;
  if (undergroundLegs === 0 && journey.transfers > 0) {
    parts.push("Nincs benne földalatti (metró) szakasz.");
  } else if (undergroundLegs > 0) {
    parts.push(`${undergroundLegs} földalatti (metró) szakaszt tartalmaz.`);
  }

  if (journey.sensory && journey.sensory.confidence < 0.7) {
    parts.push(
      `Az adatlefedettség jelenleg ${Math.round(journey.sensory.confidence * 100)}% — néhány szenzoros tényezőhöz (pl. jármű-foglaltság) most nincs valós adatforrás, ezért ezek nem számítanak bele az értékelésbe.`
    );
  }

  return parts.join(" ");
}

// Megjelenitesi sorrend a felhasznalo explicit dontese alapjan:
// Legnyugodtabb (CALMEST) -> Leggyorsabb (FASTEST) -> Legkevesebb atszallas
// (FEWEST_TRANSFERS) -> minden egyeb (cimkezetlen) alternativa a vegen,
// az eredeti (dedup utani) sorrendjeben.
function labelSortPriority(labels: RankingLabel[]): number {
  if (labels.includes("CALMEST")) return 0;
  if (labels.includes("FASTEST")) return 1;
  if (labels.includes("FEWEST_TRANSFERS")) return 2;
  return 3;
}

export function rankJourneys(journeys: Journey[]): RankedJourney[] {
  if (journeys.length === 0) return [];

  const fastest = pickFastest(journeys);
  const fewestTransfers = pickFewestTransfers(journeys);
  const calmest = pickCalmest(journeys);

  const ranked = journeys.map((journey) => {
    const labels: RankingLabel[] = [];
    if (journey === fastest) labels.push("FASTEST");
    if (journey === fewestTransfers) labels.push("FEWEST_TRANSFERS");
    if (journey === calmest) labels.push("CALMEST");

    return {
      journey,
      labels,
      explanation: explain(journey, labels, fastest, calmest, fewestTransfers),
    };
  });

  // Array.prototype.sort a modern motorokon (V8 is) stabil, tehat az azonos
  // prioritasu elemek megtartjak eredeti (dedup utani) sorrendjuket.
  return ranked
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const priorityDelta = labelSortPriority(a.entry.labels) - labelSortPriority(b.entry.labels);
      if (priorityDelta !== 0) return priorityDelta;
      return a.index - b.index;
    })
    .map(({ entry }) => entry);
}
