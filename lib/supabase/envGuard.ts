// VédettSarok — Supabase környezet-elkülönítési őr (Preview ≠ Production).
//
// Cél: egy Vercel Preview deployment SEMMILYEN úton (middleware, Server
// Component, Server Action, Route Handler, böngészőkliens, admin kliens) ne
// kapcsolódhasson a production Supabase-projekthez. Hibás vagy hiányos
// Preview-konfigurációnál az alkalmazás LEÁLL (fail closed), nem esik vissza
// production kapcsolatra.
//
// Szabályok:
//   * A környezetet az első ismert értékű jelzés dönti el, ebben a sorrendben:
//     VERCEL_ENV, NEXT_PUBLIC_VERCEL_ENV (a Vercel platform állítja, hiteles),
//     majd VEDETT_DEPLOY_ENV, NEXT_PUBLIC_VEDETT_DEPLOY_ENV (explicit, a
//     Preview scope-ban beállítandó tartalék arra az esetre, ha a Vercel
//     rendszerváltozói nincsenek kitéve). A platform jelzése elsőbbséget élvez,
//     így egy tévesen minden környezetre beállított explicit "preview" sem
//     állíthatja le a productiont. (A RATE_LIMIT_ENV szándékosan NEM jelzés.)
//   * Preview-ban:
//       - NEXT_PUBLIC_SUPABASE_URL kötelező, https, hosztja PONTOSAN
//         <TESZT_REF>.supabase.co; a production ref sehol nem szerepelhet;
//       - NEXT_PUBLIC_SUPABASE_ANON_KEY kötelező; ha JWT, a ref-je a teszt-ref
//         és a szerepe NEM service_role; titkos (sb_secret_) kulcs nem lehet;
//       - NEXT_PUBLIC_SUPABASE_PROJECT_REF, ha be van állítva, a teszt-ref;
//       - SUPABASE_SERVICE_ROLE_KEY (csak szerveren, csak ha az admin kliens
//         kéri): kötelező; ha JWT, ref = teszt-ref és role = service_role.
//   * Productionben és helyi fejlesztésben a viselkedés VÁLTOZATLAN (az őr
//     nem ellenőriz, így a production konfiguráció nem módosul és nem törhet).
//
// ÖNÁLLÓ TESZT VERCEL-PROJEKT (72. lépés, „vedettsarok-family-test”):
//   * A teszt-projekt SAJÁT Production deploymentje is tesztkörnyezet, ezért
//     itt a VERCEL_ENV értéke NEM dönt. Tesztmód, ha BÁRMELY jelzés ezt mondja:
//       - VEDETT_DEPLOY_ENV / NEXT_PUBLIC_VEDETT_DEPLOY_ENV = "test", vagy
//       - a Vercel által állított VERCEL_PROJECT_PRODUCTION_URL /
//         NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL hosztja a
//         „vedettsarok-family-test” projekthez tartozik (a felhasználói
//         változóktól független, platform-szintű jelzés).
//   * Tesztmódban MINDEN deploymentnél (production, preview, development) a
//     Preview-szabályok érvényesek, és ezen felül kötelező:
//       - NEXT_PUBLIC_SUPABASE_PROJECT_REF = teszt-ref;
//       - NEXT_PUBLIC_SITE_URL és NEXT_PUBLIC_APP_URL: https, és NEM az éles
//         VédettSarok domainje (a kód több helyen https://vedettsarok.hu-ra
//         esne vissza – e-mail- és visszairányító linkek –, ezt tesztmódban
//         nem engedjük).
//   * Új Supabase-kulcsformátum (sb_publishable_ / sb_secret_): nem JWT, így
//     a projekt-ref nem olvasható ki belőle; ilyenkor a cél-projektet a
//     kötelező teszt-URL dönti el (idegen projekt kulcsát a Supabase elutasítja).
//     A típuskeverést viszont kiszűrjük: titkos kulcs nem lehet anon kulcs, és
//     publishable kulcs nem lehet service_role kulcs.
//   * A „test” jelzés szándékosan erősebb a VERCEL_ENV-nél: ha valaki tévesen
//     az éles sni-iranytu projektben állítaná be, az éles rendszer biztonságosan
//     leállna (nem nyílna meg tesztadatra). Az éles projektben SOHA ne állítsd.
//
// Titkot soha nem ír ki: csak hibakódot és rövid magyar indoklást ad vissza.
// A projekt-ref nem titok (a Supabase URL része).

export const PRODUCTION_SUPABASE_REF = "swrhxhbjkrbjrhlcepjb";
export const PREVIEW_SUPABASE_REF = "csyjctsgmmxubibwrapv";

export type DeployEnv = "preview" | "production" | "development" | "unknown";

/** Az önálló teszt Vercel-projekt neve (72. lépés). */
export const TEST_VERCEL_PROJECT_NAME = "vedettsarok-family-test";

/** Éles VédettSarok hosztok: tesztmódban a NEXT_PUBLIC_SITE_URL nem lehet ezek egyike. */
export const PRODUCTION_SITE_HOSTS: readonly string[] = [
  "vedettsarok.hu",
  "www.vedettsarok.hu",
  "vedettsarok.vercel.app",
  "sni-iranytu.vercel.app",
];

export interface SupabaseEnvInput {
  /** Környezetjelzők prioritási sorrendben (az első ismert érték dönt). */
  signals: Array<string | undefined>;
  url: string | undefined;
  anonKey: string | undefined;
  projectRef?: string | undefined;
  /** Csak szerveren van értéke (a böngészőben undefined). */
  serviceRoleKey?: string | undefined;
  requireServiceRole?: boolean;
  /** Explicit tesztmód-jelzők (VEDETT_DEPLOY_ENV, NEXT_PUBLIC_VEDETT_DEPLOY_ENV). */
  testSignals?: Array<string | undefined>;
  /** A Vercel-projekt production URL-je (VERCEL_PROJECT_PRODUCTION_URL …). */
  projectProductionUrls?: Array<string | undefined>;
  /** NEXT_PUBLIC_SITE_URL (csak tesztmódban ellenőrzött). */
  siteUrl?: string | undefined;
  /** NEXT_PUBLIC_APP_URL (csak tesztmódban ellenőrzött). */
  appUrl?: string | undefined;
}

export type SupabaseEnvProblem =
  | "preview_url_missing"
  | "preview_url_invalid"
  | "preview_url_not_test_project"
  | "preview_production_ref"
  | "preview_anon_key_missing"
  | "preview_anon_key_secret"
  | "preview_anon_key_wrong_project"
  | "preview_project_ref_mismatch"
  | "preview_service_role_missing"
  | "preview_service_role_wrong_project"
  | "test_project_ref_missing"
  | "test_site_url_missing"
  | "test_site_url_invalid"
  | "test_site_url_production"
  | "test_app_url_missing"
  | "test_app_url_invalid"
  | "test_app_url_production";

export type SupabaseEnvCheck =
  | { ok: true; env: DeployEnv | "test" }
  | { ok: false; env: "preview" | "test"; problems: SupabaseEnvProblem[] };

export const SUPABASE_ENV_PROBLEM_TEXT: Record<SupabaseEnvProblem, string> = {
  preview_url_missing: "A Preview-környezetben nincs beállítva a NEXT_PUBLIC_SUPABASE_URL.",
  preview_url_invalid: "A Preview NEXT_PUBLIC_SUPABASE_URL értéke nem érvényes https URL.",
  preview_url_not_test_project: "A Preview NEXT_PUBLIC_SUPABASE_URL nem a teszt Supabase-projektre mutat.",
  preview_production_ref: "A Preview-konfiguráció a production Supabase-projektre hivatkozik.",
  preview_anon_key_missing: "A Preview-környezetben nincs beállítva a NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  preview_anon_key_secret: "A NEXT_PUBLIC_SUPABASE_ANON_KEY titkos (service_role / secret) kulcs – kliensoldalra nem kerülhet.",
  preview_anon_key_wrong_project: "A Preview anon kulcsa nem a teszt Supabase-projekthez tartozik.",
  preview_project_ref_mismatch: "A NEXT_PUBLIC_SUPABASE_PROJECT_REF nem a teszt Supabase-projekt azonosítója.",
  preview_service_role_missing: "A Preview-környezetben nincs beállítva a SUPABASE_SERVICE_ROLE_KEY (szerveroldali admin kliens).",
  preview_service_role_wrong_project: "A Preview SUPABASE_SERVICE_ROLE_KEY nem a teszt Supabase-projekt service_role kulcsa.",
  test_project_ref_missing: "A teszt-projektben kötelező a NEXT_PUBLIC_SUPABASE_PROJECT_REF (a teszt Supabase-azonosító).",
  test_site_url_missing: "A teszt-projektben kötelező a NEXT_PUBLIC_SITE_URL (különben a linkek az éles oldalra mutatnának).",
  test_site_url_invalid: "A teszt-projekt NEXT_PUBLIC_SITE_URL értéke nem érvényes https URL.",
  test_site_url_production: "A teszt-projekt NEXT_PUBLIC_SITE_URL értéke az éles VédettSarok domainje.",
  test_app_url_missing: "A teszt-projektben kötelező a NEXT_PUBLIC_APP_URL (különben a meghívólinkek az éles oldalra mutatnának).",
  test_app_url_invalid: "A teszt-projekt NEXT_PUBLIC_APP_URL értéke nem érvényes https URL.",
  test_app_url_production: "A teszt-projekt NEXT_PUBLIC_APP_URL értéke az éles VédettSarok domainje.",
};

/** Önálló teszt Vercel-projekt-e (a VERCEL_ENV értékétől függetlenül). */
export function isTestProject(input: Pick<SupabaseEnvInput, "testSignals" | "projectProductionUrls">): boolean {
  if ((input.testSignals ?? []).some((s) => s?.trim().toLowerCase() === "test")) return true;
  return (input.projectProductionUrls ?? []).some((raw) => {
    const v = raw?.trim().toLowerCase();
    if (!v) return false;
    const host = v.replace(/^https?:\/\//, "").split("/")[0];
    return host === `${TEST_VERCEL_PROJECT_NAME}.vercel.app` || host.startsWith(`${TEST_VERCEL_PROJECT_NAME}-`);
  });
}

export function resolveDeployEnv(signals: Array<string | undefined>): DeployEnv {
  for (const s of signals) {
    const v = s?.trim().toLowerCase();
    if (v === "preview" || v === "production" || v === "development") return v;
  }
  return "unknown";
}

/** JWT payload (csak dekódolás, aláírás-ellenőrzés nélkül); nem JWT → null. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function checkSupabaseEnv(input: SupabaseEnvInput): SupabaseEnvCheck {
  const testMode = isTestProject(input);
  const resolved = resolveDeployEnv(input.signals);
  if (!testMode && resolved !== "preview") return { ok: true, env: resolved };
  const env: "preview" | "test" = testMode ? "test" : "preview";

  const problems: SupabaseEnvProblem[] = [];
  const add = (p: SupabaseEnvProblem) => {
    if (!problems.includes(p)) problems.push(p);
  };

  const url = input.url?.trim() ?? "";
  const anon = input.anonKey?.trim() ?? "";
  const service = input.serviceRoleKey?.trim() ?? "";
  const ref = input.projectRef?.trim() ?? "";

  if ([url, anon, ref, service].some((v) => v.includes(PRODUCTION_SUPABASE_REF))) add("preview_production_ref");

  if (!url) add("preview_url_missing");
  else {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") add("preview_url_invalid");
      else if (u.hostname !== `${PREVIEW_SUPABASE_REF}.supabase.co`) add("preview_url_not_test_project");
    } catch {
      add("preview_url_invalid");
    }
  }

  if (!anon) add("preview_anon_key_missing");
  else if (anon.startsWith("sb_secret_")) add("preview_anon_key_secret");
  else {
    const p = decodeJwtPayload(anon);
    if (p) {
      if (p.role === "service_role") add("preview_anon_key_secret");
      if (p.ref !== PREVIEW_SUPABASE_REF) add("preview_anon_key_wrong_project");
    }
  }

  if (ref && ref !== PREVIEW_SUPABASE_REF) add("preview_project_ref_mismatch");

  // service_role: ha jelen van (csak szerveren lehet), mindig ellenőrizzük;
  // kötelező csak az admin kliensnél.
  if (service) {
    if (service.startsWith("sb_publishable_")) add("preview_service_role_wrong_project");
    const p = decodeJwtPayload(service);
    if (p && (p.ref !== PREVIEW_SUPABASE_REF || p.role !== "service_role")) add("preview_service_role_wrong_project");
  } else if (input.requireServiceRole) {
    add("preview_service_role_missing");
  }

  if (testMode) {
    if (!ref) add("test_project_ref_missing");
    const checkPublicUrl = (
      raw: string | undefined,
      codes: { missing: SupabaseEnvProblem; invalid: SupabaseEnvProblem; production: SupabaseEnvProblem }
    ) => {
      const v = raw?.trim() ?? "";
      if (!v) return add(codes.missing);
      try {
        const u = new URL(v);
        if (u.protocol !== "https:") add(codes.invalid);
        else if (PRODUCTION_SITE_HOSTS.includes(u.hostname.toLowerCase())) add(codes.production);
      } catch {
        add(codes.invalid);
      }
    };
    checkPublicUrl(input.siteUrl, { missing: "test_site_url_missing", invalid: "test_site_url_invalid", production: "test_site_url_production" });
    checkPublicUrl(input.appUrl, { missing: "test_app_url_missing", invalid: "test_app_url_invalid", production: "test_app_url_production" });
  }

  return problems.length ? { ok: false, env, problems } : { ok: true, env };
}

/**
 * A futó környezet beolvasása. A NEXT_PUBLIC_* változókra SZÓ SZERINT
 * hivatkozunk, hogy a Next.js a kliens buildbe is beégesse őket; a nem
 * publikus változók a böngészőben undefined-ok (nem szivárognak).
 */
export function readSupabaseEnv(opts: { withServiceRole?: boolean } = {}): SupabaseEnvInput {
  return {
    signals: [
      process.env.VERCEL_ENV,
      process.env.NEXT_PUBLIC_VERCEL_ENV,
      process.env.VEDETT_DEPLOY_ENV,
      process.env.NEXT_PUBLIC_VEDETT_DEPLOY_ENV,
    ],
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    projectRef: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
    // Nem NEXT_PUBLIC_: a böngészőbe nem kerül be, ott undefined.
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    requireServiceRole: Boolean(opts.withServiceRole),
    testSignals: [process.env.VEDETT_DEPLOY_ENV, process.env.NEXT_PUBLIC_VEDETT_DEPLOY_ENV],
    projectProductionUrls: [
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
    ],
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  };
}

export class SupabaseEnvError extends Error {
  readonly problems: SupabaseEnvProblem[];
  constructor(problems: SupabaseEnvProblem[]) {
    super(`Supabase teszt/Preview-konfiguráció hibás (${problems.join(", ")}) – a kapcsolat letiltva.`);
    this.problems = problems;
    this.name = "SupabaseEnvError";
  }
}

/** Fail closed: hibás Preview-konfigurációnál kivételt dob, mielőtt kliens jönne létre. */
export function assertSupabaseEnv(opts: { withServiceRole?: boolean } = {}): void {
  const res = checkSupabaseEnv(readSupabaseEnv(opts));
  if (!res.ok) throw new SupabaseEnvError(res.problems);
}
