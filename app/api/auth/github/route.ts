import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDisplayName } from "@/lib/utils/display-name";

const CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(`${origin}/belepes?error=github_denied`);
  }

  if (!code) {
    // 1. lazep: atiranyitas a GitHub-ra
    const redirectUri = `${origin}/api/auth/github`;
    const githubUrl = new URL("https://github.com/login/oauth/authorize");
    githubUrl.searchParams.set("client_id", CLIENT_ID);
    githubUrl.searchParams.set("redirect_uri", redirectUri);
    githubUrl.searchParams.set("scope", "user:email");
    return NextResponse.redirect(githubUrl.toString());
  }

  // 2. lazep: callback a GitHub-tol
  try {
    const redirectUri = `${origin}/api/auth/github`;

    // GitHub access token csere
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, redirect_uri: redirectUri }),
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) throw new Error("No access token");

    // GitHub felhasznalo adatok
    const [userRes, emailsRes] = await Promise.all([
      fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }),
      fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }),
    ]);
    const githubUser = await userRes.json();
    const emails: { email: string; primary: boolean; verified: boolean }[] = await emailsRes.json();
    const primaryEmail = emails.find((e) => e.primary && e.verified)?.email ?? githubUser.email;
    if (!primaryEmail) throw new Error("No email");

    // Supabase felhasznalo letrehozasa / betoltese
    const admin = createAdminClient();
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: primaryEmail,
      options: {
        data: {
          full_name: githubUser.name ?? githubUser.login,
          avatar_url: githubUser.avatar_url,
          provider: "github",
          github_login: githubUser.login,
        },
      },
    });
    if (linkError) throw linkError;

    // Session letrehozasa szerver oldalon (nincs bongeszo navigacio Supabase-re)
    const supabase = createClient();
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyError) throw verifyError;

    // Profil frissitese
    const userId = verifyData.user?.id;
    if (userId) {
      const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
      const isGenericName = !profile?.display_name || /^Felhasznalo\d+$/.test(profile.display_name);
      const payload: Record<string, unknown> = { last_login_at: new Date().toISOString(), auth_provider: "github" };
      if (isGenericName) payload.display_name = generateDisplayName();
      await supabase.from("profiles").update(payload).eq("id", userId);
    }

    return NextResponse.redirect(`${origin}/profil`);
  } catch (err) {
    console.error("GitHub OAuth hiba:", err);
    return NextResponse.redirect(`${origin}/belepes?error=github_auth_failed`);
  }
}
