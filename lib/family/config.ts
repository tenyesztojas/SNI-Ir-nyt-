// VédettSarok — Family modul feature flag.
//
// A MÁR MEGLÉVŐ profiles.pilot_access mechanizmust használja újra —
// ugyanaz a minta, mint a Védett Útvonal korábbi zárt bétájánál (lásd
// lib/vedett-route/access.ts hasVedettRouteBetaAccess()). Nincs új,
// párhuzamos permission rendszer.
//
// FONTOS: ez a flag KIZÁRÓLAG UI/rollout-kontroll. A valódi biztonsági
// réteg a DB/RLS (lásd
// supabase/migrations/20260926_family_db_foundation.sql) — minden
// tábla és RPC saját maga is ellenőrzi a hozzáférést, ettől a
// konstanstól függetlenül.

export const FAMILY_DB_BETA_FEATURE_KEY = "family_db_beta";

export function hasFamilyBetaAccess(
  profile:
    | { role?: string | null; pilotAccess?: string[] | null }
    | null
    | undefined
): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  const pilotAccess = profile.pilotAccess ?? [];
  return pilotAccess.includes(FAMILY_DB_BETA_FEATURE_KEY);
}
