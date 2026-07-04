"use client";

import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const POPUP_MESSAGE = "supabase:auth_complete";

export function useOAuthPopup() {
  const router = useRouter();

  const openOAuthPopup = useCallback(async (provider: "github" | "google") => {
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?popup=1`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      console.error("OAuth hiba:", error);
      return;
    }

    const width = 600;
    const height = 700;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

    const popup = window.open(
      data.url,
      "oauth-popup",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );

    if (!popup) {
      // Popup blokkolt - fallback redirect
      window.location.href = data.url;
      return;
    }

    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data !== POPUP_MESSAGE) return;
      window.removeEventListener("message", onMessage);
      popup?.close();
      router.push("/profil");
      router.refresh();
    }

    window.addEventListener("message", onMessage);

    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        window.removeEventListener("message", onMessage);
      }
    }, 500);
  }, [router]);

  return { openOAuthPopup };
}
