// NAVIGATION — ACTIVE-LEG REALTIME INFO (Sprint 7, 2026-09-16).
//
// Pure, determinisztikus, React-független modul. NEM Sensory Data V2 — ez
// KIZÁRÓLAG a MÁR MEGLÉVŐ, valódi realtime/menetrendi mezők (JourneyLeg.
// realtime/delayMinutes/cancelled, lib/vedett-route/orchestrator.ts mapLeg())
// navigációs megjelenítése, egy már meglévő domain-tényre épülve — nincs új
// adatforrás, nincs becslés.
//
// AUDIT-ÖSSZEFOGLALÓ (a sprint elején elvégzett olvasás eredménye):
//   - `leg.realtime` = `Boolean(leg.realTime)` — a NYERS MOTIS leg.realTime
//     mezőből (orchestrator.ts mapLeg():117). A MOTIS-nak nincs külön
//     "realtime be/ki" kapcsolója — ez azt jelzi, hogy EHHEZ a konkrét
//     leghez a MOTIS válasz realtime-korrigált adatot adott.
//   - `leg.delayMinutes` = `computeDelayMinutes(leg)` (orchestrator.ts:57-66)
//     — KIZÁRÓLAG akkor kap SZÁM értéket, ha (a) `leg.realTime === true` ÉS
//     (b) volt mind scheduled* (to.scheduledArrival ?? from.scheduledDeparture),
//     MIND tényleges (endTime ?? startTime) időpont. Minden más esetben
//     `undefined` marad — SOHA nem 0 alapérték/becslés. Tehát
//     `delayMinutes` NEM létezhet `realtime === false` mellett (a függvény
//     ELSŐ sora `if (!leg.realTime) return undefined;`) — az "if
//     (!activeLeg.realtime) return null" gate emiatt BIZONYÍTOTTAN helyes:
//     `realtime===false` esetén `delayMinutes` mindig undefined is lenne,
//     a gate redundáns-biztonságos, nem túl szigorú.
//   - `delayMinutes` ELŐJELE: `Math.round((actualMs - scheduledMs) / 60000)`
//     — pozitív = később ért oda a menetrendinél (késés), NEGATÍV = korábban
//     (early-running), NULLA = pontosan egyezik. Ugyanaz a képlet, ugyanazok
//     a megbízhatósági feltételek MINDHÁROM esetben — a modul ezért mindhármat
//     kezeli (lásd NavigationRealtimeInfo lent), NEM csak DELAY/ON_TIME-ot.
//   - LÉTEZŐ PRODUKTUM-PRECEDENS (components/vedett-utvonal/
//     VedettUtvonalSearchForm.tsx `TransitLegRealtimeNote`/`JourneyRealtimeSummary`,
//     a keresési eredmény kártyán, NEM aktív navigációban): PONTOSAN
//     ugyanezen a `leg.realtime && leg.delayMinutes !== undefined` kapun
//     már ma is megjelenik "pontosan időben" (delay===0) és "Korábban
//     indul: N perc" (delay<0) szöveg — ez BIZONYÍTJA, hogy a jelenlegi
//     adatmodell/termékkonvenció szerint mind a nulla, mind a negatív eset
//     megbízhatóan kommunikálható, NEM csak a pozitív késés. A modul ezt a
//     MEGLÉVŐ konvenciót viszi át az aktív navigációs kártyára, rövidebb,
//     a navigációs kártya stílusához illő szöveggel.
//   - `leg.cancelled` = `leg.cancelled === true ? true : undefined`
//     (orchestrator.ts:119) — FÜGGETLEN a realtime/delay mezőktől, a MOTIS
//     bármelyik legre jelezheti, akár `realtime===false` mellett is. A
//     MEGLÉVŐ UI-precedens (`TransitLegRealtimeNote`) a cancelled-ellenőrzést
//     a realtime-gate ELŐTT futtatja — ez a modul is így teszi.
//   - Nincs semmilyen kódág (`mapLeg()`), ami BKK/MÁV/Volán szerint
//     ELTÉRŐEN kezelné ezeket a mezőket — a MOTIS egyetlen, egységes
//     válaszformátumot ad, a normalizáció provider-független. A modul ezért
//     KIZÁRÓLAG a normalizált JourneyLeg mezőket olvassa, nincs provider-ág.
//   - Az aktív leg meghatározása a MEGLÉVŐ navigáció-architektúrával történik
//     (lib/vedett-route/navigation/instructions.ts resolveActiveLegIndex() +
//     VedettUtvonalSearchForm.tsx `activeLeg = displayedJourney.legs[activeLegIndex]`)
//     — ez a modul NEM határoz meg aktív leget, csak egy MÁR kiválasztott
//     leget kap paraméterként. Nincs második leg-progress rendszer.
//   - `delayMinutes` a MOTIS leg egészére vonatkozó, EGYETLEN szám (nem
//     szegmens/pozíció-függő) — ezért a resolver a leg AZONOSSÁGÁTÓL függ
//     (melyik leg az aktív), NEM a leg-en belüli fázistól (BOARD/RIDE/ALIGHT)
//     — ugyanazon aktív leg alatt a BOARD/RIDE/ALIGHT fázisok MINDIG
//     ugyanazt az info-t adják, csak a leg-HATÁRON változik.

export type NavigationRealtimeInfoKind = "DELAY" | "ON_TIME" | "EARLY" | "CANCELLED";

export type NavigationRealtimeInfo =
  | { kind: "DELAY"; delayMinutes: number; phrase: string }
  | { kind: "ON_TIME"; phrase: string }
  | { kind: "EARLY"; delayMinutes: number; phrase: string }
  | { kind: "CANCELLED"; phrase: string };

// A resolver bemenete SZÁNDÉKOSAN egy minimális, structural-typing mező-
// halmaz (nem a teljes JourneyLeg import) — a hívó egy VALÓS JourneyLeg-et
// adhat át közvetlenül (lib/vedett-route/types.ts).
export interface ActiveLegRealtimeInput {
  mode: "WALK" | "TRANSIT" | "RENTAL";
  realtime: boolean;
  delayMinutes?: number;
  cancelled?: boolean;
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Pure fő függvény. Null minden bizonytalan/nem-releváns esetben — lásd a
// modul fejlécének audit-összefoglalóját minden gate pontos indoklásáért.
export function resolveNavigationRealtimeInfo(
  activeLeg: ActiveLegRealtimeInput | null | undefined,
): NavigationRealtimeInfo | null {
  if (!activeLeg) return null;

  // WALK/RENTAL aktív legen SOHA nem jelenik meg transit realtime info
  // (sprint specifikáció 10. pontja) — a Sprint 5 WALK turn-by-turn és a
  // Bubi logika ezzel teljesen érintetlen marad.
  if (activeLeg.mode !== "TRANSIT") return null;

  // A cancelled-ellenőrzés a realtime-gate ELŐTT fut (lásd audit — a
  // meglévő TransitLegRealtimeNote/JourneyRealtimeSummary precedens is így
  // teszi): a törlés ténye független attól, hogy volt-e realtime-korrigált
  // időpont is.
  if (activeLeg.cancelled === true) {
    return { kind: "CANCELLED", phrase: "Ez a járat törölve / kihagyva" };
  }

  // REALTIME GATE — bizonyítottan helyes (lásd audit): computeDelayMinutes()
  // realtime===false esetén MINDIG undefined-ot ad, tehát ez a gate nem
  // szigorúbb a tényleges adatnál, csak explicit dokumentálja az elvet.
  if (!activeLeg.realtime) return null;

  const delay = activeLeg.delayMinutes;
  if (!isFiniteInteger(delay)) return null;

  const rounded = Math.round(delay);
  if (rounded === 0) return { kind: "ON_TIME", phrase: "Pontosan időben" };
  if (rounded > 0) return { kind: "DELAY", delayMinutes: rounded, phrase: `${rounded} perc késés` };
  return { kind: "EARLY", delayMinutes: rounded, phrase: `${Math.abs(rounded)} perccel korábban` };
}
