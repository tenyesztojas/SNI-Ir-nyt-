// NAVIGATION — NEXT-INSTRUCTION PREVIEW (Sprint 6, 2026-09-16).
//
// Pure, determinisztikus, React-független modul: a MEGLÉVŐ
// NavigationInstruction listából (lib/vedett-route/navigation/
// instructions.ts buildNavigationInstructions()) és az AKTUÁLIS instrukcióból
// levezet EGY rövid "Utána: ..." preview-szöveget, hogy a felhasználó előre
// tudja, mi a következő ÉRDEMI teendő. NINCS React/UI import, NINCS browser
// API, NINCS saját state — a preview MINDIG a hívó által átadott, MÁR
// MEGLÉVŐ adatokból (instructions, current, aktív WALK manoeuvre) számolódik.
//
// AUDIT-ÖSSZEFOGLALÓ (a sprint elején elvégzett olvasás eredménye):
//   - A "current" instrukciót selectActiveInstructionWithStopProgress()
//     (instructions.ts) választja ki, matchedSegmentIndex/legPhaseFraction/
//     atRouteEnd + (RIDE esetén) a Sprint 3 stop-progress alapján. Ugyanez a
//     függvény MÁR VISSZAAD egy `next` mezőt is — ez a buildNavigationInstructions()
//     ÁLTAL FELÉPÍTETT, FLAT, LEG-SORREND SZERINTI tömb POZÍCIONÁLIS
//     rákövetkező eleme (instructions[currentIndex + 1]).
//   - EZ a pozícionális "next" a TÖBBSÉGBEN már helyes preview-t adna
//     (pl. WALK leg egyetlen instrukciója után a KÖVETKEZŐ leg első
//     instrukciója jön — pontosan a WALK->TRANSIT/RENTAL/ARRIVE eset), DE
//     KÉT ESETBEN NEM ELÉG:
//       1) egy AKTÍV WALK legen belül a felhasználót nem a leg VÉGE, hanem a
//          KÖVETKEZŐ KANYAR érdekli — ez a Sprint 4/5 walkManoeuvre.ts/
//          walkManoeuvreProgress.ts modellje, ami TELJESEN KÍVÜL esik a
//          NavigationInstruction tömbön (más index-tér, lásd
//          walkManoeuvreProgress.ts fejléce) — ezt ÖNMAGÁBAN a pozícionális
//          "next" SOHA nem tudja megadni;
//       2) BOARD/TRANSFER -> RIDE (ugyanazon a legen) és BIKE_PICKUP ->
//          BIKE_RIDE triviális, önmagától értetődő folytatás — a preview
//          ilyenkor NEM ezt, hanem az UTÁNA következő, valóban új
//          információt hordozó lépést (ALIGHT/TRANSFER/BIKE_DROPOFF/a
//          következő leg első lépése) kell megadja (lásd sprint
//          specifikáció 8. pontja).
//   - A Journey ARRIVE (buildNavigationInstructions() `id: "arrive"`,
//     KIZÁRÓLAG a legs tömb VÉGÉN, EGYETLEN egyszer) és a WALK manoeuvre
//     ARRIVE (walkManoeuvre.ts — a leg SAJÁT geometriai végpontja, minden
//     WALK legen külön előfordul) KÉT KÜLÖNBÖZŐ típus/névtér — SOHA nem
//     kerülnek össze: a WALK-lokális kanyar-preview kizárólag
//     TURN_LEFT/TURN_RIGHT esetén aktiválódik (lásd lent), minden más esetben
//     (a WALK manoeuvre ARRIVE-jét is beleértve) a pozícionális NavigationInstruction
//     ágra esik vissza — ott az "ARRIVE" MINDIG a teljes Journey végét jelenti.
//   - BOARD/RIDE/ALIGHT/TRANSFER/BIKE_* sorrendjét/szövegét ez a modul NEM
//     módosítja — csak OLVASSA a meglévő instructions tömböt.
//   - Legkisebb regressziós kockázat: a preview KIZÁRÓLAG egy ÚJ,
//     olvasás-only mezőt ad a komponensnek (nincs módosítás a meglévő
//     selectActiveInstructionWithStopProgress/routeProgress/walkManoeuvre*
//     kódban).

import type { NavigationInstruction, NavigationInstructionKind } from "./instructions.ts";
import type { WalkManoeuvre } from "./walkManoeuvre.ts";

export interface InstructionPreviewResult {
  // A NYERS preview-szöveg, "Utána: " előtag NÉLKÜL (a hívó UI dönt a
  // pontos vizuális elrendezésről/előtagról — lásd sprint specifikáció 13.
  // pontja: "ne készíts új panelt", a MEGLÉVŐ kártyába illeszkedjen).
  phrase: string;
}

// Ugyanazon a legen belüli, ÖNMAGÁTÓL ÉRTETŐDŐ, ezért a previewból
// szándékosan KIHAGYOTT átmenetek (sprint specifikáció 8. pontja: "kerüld,
// ha ez UX szempontból triviális"). Csak EGY hop-ot ugrunk át — ennyi
// elegendő a jelenlegi domain modellhez (BOARD/TRANSFER mindig pontosan egy
// RIDE-ot előz meg, BIKE_PICKUP mindig pontosan egy BIKE_RIDE-ot).
const TRIVIAL_SAME_LEG_CONTINUATION: ReadonlyArray<{ from: NavigationInstructionKind; to: NavigationInstructionKind }> = [
  { from: "BOARD", to: "RIDE" },
  { from: "TRANSFER", to: "RIDE" },
  { from: "BIKE_PICKUP", to: "BIKE_RIDE" },
];

function isTrivialContinuation(current: NavigationInstruction, next: NavigationInstruction): boolean {
  if (current.legIndex !== next.legIndex) return false;
  return TRIVIAL_SAME_LEG_CONTINUATION.some((pair) => pair.from === current.kind && pair.to === next.kind);
}

// A `current`-et az `id` mezője alapján keressük meg az `instructions`
// tömbben — NEM referencia-egyezéssel —, mert a hívó (VedettUtvonalSearchForm.tsx)
// a RIDE stop-progress overrideot (selectActiveInstructionWithStopProgress)
// és a Sprint 5 WALK-progress overrideot IS egy ÚJ, spread-elt objektumként
// adja át (más title-lel, de UGYANAZZAL az id/kind/legIndex mezővel) — az
// `id` az EGYETLEN mező, ami ezeken az overridokon mindig stabil marad.
function findIndexById(instructions: readonly NavigationInstruction[], id: string): number {
  return instructions.findIndex((instruction) => instruction.id === id);
}

// Pure helper: a `current` UTÁNI, tényleg ÉRDEMI NavigationInstruction — a
// pozícionális rákövetkezőt adja, KIVÉVE ha az egy triviális folytatás
// (lásd fent), ilyenkor egyet tovább lép. Null, ha nincs current az
// instructions tömbben, vagy nincs több elem utána (pl. a Journey ARRIVE
// után).
function resolveStructuralPreviewInstruction(
  instructions: readonly NavigationInstruction[],
  current: NavigationInstruction,
): NavigationInstruction | null {
  const currentIndex = findIndexById(instructions, current.id);
  if (currentIndex === -1) return null;
  const immediateNext = instructions[currentIndex + 1] ?? null;
  if (!immediateNext) return null;
  if (isTrivialContinuation(current, immediateNext)) {
    return instructions[currentIndex + 2] ?? null;
  }
  return immediateNext;
}

// Egy NavigationInstruction TITLE-jéből rövid, kisbetűs preview-mondatot
// épít ("Szállj le: Astoria" -> "szállj le – Astoria"). Az ARRIVE kivétel:
// a "Megérkeztél" (múlt idő, a JELENLEGI instrukcióhoz illő) helyett a
// preview jövő idejű "megérkezel"-t használ (sprint specifikáció 9. pontja
// pontos szövege) — ez egy FIX, mindig helyes szöveg, mert a
// NavigationInstruction ARRIVE mindig EGYETLEN, a Journey teljes végét jelző
// esemény (lásd a modul fejlécének audit-összefoglalója).
//
// ISMERT EGYSZERŰSÍTÉS: a generikus " – " átalakítás NEM végez magyar
// nyelvtani ragozást (pl. "a 47-es villamosra") — ehhez ki kellene találni
// a célpont nevének helyes esetragját, amit a modul SZÁNDÉKOSAN nem tesz
// meg (nincs kitalált/becsült szöveg).
function toPreviewPhrase(instruction: NavigationInstruction): string {
  if (instruction.kind === "ARRIVE") return "megérkezel";
  const title = instruction.title;
  const lowered = title.length > 0 ? title.charAt(0).toLowerCase() + title.slice(1) : title;
  return lowered.includes(": ") ? lowered.replace(": ", " – ") : lowered;
}

function turnPreviewPhrase(kind: "TURN_LEFT" | "TURN_RIGHT"): string {
  return kind === "TURN_RIGHT" ? "fordulj jobbra" : "fordulj balra";
}

// Pure fő függvény.
//
// `walkNextManoeuvre`: a Sprint 5 resolveWalkProgress() eredményének
// `nextManoeuvre` mezője (vagy null) — KIZÁRÓLAG akkor vesszük figyelembe,
// ha `current.kind === "WALK"` ÉS a kind TURN_LEFT/TURN_RIGHT. A START
// SOHA nem jelenik meg previewként (resolveWalkProgress() `actionable`
// listája már kizárja a STARTot — lásd walkManoeuvreProgress.ts), és egy
// WALK manoeuvre ARRIVE (nincs több kanyar a legen) NEM kap itt szöveget —
// ilyenkor a függvény a pozícionális NavigationInstruction ágra esik,
// amely helyesen a leg UTÁNI valódi Journey-teendőt (vagy a Journey
// ARRIVE-ot) adja.
//
// Biztonságos null minden más esetben: hiányzó current, nincs instructions
// tömbben, vagy nincs több érdemi lépés (pl. a Journey ARRIVE után).
export function resolveInstructionPreview(
  instructions: readonly NavigationInstruction[],
  current: NavigationInstruction | null,
  walkNextManoeuvre: Pick<WalkManoeuvre, "kind"> | null,
): InstructionPreviewResult | null {
  if (!current) return null;

  if (current.kind === "WALK" && walkNextManoeuvre && (walkNextManoeuvre.kind === "TURN_LEFT" || walkNextManoeuvre.kind === "TURN_RIGHT")) {
    return { phrase: turnPreviewPhrase(walkNextManoeuvre.kind) };
  }

  const structuralNext = resolveStructuralPreviewInstruction(instructions, current);
  if (!structuralNext) return null;
  return { phrase: toPreviewPhrase(structuralNext) };
}
