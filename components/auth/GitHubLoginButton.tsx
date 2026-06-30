"use client";

import { createClient } from "@/lib/supabase/client";
import { Github } from "lucide-react";

export default function GitHubLoginButton() {
  async function handleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <button
      onClick={handleLogin}
      className="flex w-full items-center justify-center gap-3 rounded-full bg-gray-900 px-6 py-3.5 text-base font-bold text-white shadow-md transition-all duration-200 hover:bg-gray-700 hover:shadow-lg active:scale-95"
    >
      <Github size={20} />
      Belépés GitHub-fiókkal
    </button>
  );
}
