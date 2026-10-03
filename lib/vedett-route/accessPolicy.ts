// Védett Útvonal — TISZTA (DB/HTTP/next-mentes) hozzáférési döntési modell.
//
// MIÉRT KÜLÖN FÁJL: az access.ts next/server-t, Supabase klienseket és
// rate-limitert importál, így node --test alatt nem tölthető be. A
// döntési szabályt ide, side-effect mentes függvénybe tesszük, hogy a
// teljes (anonim / bejelentkezett nem-admin / admin) x (public_read /
// user / admin) hozzáférési mátrix determinisztikusan, DB nélkül
// tesztelhető legyen (lásd __tests__/vedett-route/access-matrix.test.ts).
// Az access.ts guardjai EZT hívják — nincs párhuzamos szabályrendszer.
//
// HÁROM, EXPLICIT KÖVETELMÉNY-SZINT (NEM az útvonal neve — "/api/admin/..."
// — dönti el, hogy egy végpont mit igényel):
//
//   "public_read" — alap, csak-olvasó útvonaltervezés/pihenőpont-keresés/
//                   akadálymentességi adat. Anonim HÍVHATJA, ha a szint
//                   "public". Anonim hívónál userId === null (SOSEM
//                   kitalált/szintetikus azonosító).
//   "user"        — felhasználó-specifikus perzisztencia/írás (kedvencek,
//                   saját pihenőpont CRUD). MINDIG bejelentkezés kell,
//                   a "public" szint ezt NEM nyitja meg.
//   "admin"       — operatív/admin végpontok (GTFS feltöltés/frissítés).
//                   MINDIG profiles.role === "admin" kell, a szinttől
//                   FÜGGETLENÜL — a "public"/"authenticated_users" szint
//                   semmit nem enyhít rajta.
//
// SORREND (változatlan a korábbi access.ts-hez képest): előbb a
// jogosultság, UTÁNA a VEDETT_ROUTE_ENABLED kill switch — így a "Forbidden"
// válasz nem szivárogtatja ki, hogy a funkció élesítve van-e.

import { VEDETT_ROUTE_BETA_FEATURE_KEY, type VedettRouteAccessLevel } from "./config.ts";

export type VedettRouteRequirement = "public_read" | "user" | "admin";

export interface VedettRouteActor {
  userId: string;
  role: string | null;
  pilotAccess: string[];
}

export type VedettRouteDecision =
  | { allow: true; userId: string | null }
  | { allow: false; status: 401 | 403; body: { error: string; message?: string } };

const UNAUTHORIZED: VedettRouteDecision = { allow: false, status: 401, body: { error: "Unauthorized" } };
const FORBIDDEN: VedettRouteDecision = { allow: false, status: 403, body: { error: "Forbidden" } };
const BETA_FORBIDDEN: VedettRouteDecision = {
  allow: false,
  status: 403,
  body: { error: "Forbidden", message: "Nincs hozzáférésed ehhez a béta funkcióhoz." },
};
const FEATURE_DISABLED: VedettRouteDecision = {
  allow: false,
  status: 403,
  body: { error: "Feature disabled", message: "A Védett Útvonal funkció jelenleg ki van kapcsolva." },
};

/**
 * Kell-e a hívó profiljának (role/pilot_access) betöltése a döntéshez?
 * Csak akkor, ha a döntés ténylegesen role-ra/grantre támaszkodik —
 * "public"/"authenticated_users" szinten egy sima user/read hívásnál NEM
 * (nincs felesleges admin-kliens DB hívás, a korábbi viselkedés szerint).
 */
export function vedettRouteDecisionNeedsProfile(
  level: VedettRouteAccessLevel,
  requirement: VedettRouteRequirement
): boolean {
  if (requirement === "admin") return true;
  return level === "beta_testers" || level === "admin_only";
}

function isAdmin(actor: VedettRouteActor): boolean {
  return actor.role === "admin";
}

function hasBetaGrantOrAdmin(actor: VedettRouteActor): boolean {
  return isAdmin(actor) || actor.pilotAccess.includes(VEDETT_ROUTE_BETA_FEATURE_KEY);
}

export function decideVedettRouteAccess(input: {
  level: VedettRouteAccessLevel;
  featureEnabled: boolean;
  actor: VedettRouteActor | null;
  requirement: VedettRouteRequirement;
}): VedettRouteDecision {
  const { level, featureEnabled, actor, requirement } = input;

  if (requirement === "admin") {
    if (!actor) return UNAUTHORIZED;
    if (!isAdmin(actor)) return FORBIDDEN;
    return featureEnabled ? { allow: true, userId: actor.userId } : FEATURE_DISABLED;
  }

  // Anonim hívó KIZÁRÓLAG public_read követelménynél és KIZÁRÓLAG "public"
  // szinten léphet tovább; minden más esetben bejelentkezés kell.
  if (!actor) {
    if (requirement === "public_read" && level === "public") {
      return featureEnabled ? { allow: true, userId: null } : FEATURE_DISABLED;
    }
    return UNAUTHORIZED;
  }

  // Bejelentkezett hívó: a szint szerinti réteg (user és public_read
  // követelménynél ugyanaz — a "public" szint a bejelentkezettet sem
  // korlátozza többre, mint a sima bejelentkezést).
  if (level === "beta_testers" && !hasBetaGrantOrAdmin(actor)) return BETA_FORBIDDEN;
  if (level === "admin_only" && !isAdmin(actor)) return FORBIDDEN;

  return featureEnabled ? { allow: true, userId: actor.userId } : FEATURE_DISABLED;
}
