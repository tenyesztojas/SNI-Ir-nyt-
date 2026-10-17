import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  handleNativeOAuthCallback,
  updateOAuthProfile,
  type ProfileClientLike,
} from "@/lib/auth/nativeOAuthCallback";

// VÉDETT ÚTVONAL — iOS natív Google belépés WebView-n belüli callbackje.
// Részletek: lib/auth/nativeOAuthCallback.ts. Csak a natív iOS
// ASWebAuthenticationSession út használja; a webes és az Android Google-belépés
// a meglévő /auth/callback-en marad. Minden átirányítás a /vedett-utvonal
// előtagon belül marad, így a Capacitor iOS a WebView-ban tartja.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = createClient();
  const target = await handleNativeOAuthCallback(request.url, {
    // A szerveroldali kliens a kérés sütijeiből olvassa a PKCE code_verifiert,
    // és a session-sütiket a válaszra írja (ugyanaz, mint a /auth/callback-ben).
    exchangeCodeForSession: (code) => supabase.auth.exchangeCodeForSession(code),
    updateProfileAfterLogin: (user) =>
      updateOAuthProfile(supabase as unknown as ProfileClientLike, user),
  });
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
