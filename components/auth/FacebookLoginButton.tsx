"use client";

import { createClient } from "@/lib/supabase/client";

export default function FacebookLoginButton() {
  async function handleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <button
      onClick={handleLogin}
      className="flex w-full items-center justify-center gap-3 rounded-full bg-[#1877F2] px-6 py-3.5 text-base font-bold text-white shadow-sm transition-all duration-200 hover:bg-[#166FE5] hover:shadow-md active:scale-95"
    >
      {/* Facebook f logo */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
      Belépés Facebook-fiókkal
    </button>
  );
}
