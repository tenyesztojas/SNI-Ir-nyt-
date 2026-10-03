// Védett Útvonal — server-side authorization helper.
//
// Ugyanazt a mintát követi, mint a projekt meglévő admin API route-jai
// (lásd app/api/admin/pwa-stats/route.ts, app/api/admin/programok/[id]/route.ts):
// 1) supabase.auth.getUser() — van-e bejelentkezett felhasználó,
// 2) profiles.role === "admin" — a service-role kliensen keresztül, hogy
//    RLS ne torzítsa el az eredményt.
//
// Ezt a helpert kell hívnia MINDEN Védett Útvonal API route-nak, mielőtt
// bármilyen adatot visszaadna. Nem admin / nincs bejelentkezve esetén 403-at
// ad vissza — sosem 200-at "üres" adattal, mert az szivárogtatná a funkció
// létezését.

import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isVedettRouteFeatureEnabled, VEDETT_ROUTE_ACCESS_LEVEL, VEDETT_ROUTE_BETA_FEATURE_KEY } from "./config.ts";
import { decideVedettRouteAccess, vedettRouteDecisionNeedsProfile, type VedettRouteActor, type VedettRouteDecision, type VedettRouteRequirement } from "./accessPolicy.ts";
import { rateLimiter } from "@/lib/rate-limit";

export type VedettRouteAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * ZÁRT BÉTA HOZZÁFÉRÉS (2026-09-09) — tiszta, side-effect mentes döntési
 * függvény: admin VAGY a `pilot_access` tömbben szereplő explicit
 * `vedett_route_beta` grant. Szándékosan KÜLÖN van választva a hálózati/DB
 * hívástól (lásd requireVedettRouteBetaAccess() lent), hogy unit tesztekkel
 * DB/HTTP nélkül, determinisztikusan lefedhető legyen — pontosan úgy, mint
 * a projekt már meglévő pure reducerei (pl. restStopFlow/stateMachine.ts).
 *
 * Admin BYPASSOLJA a grant szükségességét (nincs külön tesztjog kell neki),
 * de ez a függvény MAGA NEM dönt a globális VEDETT_ROUTE_ENABLED kill
 * switch-ről — azt a hívó (requireVedettRouteAccess()) ellenőrzi külön,
 * ELŐBB, hogy admin se juthasson át rajta, ha a funkció ki van kapcsolva.
 */
export function hasVedettRouteBetaAccess(profile: { role?: string | null; pilotAccess?: string[] | null } | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  const pilotAccess = profile.pilotAccess ?? [];
  return pilotAccess.includes(VEDETT_ROUTE_BETA_FEATURE_KEY);
}

/**
 * Csak azt ellenőrzi, hogy a hívó bejelentkezett admin-e. Nem nézi a feature
 * flaget — ezt szándékosan különítjük el, hogy az admin diagnosztikai
 * (státusz) végpont akkor is elérhető legyen adminnak, ha a flag ki van
 * kapcsolva (különben soha nem lehetne látni, MIÉRT nem működik a funkció).
 */
export async function requireVedettRouteAdmin(): Promise<VedettRouteAuthResult> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id };
}

/**
 * Csak azt ellenőrzi, hogy van-e bejelentkezett felhasználó — admin-szerep
 * NÉLKÜL. Ez a jövőbeli "authenticated_users" hozzáférési szint alapja
 * (Map/GPS/Rest Points sprint, 2026-09-07): amikor a Védett Útvonal
 * bármelyik bejelentkezett felhasználónak elérhető lesz, ez a check fut
 * requireVedettRouteAdmin() helyett. JELENLEG NEM AKTÍV (lásd config.ts
 * VEDETT_ROUTE_ACCESS_LEVEL, ami még "admin_only").
 */
export async function requireVedettRouteAuthenticated(): Promise<VedettRouteAuthResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, userId: user.id };
}

/**
 * ZÁRT BÉTA HOZZÁFÉRÉS (2026-09-09) — bejelentkezett felhasználó ÉS
 * (admin VAGY explicit `vedett_route_beta` pilot_access grant). Ezt hívja
 * requireVedettRouteAccess(), amikor VEDETT_ROUTE_ACCESS_LEVEL ===
 * "beta_testers" (jelenleg ez az aktív érték, lásd config.ts).
 *
 * A profilt (role + pilot_access) a service-role kliensen keresztül
 * olvassuk (createAdminClient()), UGYANÚGY, mint requireVedettRouteAdmin()
 * — így az RLS nem torzíthatja el az eredményt, és ez a check a Postgres
 * felé egyetlen, kis lekérdezés (nem duplikálja a role-t egy külön
 * hívásban).
 */
export async function requireVedettRouteBetaAccess(): Promise<VedettRouteAuthResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, pilot_access")
    .eq("id", user.id)
    .single();

  const allowed = hasVedettRouteBetaAccess(
    profile ? { role: profile.role, pilotAccess: (profile.pilot_access as string[] | null) ?? [] } : null
  );

  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden", message: "Nincs hozzáférésed ehhez a béta funkcióhoz." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: user.id };
}

/**
 * Admin/béta-tesztelő ÉS feature flag ellenőrzés együtt — ezt kell hívnia
 * minden funkcionális (nem diagnosztikai) Védett Útvonal végpontnak:
 * keresés, pihenőpont-discovery, route-to-rest-point, resume, saját
 * pihenőpont CRUD, GTFS frissítés, stb. EGYETLEN közös guard — a route-ok
 * NEM duplikálják ezt a logikát (lásd docs/vedett-route.md és az egyes
 * route.ts fájlok fejlécét).
 *
 * A tényleges jogosultsági szabály a config.ts VEDETT_ROUTE_ACCESS_LEVEL
 * értékétől függ (jelenleg "beta_testers") — ez a felkészítés arra, hogy
 * később egyetlen konstans váltásával "authenticated_users"-re (vagy akár
 * "public"-ra) válthassunk, anélkül, hogy minden egyes API route-ot át
 * kellene írni.
 *
 * FONTOS SORREND: a globális VEDETT_ROUTE_ENABLED kill switch-et LENTEBB,
 * az auth/permission check UTÁN ellenőrizzük — ez szándékos: így a
 * "Forbidden" (nincs jogosultságod) válasz mindig ugyanaz marad attól
 * függetlenül, hogy a flag be van-e kapcsolva, ami NEM szivárogtatja ki
 * jogosultság nélküli hívó felé, hogy a funkció egyébként élesítve
 * van-e. Admin a kill switch-et NEM bypassolja — ha VEDETT_ROUTE_ENABLED
 * hamis, MÉG az admin/tesztelő check sikere esetén is "Feature disabled"
 * választ kap.
 */
export async function requireVedettRouteAccess(): Promise<VedettRouteAuthResult> {
  // "public" szint: a PUBLIKUS ÁG (requireVedettRoutePublicRead) csak az
  // alap, csak-olvasó végpontokat nyitja meg anonimnak. EZ a guard a
  // felhasználó-specifikus perzisztencia/írás végpontoké (kedvencek, saját
  // pihenőpont CRUD) — ott "public" szinten is bejelentkezés kell, ezért
  // "public" ide az authenticated_users ágra esik (SOSEM az admin
  // fallbackre, SOSEM anonim átengedésre).
  const authCheck =
    VEDETT_ROUTE_ACCESS_LEVEL === "public" || VEDETT_ROUTE_ACCESS_LEVEL === "authenticated_users"
      ? await requireVedettRouteAuthenticated()
      : VEDETT_ROUTE_ACCESS_LEVEL === "beta_testers"
        ? await requireVedettRouteBetaAccess()
        : await requireVedettRouteAdmin();
  if (!authCheck.ok) return authCheck;

  if (!isVedettRouteFeatureEnabled()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Feature disabled", message: "A Védett Útvonal funkció jelenleg ki van kapcsolva." },
        { status: 403 }
      ),
    };
  }

  return authCheck;
}

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC READ + ADMIN OPERATION guardok (2026-10-03, "public read-only
// routing + admin endpoint hardening" feladat). A döntési szabály EGY
// helyen él (accessPolicy.ts, DB-mentesen tesztelve) — ezek a guardok csak
// betöltik a hívót (session + szükség esetén profil) és HTTP-válasszá
// alakítják a döntést.
// ────────────────────────────────────────────────────────────────────────────

async function loadActor(needProfile: boolean): Promise<VedettRouteActor | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!needProfile) return { userId: user.id, role: null, pilotAccess: [] };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, pilot_access").eq("id", user.id).single();
  return {
    userId: user.id,
    role: (profile?.role as string | null | undefined) ?? null,
    pilotAccess: ((profile?.pilot_access as string[] | null | undefined) ?? []),
  };
}

function decisionToFailure(decision: Extract<VedettRouteDecision, { allow: false }>): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json(decision.body, { status: decision.status }) };
}

async function resolveRequirement(requirement: VedettRouteRequirement): Promise<VedettRouteDecision> {
  const actor = await loadActor(vedettRouteDecisionNeedsProfile(VEDETT_ROUTE_ACCESS_LEVEL, requirement));
  return decideVedettRouteAccess({
    level: VEDETT_ROUTE_ACCESS_LEVEL,
    featureEnabled: isVedettRouteFeatureEnabled(),
    actor,
    requirement,
  });
}

/** Kliens-IP a rate limithez — ugyanaz a forrás, mint a middleware.ts getClientIp(). */
export function getVedettRouteClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export interface VedettRouteAnonymousRateLimit {
  label: string;
  limit: number;
  windowMs: number;
}

export type VedettRoutePublicAuthResult =
  | { ok: true; userId: string | null }
  | { ok: false; response: NextResponse };

/**
 * ALAP, CSAK-OLVASÓ funkciók guardja (útvonalkeresés, címkeresés, gyaloglás/
 * autós útvonal, pihenőpont-KERESÉS, valós idejű frissítés). "public" szinten
 * ANONIM is átjut — ilyenkor userId === null (nincs kitalált azonosító), és
 * a megadott anonim PER-IP rate limit érvényes (a meglévő rateLimiter-rel,
 * a middleware.ts-ben is használt `rl:<label>:<ip>` kulcs-mintával). A
 * bejelentkezett felhasználók korlátai VÁLTOZATLANOK (itt nincs rájuk új
 * limit). Felhasználó-specifikus írásra/perzisztenciára SOHA ne ezt
 * használd — arra requireVedettRouteAccess() való.
 */
export async function requireVedettRoutePublicRead(
  request: Request,
  anonymousRateLimit?: VedettRouteAnonymousRateLimit
): Promise<VedettRoutePublicAuthResult> {
  const decision = await resolveRequirement("public_read");
  if (!decision.allow) return decisionToFailure(decision);

  if (decision.userId === null && anonymousRateLimit) {
    const key = `rl:vedett-route-anon:${anonymousRateLimit.label}:${getVedettRouteClientIp(request)}`;
    const result = await rateLimiter.check(key, anonymousRateLimit.limit, anonymousRateLimit.windowMs);
    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "Túl sok kérés. Próbáld újra később." },
          { status: 429, headers: { "Retry-After": String(retryAfter > 0 ? retryAfter : 60) } }
        ),
      };
    }
  }

  return { ok: true, userId: decision.userId };
}

/**
 * OPERATÍV/ADMIN végpontok guardja (GTFS feltöltés/frissítés): kizárólag
 * profiles.role === "admin" (anonim -> 401, nem-admin user -> 403), a
 * hozzáférési szinttől és az útvonal nevétől FÜGGETLENÜL, plusz a
 * VEDETT_ROUTE_ENABLED kill switch (mint korábban). Az admin diagnosztikai
 * státusz végpont szándékosan a kill switch-től független
 * requireVedettRouteAdmin()-t használja.
 */
export async function requireVedettRouteAdminOperation(): Promise<VedettRouteAuthResult> {
  const decision = await resolveRequirement("admin");
  if (!decision.allow) return decisionToFailure(decision);
  return { ok: true, userId: decision.userId as string };
}
