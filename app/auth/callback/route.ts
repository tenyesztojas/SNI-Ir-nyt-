import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateDisplayName } from "@/lib/utils/display-name";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const user = data.user;
      const isGitHub = user.app_metadata?.provider === "github";

      // Meglévő profil lekérése
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      // GitHub-felhasználóknál a trigger generic "FelhasználóXXXXX" nevet ad;
      // cseréljük le szép pseudonym névre az első belépéskor.
      const isGenericName =
        !profile?.display_name ||
        /^Felhasználó\d+$/.test(profile.display_name) ||
        profile.display_name === user.email?.split("@")[0];

      const updatePayload: Record<string, unknown> = {
        last_login_at: new Date().toISOString(),
        auth_provider: isGitHub ? "github" : "email",
      };

      if (isGitHub && isGenericName) {
        updatePayload.display_name = generateDisplayName();
      }

      await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", user.id);
    }
  }

  // Sikeres belépés → profil oldal; hiba → belépési oldal
  return NextResponse.redirect(`${origin}/profil`);
}
