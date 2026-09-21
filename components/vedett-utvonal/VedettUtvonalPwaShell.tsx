"use client";

// VÉDETT ÚTVONAL NAVIGATION-ONLY PWA sprint (2026-09-21), 3. pont —
// vékony shell, ami a MEGLÉVŐ Védett Útvonal UI-t (children, lásd
// app/vedett-utvonal/app/page.tsx) reuse-olja, Header/Footer/site-navigáció
// NÉLKÜL. A Header/Footer/PWAInstallBanner/PWASessionTracker elrejtése
// LAYOUT SZINTEN, app/layout.tsx-ben történik (middleware x-pathname
// header alapján) — ez a komponens csak a Védett Útvonal-specifikus
// branding sávot és a saját install-CTA-t/analytics-ot adja hozzá.

import Link from "next/link";
import { signOutAction } from "@/lib/actions/auth";
import VedettUtvonalPwaInstall from "./VedettUtvonalPwaInstall";
import VedettUtvonalPwaAnalytics from "./VedettUtvonalPwaAnalytics";

export default function VedettUtvonalPwaShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <VedettUtvonalPwaAnalytics />
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <Link href="/vedett-utvonal/app" className="flex items-center gap-2">
          <img src="/vedett-utvonal-logo-icon.png" alt="" aria-hidden="true" className="h-7 w-auto" />
          <img src="/vedett-utvonal-wordmark.png" alt="Védett Útvonal" className="h-[15px] w-auto" />
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="text-xs font-semibold text-gray-500 hover:text-gray-700">
            Kilépés
          </button>
        </form>
      </header>
      <VedettUtvonalPwaInstall />
      <main className="flex-1">{children}</main>
    </div>
  );
}
