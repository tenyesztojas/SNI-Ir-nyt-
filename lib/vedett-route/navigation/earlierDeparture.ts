// EARLIER TRANSIT DEPARTURE (2026-09-22) — pure döntési logika a "user
// korábban ér a boarding stophoz, mint a tervezett indulás, és van egy
// TÉNYLEGESEN használható, korábbi járat" esetre.
//
// ROOT CAUSE (valós use case, lásd a hotfix spec 2. pontját): a MEGLÉVŐ
// navigáció a `displayedJourney`-t (egyszer, a keresés pillanatában
// tervezve) FIX tervnek kezeli — ha a user a boarding stophoz a tervezettnél
// korábban ér, a navigáció eddig semmilyen jelzést nem adott arról, hogy
// egy korábbi, ugyanoda vezető járat is elérhető és igénybe vehető lenne.
//
// EZ A MODUL NEM egy második journey-planning motor — a MEGLÉVŐ /plan-
// alapú infrastruktúrát (a hívó a MÁR MEGLÉVŐ POST /api/vedett-route/rest-
// stops/resume endpointot hívja, UGYANAZT, amit az automatikus reroute is
// használ — lásd VedettUtvonalSearchForm.tsx) hívja meg EGYETLEN alkalommal,
// egy ESEMÉNY-VEZÉRELT (nem folyamatosan pollozó) trigger hatására, és ez a
// modul KIZÁRÓLAG a "mikor kérdezzünk" és "a válasz valóban jobb-e" tiszta
// döntéseit hozza. SOSEM vált automatikusan journey-t — a hívó a felhasználó
// explicit elfogadása UTÁN cseréli a displayedJourney-t.

export type EarlierDepartureBoardingPhase =
  | "AT_BOARDING_AREA"
  | "APPROACHING_BOARDING"
  | "BOARDED"
  | "BOARDED_UNCERTAIN_GEOMETRY"
  | "ARRIVED"
  | "WALKING"
  | "NOT_APPLICABLE";

/**
 * Minimális "van értelme még korábbi járatot keresni" előretartás — a
 * tervezett indulásig hátralévő időnek EZT MEG KELL HALADNIA ahhoz, hogy a
 * check egyáltalán lefusson. Konzervatív, hogy ne induljon /plan hívás
 * másodpercekkel a tervezett indulás előtt (amikor egy "korábbi" alternatíva
 * gyakorlatilag már nem valós előny). Ugyanabban a nagyságrendben, mint a
 * BOARDING_CONFIRM_FIXES/DEFAULT_REROUTE_COOLDOWN_MS meglévő, dokumentált
 * konstansai (legTransition.ts, rerouteGuard.ts) — nem egy konkrét járatra
 * kalibrálva.
 */
export const EARLIER_DEPARTURE_MIN_LEAD_MINUTES = 3;

/**
 * Minimális, ÉRDEMI javulás (a végső érkezési időben) ahhoz, hogy egy
 * alternatívát egyáltalán felajánljunk — egy pár másodperces/kerekítési
 * különbség NEM "tényleges előny" (spec 4. pont).
 */
export const EARLIER_DEPARTURE_MIN_IMPROVEMENT_MINUTES = 1;

export interface EarlierDepartureTriggerInput {
  navigationActive: boolean;
  /** A walkToTransitBoundary/legTransition.ts MÁR MEGLÉVŐ fázisa a KÖVETKEZŐ/aktuális TRANSIT legre. */
  boardingPhase: EarlierDepartureBoardingPhase;
  /** A releváns (még el nem ért) TRANSIT leg tervezett indulása (JourneyLeg.departureTime, ISO). */
  plannedDepartureIso: string | null;
  nowMs: number;
  /** Igaz, ha MÁR van függőben lévő vagy elfogadott/elutasított ellenőrzés ERRE a plannedDepartureIso-ra (lásd EarlierDepartureOfferState) — egy MÁR lezárt/folyamatban lévő check nem indul újra. */
  alreadyHandledForThisDeparture: boolean;
}

function parseTimeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Igaz, ha EBBEN a pillanatban meg kell indítani az egyszeri, esemény-
 * vezérelt /plan ellenőrzést. SOSEM ad folyamatos "true"-t egy stabil
 * állapotra — a hívó (React effect) ezt egy edge-triggered (állapotváltásra
 * futó) effektben olvassa, és azonnal `alreadyHandledForThisDeparture`-t
 * állít, mielőtt a kérés elindulna (lásd a hívó oldali pending-flag mintát,
 * ugyanúgy mint rerouteGuard.ts inFlight-jánál).
 */
export function shouldTriggerEarlierDepartureCheck(input: EarlierDepartureTriggerInput): boolean {
  if (!input.navigationActive) return false;
  if (input.alreadyHandledForThisDeparture) return false;
  if (input.boardingPhase !== "AT_BOARDING_AREA" && input.boardingPhase !== "APPROACHING_BOARDING") return false;

  const plannedMs = parseTimeMs(input.plannedDepartureIso);
  if (plannedMs === null) return false;

  const leadMinutes = (plannedMs - input.nowMs) / 60_000;
  return leadMinutes >= EARLIER_DEPARTURE_MIN_LEAD_MINUTES;
}

export interface EarlierDepartureCandidateInput {
  /** A jelölt (candidate) journey első legjének indulása (ISO). */
  candidateDepartureIso: string | null;
  /** A jelölt journey VÉGSŐ érkezése (ISO) — a MEGLÉVŐ /plan válasz Journey.arrivalTime mezője. */
  candidateArrivalIso: string | null;
  /** A releváns TRANSIT leg tervezett indulása (ISO). */
  plannedDepartureIso: string | null;
  /** Az EREDETI (jelenlegi displayedJourney) VÉGSŐ érkezése (ISO). */
  originalArrivalIso: string | null;
  nowMs: number;
  minImprovementMinutes?: number;
}

export type EarlierDepartureRejectReason =
  | "DEPARTURE_NOT_IN_FUTURE"
  | "DEPARTURE_NOT_EARLIER_THAN_PLANNED"
  | "NO_MEANINGFUL_IMPROVEMENT"
  | "MISSING_DATA";

export type EarlierDepartureValidation =
  | { valid: true }
  | { valid: false; reason: EarlierDepartureRejectReason };

/**
 * A jelölt journey (a MEGLÉVŐ /plan-alapú resume endpoint válasza, a user
 * JELENLEGI pozíciójából a JELENLEGI (eredeti) célig) VALID korábbi
 * alternatíva-e. FULL REMAINING JOURNEY összehasonlítás: a candidate
 * Journey.arrivalTime a candidate TELJES hátralévő útjának végső érkezése
 * (a /plan endpoint natívan ezt adja vissza, nincs külön "csak az első
 * leg" heurisztika) — az EREDETI journey végső érkezésével vetjük össze,
 * SOSEM csak az első járat indulási idejével.
 */
export function validateEarlierDepartureCandidate(input: EarlierDepartureCandidateInput): EarlierDepartureValidation {
  const candidateDepartureMs = parseTimeMs(input.candidateDepartureIso);
  const candidateArrivalMs = parseTimeMs(input.candidateArrivalIso);
  const plannedDepartureMs = parseTimeMs(input.plannedDepartureIso);
  const originalArrivalMs = parseTimeMs(input.originalArrivalIso);

  if (
    candidateDepartureMs === null ||
    candidateArrivalMs === null ||
    plannedDepartureMs === null ||
    originalArrivalMs === null
  ) {
    return { valid: false, reason: "MISSING_DATA" };
  }

  if (candidateDepartureMs <= input.nowMs) {
    return { valid: false, reason: "DEPARTURE_NOT_IN_FUTURE" };
  }

  if (candidateDepartureMs >= plannedDepartureMs) {
    return { valid: false, reason: "DEPARTURE_NOT_EARLIER_THAN_PLANNED" };
  }

  const minImprovementMs = (input.minImprovementMinutes ?? EARLIER_DEPARTURE_MIN_IMPROVEMENT_MINUTES) * 60_000;
  if (candidateArrivalMs > originalArrivalMs - minImprovementMs) {
    return { valid: false, reason: "NO_MEANINGFUL_IMPROVEMENT" };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// OFFER STATE MACHINE — SOSEM automatikus váltás; "declined" fingerprint,
// hogy egy elutasított alternatívát ne ajánljunk fel újra és újra
// (spec 5/6. pont: "ugyanazt az alternatívát ne ajánld újra folyamatosan").
// ---------------------------------------------------------------------------

export type EarlierDepartureOfferStatus = "idle" | "checking" | "offered" | "declined" | "accepted";

export interface EarlierDepartureOfferState {
  status: EarlierDepartureOfferStatus;
  /** A JELENLEG kezelt (ellenőrzött/felajánlott) tervezett indulás ISO-ja — ez a "handled" kulcs. */
  handledPlannedDepartureIso: string | null;
  /** A jelölt journey, HA offered. */
  candidate: { departureIso: string; arrivalIso: string; routeLabel: string } | null;
  /** Elutasított jelöltek fingerprintje (departureIso+routeLabel), hogy ne ajánljuk fel újra ugyanazt. */
  declinedFingerprints: readonly string[];
}

export function createInitialEarlierDepartureOfferState(): EarlierDepartureOfferState {
  return { status: "idle", handledPlannedDepartureIso: null, candidate: null, declinedFingerprints: [] };
}

export function candidateFingerprint(departureIso: string, routeLabel: string): string {
  return `${departureIso}__${routeLabel}`;
}

/** A hívó ezt hívja KÖZVETLENÜL a /plan kérés elindítása ELŐTT (edge-triggered), hogy `alreadyHandledForThisDeparture` azonnal true legyen — elkerülve a duplikált kérést. */
export function startEarlierDepartureCheck(
  state: EarlierDepartureOfferState,
  plannedDepartureIso: string,
): EarlierDepartureOfferState {
  return { ...state, status: "checking", handledPlannedDepartureIso: plannedDepartureIso };
}

/**
 * A /plan válasz + validáció eredményét dolgozza fel. Ha valid ÉS a jelölt
 * fingerprintje MÉG NEM szerepel a declinedFingerprints-ben, "offered"-re
 * vált; egyébként (invalid, VAGY korábban már elutasított UGYANEZ a
 * jelölt) csendben "idle"-ra esik vissza — nincs UI, nincs ismételt
 * felkínálás (spec 5/6. pont).
 */
export function resolveEarlierDepartureCandidate(
  state: EarlierDepartureOfferState,
  candidate: { departureIso: string; arrivalIso: string; routeLabel: string } | null,
  validation: EarlierDepartureValidation,
): EarlierDepartureOfferState {
  if (!candidate || !validation.valid) {
    return { ...state, status: "idle", candidate: null };
  }
  const fingerprint = candidateFingerprint(candidate.departureIso, candidate.routeLabel);
  if (state.declinedFingerprints.includes(fingerprint)) {
    return { ...state, status: "idle", candidate: null };
  }
  return { ...state, status: "offered", candidate };
}

/** Elfogadás — a hívó EZUTÁN, KÜLÖN lépésben cseréli a displayedJourney-t a candidate journey-re. */
export function acceptEarlierDepartureOffer(state: EarlierDepartureOfferState): EarlierDepartureOfferState {
  return { ...state, status: "accepted" };
}

/** Elutasítás — az eredeti journey VÁLTOZATLAN marad, a jelölt fingerprintje bekerül a declined listába (nem ajánljuk fel újra). */
export function declineEarlierDepartureOffer(state: EarlierDepartureOfferState): EarlierDepartureOfferState {
  if (!state.candidate) return { ...state, status: "idle" };
  const fingerprint = candidateFingerprint(state.candidate.departureIso, state.candidate.routeLabel);
  return {
    ...state,
    status: "idle",
    candidate: null,
    declinedFingerprints: state.declinedFingerprints.includes(fingerprint)
      ? state.declinedFingerprints
      : [...state.declinedFingerprints, fingerprint],
  };
}

/** Új navigáció/route-váltás reset-pontja — UGYANAZ a minta, mint a többi navigation modulnál (rerouteGuard.ts resetRerouteGuard() stb.). */
export function resetEarlierDepartureOffer(): EarlierDepartureOfferState {
  return createInitialEarlierDepartureOfferState();
}
