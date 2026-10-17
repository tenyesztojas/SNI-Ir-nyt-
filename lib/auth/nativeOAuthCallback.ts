// VÉDETT ÚTVONAL — iOS NATÍV GOOGLE BELÉPÉS: WebView-n belüli callback
// (2026-10-17, a 13-as build diagnózisa alapján).
//
// MIÉRT KÜLÖN ÚTVONAL: a Capacitor iOS (WebViewDelegationHandler,
// decidePolicyFor) egy fő kerethez tartozó navigációt csak akkor enged a
// WebView-ban, ha a teljes URL a server.url-lel KEZDŐDIK
// (https://www.vedettsarok.hu/vedett-utvonal). A meglévő /auth/callback ezen
// kívül esik, ezért az iOS rendszer-Safariban nyitotta meg — ott nincs meg a
// WebView PKCE code_verifier sütije, így a kódcsere elbukott. Ez az útvonal
// (/vedett-utvonal/auth/callback) és MINDEN átirányítása a /vedett-utvonal
// előtagon belül marad, így a kódcsere és a session-sütik beállítása a natív
// app WebView-jában történik. Android ugyanazt a hosztot alkalmazásnak
// tekinti; az Android és a webes Google-belépés továbbra is a meglévő
// /auth/callback-et használja (VÁLTOZATLAN).
//
// PKCE: a kódcsere a szerveroldali @supabase/ssr klienssel történik, amely a
// kérés sütijeiből olvassa a `<storageKey>-code-verifier` értéket. A
// böngészőoldali createBrowserClient ugyanezt a kulcsot path="/" sütiként
// írta a signInWithOAuth hívásakor, így a WebView ezt az útvonalra is elküldi.
//
// Ez a modul tiszta logika (függőség-injektálással), hogy a route-tól
// függetlenül tesztelhető legyen. A nyers hibaszöveg sosem kerül URL-be.

import { generateDisplayName } from "../utils/display-name.ts";
import {
  NATIVE_IOS_WEBVIEW_CALLBACK_PATH,
  NATIVE_OAUTH_NEXT,
} from "./nativeGoogleOAuth.ts";

export { NATIVE_IOS_WEBVIEW_CALLBACK_PATH };

/** A Capacitor iOS server.url útvonal-előtagja; minden átirányítás ezen belül. */
export const NATIVE_CALLBACK_PREFIX = "/vedett-utvonal";
export const NATIVE_CALLBACK_ERROR_PARAM = "login_error";

export type NativeCallbackErrorCode = "oauth_failed" | "oauth_cancelled";

const KNOWN_OAUTH_PROVIDERS = ["github", "google", "facebook"];
// Ugyanaz a szigorú karakterkészlet, mint a natív deep link elemzésénél.
const CODE_PATTERN = /^[A-Za-z0-9._~-]{8,512}$/;

/**
 * A visszatérési cél: csak a /vedett-utvonal útvonal vagy annak al-útvonala /
 * query-je. Minden más (külső, protokoll-relatív, backslash, vezérlőkarakter,
 * más belső oldal) → /vedett-utvonal.
 */
export function resolveNativeCallbackNext(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return NATIVE_OAUTH_NEXT;
  if (raw.includes("\\") || raw.includes("://") || /[\u0000-\u001f\u007f]/.test(raw)) return NATIVE_OAUTH_NEXT;
  const ok =
    raw === NATIVE_CALLBACK_PREFIX ||
    raw.startsWith(`${NATIVE_CALLBACK_PREFIX}/`) ||
    raw.startsWith(`${NATIVE_CALLBACK_PREFIX}?`);
  if (!ok) return NATIVE_OAUTH_NEXT;
  // Ne térjen vissza magára a callbackre (végtelen hurok / kódismétlés ellen).
  if (raw === NATIVE_IOS_WEBVIEW_CALLBACK_PATH || raw.startsWith(`${NATIVE_IOS_WEBVIEW_CALLBACK_PATH}?`) || raw.startsWith(`${NATIVE_IOS_WEBVIEW_CALLBACK_PATH}/`)) {
    return NATIVE_OAUTH_NEXT;
  }
  return raw;
}

/** Sikertelen / megszakított belépés: a Védett Útvonal oldal, ismert hibakóddal. */
export function nativeCallbackErrorPath(code: NativeCallbackErrorCode): string {
  return `${NATIVE_CALLBACK_PREFIX}?${NATIVE_CALLBACK_ERROR_PARAM}=${code}`;
}

export interface OAuthUserLike {
  id: string;
  email?: string | null;
  app_metadata?: { provider?: string } | null;
}

export interface NativeCallbackDeps {
  exchangeCodeForSession: (code: string) => Promise<{
    data: { user: OAuthUserLike | null } | null;
    error: unknown;
  }>;
  /** A belépés utáni profilfrissítés (last_login_at stb.). Hibája nem buktatja a belépést. */
  updateProfileAfterLogin?: (user: OAuthUserLike) => Promise<void>;
}

/**
 * A callback kérés feldolgozása. Visszatérési érték: az ABSZOLÚT átirányítási
 * cél, amely mindig a kérés origin-jén és a /vedett-utvonal előtagon belül van.
 */
export async function handleNativeOAuthCallback(
  requestUrl: string,
  deps: NativeCallbackDeps
): Promise<string> {
  const url = new URL(requestUrl);
  const origin = url.origin;
  const toAbsolute = (path: string) => `${origin}${path}`;

  const providerError = url.searchParams.get("error");
  if (providerError) {
    return toAbsolute(
      nativeCallbackErrorPath(providerError === "access_denied" ? "oauth_cancelled" : "oauth_failed")
    );
  }

  const code = url.searchParams.get("code");
  if (!code || !CODE_PATTERN.test(code)) {
    return toAbsolute(nativeCallbackErrorPath("oauth_failed"));
  }

  let user: OAuthUserLike | null = null;
  try {
    const { data, error } = await deps.exchangeCodeForSession(code);
    user = !error && data?.user ? data.user : null;
  } catch {
    user = null;
  }
  if (!user) return toAbsolute(nativeCallbackErrorPath("oauth_failed"));

  if (deps.updateProfileAfterLogin) {
    try {
      await deps.updateProfileAfterLogin(user);
    } catch {
      // A session már létrejött; a profil-metaadat frissítése nem kritikus.
    }
  }

  return toAbsolute(resolveNativeCallbackNext(url.searchParams.get("next")));
}

// A Supabase kliens minimális, itt használt felülete (tesztelhetőség miatt).
interface ProfilesTable {
  select: (cols: string) => {
    eq: (col: string, val: string) => { maybeSingle: () => PromiseLike<{ data: { display_name?: string | null } | null }> };
  };
  update: (payload: Record<string, unknown>) => { eq: (col: string, val: string) => PromiseLike<unknown> };
}
export interface ProfileClientLike {
  from: (table: "profiles") => ProfilesTable;
}

/**
 * Ugyanaz a profilfrissítés, mint a meglévő /auth/callback-ben (last_login_at,
 * auth_provider, generikus név cseréje álnévre OAuth esetén).
 */
export async function updateOAuthProfile(supabase: ProfileClientLike, user: OAuthUserLike): Promise<void> {
  const rawProvider = user.app_metadata?.provider;
  const provider = KNOWN_OAUTH_PROVIDERS.includes(rawProvider ?? "") ? (rawProvider as string) : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const isGenericName =
    !profile?.display_name ||
    /^Felhasznalo\d+$/.test(profile.display_name) ||
    profile.display_name === user.email?.split("@")[0];

  const updatePayload: Record<string, unknown> = {
    last_login_at: new Date().toISOString(),
    auth_provider: provider ?? "email",
  };
  if (provider && isGenericName) {
    updatePayload.display_name = generateDisplayName();
  }

  await supabase.from("profiles").update(updatePayload).eq("id", user.id);
}
