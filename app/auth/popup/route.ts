import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateDisplayName } from "@/lib/utils/display-name";

const POPUP_MESSAGE = "supabase:auth_complete";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const user = data.user;
      const isGitHub = user.app_metadata?.provider === "github";

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
        auth_provider: isGitHub ? "github" : "email",
      };

      if (isGitHub && isGenericName) {
        updatePayload.display_name = generateDisplayName();
      }

      await supabase.from("profiles").update(updatePayload).eq("id", user.id);
    }
  }

  // Always: send postMessage to opener and close popup
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script>
  try {
    if (window.opener && window.opener.location.origin === window.location.origin) {
      window.opener.postMessage("${POPUP_MESSAGE}", window.location.origin);
    } else {
      window.location.replace("/profil");
    }
  } catch(e) {
    window.location.replace("/profil");
  }
<\/script>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
