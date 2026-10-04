"use client";

import { trackVedettRouteEvent } from "@/lib/vedett-route/analytics";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeReturnPath } from "@/lib/pwa/safeReturnPath";
import { isNativeCapacitor, startNativeGoogleLogin } from "@/lib/auth/nativeGoogleOAuth";

// `next` NÉLKÜL a viselkedés a normál VédettSarok webes Google belépés
// (VÁLTOZATLAN). `next`-tel (Védett Útvonal /belepes mód):
//  - normál böngésző: ugyanaz a webes OAuth, de a callback a sanitizált
//    next-re tér vissza;
//  - Capacitor natív shell: Browser (Custom Tab) + deep link flow
//    (lib/auth/nativeGoogleOAuth.ts); a WebView SOHA nem navigál a Google-re.
export default function GoogleLoginButton({ next }: { next?: string } = {}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Natív visszatérés: a /auth/callback átirányítás 1-2 mp-ig tart; addig egy
  // egyszerű "Belépés folyamatban…" állapot jelenik meg (nincs villanó /belepes).
  const [returning, setReturning] = useState(false);

  async function handleLogin() {
    trackVedettRouteEvent("login_started", { authState: "anonymous" });
    setErrorMessage(null);
    const supabase = createClient();

    if (next === undefined) {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      return;
    }

    const safeNext = safeReturnPath(next, "/profil");
    if (isNativeCapacitor()) {
      await startNativeGoogleLogin(supabase, {
        next: safeNext,
        onError: setErrorMessage,
        onReturning: () => setReturning(true),
      });
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      },
    });
  }

  return (
    <>
    <button
      onClick={handleLogin}
      className="flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white px-6 py-3.5 text-base font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md active:scale-95"
    >
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden={true}>
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      Belépés Google-fiókkal
    </button>
    {returning && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-white"
        role="status"
        aria-live="polite"
        data-testid="native-login-loading"
      >
        <p className="text-base font-semibold text-gray-700">Belépés folyamatban…</p>
      </div>
    )}
    {errorMessage && (
      <p className="text-sm text-red-600" role="alert">{errorMessage}</p>
    )}
    </>
  );
}
