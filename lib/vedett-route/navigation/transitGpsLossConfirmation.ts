// TRANSIT GPS LOSS + CAMERA FOLLOW FIX SPRINT (2026-09-21) — pure döntési
// logika a "vonaton/buszon/villamoson/metrón/trolibuszon utazva elveszett
// GPS után egy pontatlan visszatérő fix NE indítson automatikus
// reroute-ot" hibára.
//
// ROOT CAUSE: gpsFixGate.ts isGpsReacquiring() már blokkolja az automatikus
// reroute-ot a LOST utáni "bemelegítési" ablakban (GPS_REACQUISITION_STABLE_
// FIXES fixig), DE ez az ablak jellemzően RÖVIDEBB, mint amíg egy alagútból/
// rossz lefedettségű területről kilépő fix ténylegesen stabilizálódik — az
// ablak lejárta UTÁN egy továbbra is pontatlan (de "GOOD" minőségűnek
// minősülő) fix simán OFF_ROUTE-ot generálhat, és a MEGLÉVŐ rerouteGuard.ts
// ekkor automatikusan újratervezne. EZ A MODUL NEM egy második GPS-állapot-
// gép: a hívó (VedettUtvonalSearchForm.tsx) a MÁR MEGLÉVŐ gpsFixGate.ts
// classifyGpsQuality() kimenetét és a MÁR MEGLÉVŐ legTransition.ts BOARDED/
// BOARDED_UNCERTAIN_GEOMETRY fázisát adja át — ez a modul csak egy
// megerősítés-állapotot tart fent eddig a KÉT bemenetből, plusz a
// rerouteGuard.ts döntésébe illesztendő FÜGGETLEN blokkoló feltételeket
// biztosítja (ugyanaz a minta, mint transitGeometryUncertain/gpsReacquiring/
// foregroundRecoveryActive).
//
// ONBOARD CONFIRMATION SPRINT (2026-09-23) — KIBŐVÍTÉS (audit-riport
// alapján, NEM új, párhuzamos rendszer): a korábbi, egyetlen `pending:
// boolean` + `transitMode: string | null` állapotot egy explicit,
// HÁROM-állapotú modellre bővítjük (NONE / PENDING / CONFIRMED_ONBOARD),
// és az eddigi puszta transitMode-azonosítás helyett egy TELJES,
// tripId-alapú `TransitOnboardScope`-ra — ez zárja be az audit által
// talált valódi rést: egy M2 leg -> átszállás -> egy MÁSIK SUBWAY leg
// esetén a KORÁBBI implementáció (csak transitMode alapján) tévesen
// alkalmazhatta volna az első leg megerősítését a másodikra. A tripId
// SOHA nem egyezhet két különböző fizikai trip között, ezért ez a
// scope-azonosító strukturálisan kizárja az átszivárgást.
//
// ÚJ SZEMANTIKA (audit C/E/F pontjai):
//   - PENDING: LOST utáni, MÉG megválaszolatlan kérdés (VÁLTOZATLAN
//     trigger-logika: markTransitGpsLoss "első bizonyíték marad mérvadó").
//   - CONFIRMED_ONBOARD: a felhasználó egyszer már IGEN-t válaszolt EHHEZ
//     a tripId-hez — egy UGYANAZON a tripId-n later ismét felmerülő,
//     KIZÁRÓLAG geometriai OFF_ROUTE bizonyíték emiatt TÖBBÉ NEM kérdez
//     újra (markTransitGpsLoss no-op-ot ad ilyenkor), a rerouteGuard.ts
//     pedig KIZÁRÓLAG emiatt (transitOnboardConfirmed) letiltja az
//     automatikus reroute-ot.
//   - NEM (decline) SOHA nem válik tartós "CONFIRMED_EXITED" állapottá —
//     az audit saját ajánlása szerint egy rövid életű
//     `awaitingFreshGpsSinceMs` időbélyeg jelzi, hogy a reroute-hoz egy, a
//     NEM válasz UTÁN érkezett, ténylegesen usable GPS fix kell (UGYANAZ az
//     "esemény-időpont vs. fix-időpont" minta, mint gpsFixGate.ts
//     `pendingReacquisitionSinceMs`-e) — SOHA nem a NEM válasz előtti
//     (potenciálisan alagút-előtti) állófix alapján indul reroute.

export type TransitOnboardConfirmationStatus = "NONE" | "PENDING" | "CONFIRMED_ONBOARD";

/**
 * A megerősítés-kérdés/állapot TELJES, stabil identitása — a LOST idején
 * aktív (BOARDED/BOARDED_UNCERTAIN_GEOMETRY) TRANSIT leg adatai. A `tripId`
 * a MEGLÉVŐ, /trip realtime-refresh (Sprint 9, commit b84b532) által is
 * használt, MOTIS-normalizált identitás (JourneyLeg.tripId) — ez az
 * EGYETLEN mező, ami a scope-egyezést eldönti (lásd isTransitOnboardScopeStale/
 * markTransitGpsLoss). routeShortName/headsign KIZÁRÓLAG a megjelenítendő
 * kérdésszöveghez kellenek (lásd transitOnboardQuestionText), a
 * scope-azonosításban NEM vesznek részt.
 */
export interface TransitOnboardScope {
  tripId: string;
  transitMode: string | null;
  routeShortName: string | null;
  headsign: string | null;
}

export interface TransitGpsLossConfirmationState {
  status: TransitOnboardConfirmationStatus;
  /** null KIZÁRÓLAG NONE állapotban — PENDING/CONFIRMED_ONBOARD mindig scope-olt. */
  scope: TransitOnboardScope | null;
  /** Nem-null KIZÁRÓLAG egy megválaszolatlan NEM válasz UTÁN, amíg egy
   * ténylegesen a válasz UTÁN érkezett, usable GPS fix meg nem érkezik —
   * lásd clearAwaitingFreshGpsIfSatisfied(). */
  awaitingFreshGpsSinceMs: number | null;
}

export function createInitialTransitGpsLossConfirmationState(): TransitGpsLossConfirmationState {
  return { status: "NONE", scope: null, awaitingFreshGpsSinceMs: null };
}

/**
 * A hívó ezt hívja, amikor `classifyGpsQuality(...) === "LOST"` ÉS az
 * aktuális aktív leg egy BOARDED/BOARDED_UNCERTAIN_GEOMETRY TRANSIT leg
 * (scope nem null, `scope.tripId` kitöltött).
 *
 * - NONE -> PENDING(scope): első bizonyíték, kérdés felmerülhet.
 * - PENDING(UGYANAZ a tripId) -> változatlan: már függőben van a kérdés,
 *   nem duplikáljuk/írjuk felül (első bizonyíték marad mérvadó).
 * - CONFIRMED_ONBOARD(UGYANAZ a tripId) -> változatlan: a felhasználó már
 *   megerősítette EZT a tripet — egy újabb LOST/OFF_ROUTE ugyanezen a
 *   tripen NEM kérdez újra (audit E pont, "no repeated question").
 * - PENDING/CONFIRMED_ONBOARD(MÁSIK tripId) -> ÚJ PENDING(scope): a hívónak
 *   normál esetben MÁR reseteltnek kellene lennie ilyenkor (lásd
 *   isTransitOnboardScopeStale az effektben), de ez a védekező ág
 *   garantálja, hogy egy korábbi trip megerősítése/kérdése SOHA nem
 *   szivároghat át egy ÚJ tripId-re — ez zárja be az audit által talált
 *   rést.
 */
export function markTransitGpsLoss(
  state: TransitGpsLossConfirmationState,
  scope: TransitOnboardScope | null,
): TransitGpsLossConfirmationState {
  if (!scope || !scope.tripId) return state;
  const sameScope = state.scope?.tripId === scope.tripId;
  if (sameScope && (state.status === "PENDING" || state.status === "CONFIRMED_ONBOARD")) {
    return state;
  }
  return { status: "PENDING", scope, awaitingFreshGpsSinceMs: null };
}

/**
 * IGEN — "még mindig a járművön vagyok". A PENDING kérdés
 * CONFIRMED_ONBOARD-dá válik, a scope (tripId) MEGŐRZŐDIK — ez teszi
 * lehetővé, hogy egy KÉSŐBBI, ugyanezen a tripId-n felmerülő, kizárólag
 * geometriai OFF_ROUTE bizonyíték NE indítson újra kérdést/reroute-ot
 * (lásd markTransitGpsLoss fenti CONFIRMED_ONBOARD-ág, és rerouteGuard.ts
 * `transitOnboardConfirmed` bemenete). Ha valamiért nincs scope (védekező
 * eset — nem várt hívási sorrend), biztonságosan NONE-ra esik vissza,
 * SOHA nem állít be CONFIRMED_ONBOARD-ot identitás nélkül.
 */
export function confirmTransitOnboard(state: TransitGpsLossConfirmationState): TransitGpsLossConfirmationState {
  if (!state.scope) return createInitialTransitGpsLossConfirmationState();
  return { status: "CONFIRMED_ONBOARD", scope: state.scope, awaitingFreshGpsSinceMs: null };
}

/**
 * NEM — "már nem vagyok a járművön". A scope/megerősítés törlődik (NONE),
 * DE a hívó rögzíti a válasz IDŐPONTJÁT (`awaitingFreshGpsSinceMs`) — a
 * rerouteGuard.ts-nek innentől egy, EZT AZ időpontot KÖVETŐ, usable GPS fix
 * kell, mielőtt bármilyen reroute elindulhatna (lásd
 * isAwaitingFreshGpsAfterDecline/clearAwaitingFreshGpsIfSatisfied) — SOHA
 * nem a NEM válasz előtti (potenciálisan alagút-előtti) fixről.
 */
export function declineTransitOnboard(nowMs: number): TransitGpsLossConfirmationState {
  return { status: "NONE", scope: null, awaitingFreshGpsSinceMs: nowMs };
}

/**
 * Általános reset — navigációs session-váltás (leállítás/újraindítás/
 * storage-restore), VAGY egy scope-invalidáló leg-/tripId-váltás (lásd
 * isTransitOnboardScopeStale) esetén hívja a hívó. UGYANAZT az állapotot
 * adja, mint createInitialTransitGpsLossConfirmationState() — egyetlen,
 * megnevezett reset-primitívként exportálva, hogy a hívó oldali
 * hívás-helyek szándéka (bumpNavigationSession, scope-invalidáció) a
 * kódban is olvasható maradjon.
 */
export function resolveTransitGpsLossConfirmation(): TransitGpsLossConfirmationState {
  return createInitialTransitGpsLossConfirmationState();
}

/**
 * Igaz, ha egy PENDING kérdést a felhasználói válasz NÉLKÜL, csendben el
 * kell tüntetni: a GPS időközben stabilizálódott (usable ÉS nem
 * reacquiring), ÉS a route-progress motor szerint MÁR NEM áll fenn
 * megerősített OFF_ROUTE — azaz "a GPS normálisan tért vissza", nincs
 * szükség kérdésre. KIZÁRÓLAG PENDING státuszra vonatkozik — egy MÁR
 * CONFIRMED_ONBOARD scope-ot ez a függvény SOSEM töröl (az csak explicit
 * reset/scope-invalidáció útján szűnhet meg, lásd fent) — egy geometriai
 * OFF_ROUTE eltűnése/visszatérése önmagában NEM ok a megerősítés
 * törlésére (audit "5. Reset conditions" pontja).
 */
export function shouldAutoClearTransitGpsLossConfirmation(
  status: TransitOnboardConfirmationStatus,
  gpsFixUsable: boolean,
  gpsReacquiring: boolean,
  offRouteStatus: string,
): boolean {
  if (status !== "PENDING") return false;
  if (!gpsFixUsable || gpsReacquiring) return false;
  return offRouteStatus !== "OFF_ROUTE";
}

/**
 * Igaz, ha a jelenlegi állapot (PENDING vagy CONFIRMED_ONBOARD) egy MÁR NEM
 * aktív tripId-hez van scope-olva — azaz a leg időközben lezárult (ARRIVED
 * -> a KÖVETKEZŐ legre lépett, lásd legTransition.ts), vagy egy teljesen
 * más tripId vált aktívvá. A hívó egy ilyen esetben resolveTransitGpsLoss
 * Confirmation()-t hív — ez az EGYETLEN mechanizmus, ami a leg-befejeződést/
 * tripId-váltást a scope-ra vetíti, nincs külön "leg completion" detektor
 * duplikálva. `activeTransitLegTripId` null, ha az aktív leg nem TRANSIT
 * (pl. WALK) vagy nincs navigáció — ilyenkor egy MÉG élő PENDING/
 * CONFIRMED_ONBOARD scope is staleként minősül (a felhasználó már nem egy
 * transit legen van).
 */
export function isTransitOnboardScopeStale(
  state: TransitGpsLossConfirmationState,
  activeTransitLegTripId: string | null,
): boolean {
  if (state.status === "NONE") return false;
  if (!state.scope) return true;
  return state.scope.tripId !== activeTransitLegTripId;
}

/** Igaz, amíg a NEM válasz utáni, friss (a válasz IDŐPONTJÁT követő) GPS
 * fixre várunk — a rerouteGuard.ts-nek ez idő alatt tilos reroute-olnia. */
export function isAwaitingFreshGpsAfterDecline(state: TransitGpsLossConfirmationState): boolean {
  return state.awaitingFreshGpsSinceMs !== null;
}

/**
 * A hívó minden GPS-ticken meghívja (UGYANOTT, ahol a pending-jelzést is
 * frissíti) — ha éppen egy NEM válasz utáni friss fixre várunk, ÉS ez a fix
 * usable (lásd gpsFixGate.ts evaluateGpsFixUsability().usable) ÉS az
 * időbélyege >= a NEM válasz időpontja, törli a várakozást (UGYANAZ az
 * "esemény-időpont vs. fix-időpont" összehasonlítás, mint gpsFixGate.ts
 * evaluateGpsFixUsability()-jében a pendingReacquisitionSinceMs-nél — NEM
 * egy új idő/sebesség-heurisztika, csak ennek a MEGLÉVŐ mintának az
 * újrafelhasználása).
 */
export function clearAwaitingFreshGpsIfSatisfied(
  state: TransitGpsLossConfirmationState,
  fixTimestampMs: number | null | undefined,
  fixUsable: boolean,
): TransitGpsLossConfirmationState {
  if (state.awaitingFreshGpsSinceMs === null) return state;
  if (!fixUsable) return state;
  if (typeof fixTimestampMs !== "number" || !Number.isFinite(fixTimestampMs)) return state;
  if (fixTimestampMs < state.awaitingFreshGpsSinceMs) return state;
  return { ...state, awaitingFreshGpsSinceMs: null };
}

export interface TransitOnboardQuestionText {
  /** A fő kérdés — pl. "Még mindig az M2 metrón vagy?" */
  primary: string;
  /** Opcionális, KIZÁRÓLAG akkor jelen lévő második sor, ha van
   * megbízható célállomás-jelzés (headsign) — pl. "Déli pályaudvar felé". */
  secondary: string | null;
}

const TRANSIT_ONBOARD_QUESTION_DEFAULT = "Még mindig a járművön vagy?";

/**
 * A scope-hoz (transitMode + opcionális routeShortName/headsign) tartozó
 * magyar megerősítő kérdés-szöveg. Ismeretlen/hiányzó transitMode esetén
 * egy semleges, jármű-független alapértelmezés — SOHA nem találgatott
 * módnév. A SUBWAY ág a route-számot (pl. "M2") a kérdésbe fűzi, HA az
 * rendelkezésre áll (routeShortName), egyébként a generikus "Még mindig a
 * metrón vagy?" szöveg marad — ugyanaz az elv, mint instructions.ts
 * routeLabel()-jénél: hiányzó adat esetén SOSEM kitalálás, biztonságos
 * fallback. A `secondary` (headsign) KIZÁRÓLAG SUBWAY-nél jelenik meg,
 * ahogy a spec kéri — más módokra ez a mező mindig null.
 */
export function transitOnboardQuestionText(scope: TransitOnboardScope | null): TransitOnboardQuestionText {
  if (!scope) return { primary: TRANSIT_ONBOARD_QUESTION_DEFAULT, secondary: null };

  const routeShortName = scope.routeShortName?.trim() || null;
  const headsign = scope.headsign?.trim() || null;

  switch (scope.transitMode) {
    case "SUBWAY":
      return {
        primary: routeShortName ? `Még mindig az ${routeShortName} metrón vagy?` : "Még mindig a metrón vagy?",
        secondary: headsign ? `${headsign} felé` : null,
      };
    case "RAIL":
    case "REGIONAL_RAIL":
      return { primary: "Még mindig a vonaton vagy?", secondary: null };
    case "TRAM":
      return { primary: "Még mindig a villamoson vagy?", secondary: null };
    case "BUS":
      return { primary: "Még mindig a buszon vagy?", secondary: null };
    case "TROLLEYBUS":
      return { primary: "Még mindig a trolibuszon vagy?", secondary: null };
    default:
      return { primary: TRANSIT_ONBOARD_QUESTION_DEFAULT, secondary: null };
  }
}
