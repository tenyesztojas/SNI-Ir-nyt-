import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDisplayName } from "@/lib/utils/display-name";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = "https://vedettsarok.hu/api/auth/google";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(`${origin}/belepes?error=google_denied`);
  }

  if (!code) {
    // 1. lépés: átirányítás a Google-re
    const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleUrl.searchParams.set("client_id", CLIENT_ID);
    googleUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    googleUrl.searchParams.set("response_type", "code");
    googleUrl.searchParams.set("scope", "openid email profile");
    googleUrl.searchParams.set("access_type", "offline");
    googleUrl.searchParams.set("prompt", "select_account");
    return NextResponse.redirect(googleUrl.toString());
  }

  // 2. lépés: callback a Google-től
  try {
    // Google access/ID token csere
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) throw new Error("No access token: " + JSON.stringify(tokenData));

    // Google felhasználói adatok
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const googleUser = await userRes.json();

    const email = googleUser.email;
    if (!email) throw new Error("No email from Google");

    // Supabase felhasználó létrehozása / betöltése
    const admin = createAdminClient();
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        data: {
          full_name: googleUser.name,
          avatar_url: googleUser.picture,
          provider: "google",
          email_verified: googleUser.email_verified,
        },
      },
    });
    if (linkError) throw linkError;

    // Session létrehozása szerver oldalon (nincs böngésző navigáció Supabase-re)
    const supabase = createClient();
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyError) throw verifyError;

    // Profil frissítése
    const userId = verifyData.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      const isGenericName =
        !profile?.display_name || /^Felhasznalo\d+$/.test(profile.display_name);
      const payload: Record<string, unknown> = {
        last_login_at: new Date().toISOString(),
        auth_provider: "google",
      };
      if (isGenericName) payload.display_name = generateDisplayName();
      await supabase.from("profiles").update(payload).eq("id", userId);
    }

    return NextResponse.redirect(`${origin}/profil`);
  } catch (err) {
    console.error("Google OAuth hiba:", err);
    return NextResponse.redirect(`${origin}/belepes?error=google_auth_failed`);
  }
}
