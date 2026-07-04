"use client";

import { Github } from "lucide-react";
import { useOAuthPopup } from "@/hooks/useOAuthPopup";

export default function GitHubLoginButton() {
  const { openOAuthPopup } = useOAuthPopup();

  return (
    <button
      onClick={() => openOAuthPopup("github")}
      className="flex w-full items-center justify-center gap-3 rounded-full bg-gray-900 px-6 py-3.5 text-base font-bold text-white shadow-md transition-all duration-200 hover:bg-gray-700 hover:shadow-lg active:scale-95"
    >
      <Github size={20} />
      Belépés GitHub-fiókkal
    </button>
  );
}
