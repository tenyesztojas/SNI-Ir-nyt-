// VÉDETT ÚTVONAL NAVIGATION-ONLY PWA sprint (2026-09-21) — dedikált PWA
// start route (/vedett-utvonal/app). SZÁNDÉKOSAN KÜLÖN a normál
// /vedett-utvonal oldaltól (app/vedett-utvonal/page.tsx, VÁLTOZATLAN):
// az itt UGYANAZT a VedettUtvonalWorkspace komponenst és UGYANAZT az
// auth/feature-flag jogosultsági logikát reuse-olja (nincs kódduplikáció
// a navigation/GPS/routing üzleti logikában), csak a shell (Header/Footer
// nélküli, saját manifestű) más.
//
// Auth: UGYANAZ a Supabase session / getCurrentUserAndProfile(), mint a
// normál oldalon — nincs külön PWA-account. Bejelentkezés nélkül a MEGLÉVŐ
// /belepes flow-ra irányít, egy "next" return-URL paraméterrel (lásd
// lib/pwa/safeReturnPath.ts + lib/actions/auth.ts), hogy sikeres belépés
// után a felhasználó VISSZA a PWA shellre kerüljön, ne a normál /profil-ra.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserAndProfile } from "@/lib/data";
import { isVedettRouteFeatureEnabled, VEDETT_ROUTE_ACCESS_LEVEL } from "@/lib/vedett-route/config";
import { hasVedettRouteBetaAccess } from "@/lib/vedett-route/access";
import VedettUtvonalWorkspace from "@/components/vedett-utvonal/VedettUtvonalWorkspace";
import VedettUtvonalPwaShell from "@/components/vedett-utvonal/VedettUtvonalPwaShell";

export const dynamic = "force-dynamic";

// Per-route metadata override — a Next.js App Router metadata rendszere a
// skalár mezőket (manifest, title, icons) a szülő (root) layouthoz képest
// felülírja, NEM mélyen egyesíti — emiatt itt NEM kell a root layout
// public/manifest.json regisztrációját módosítani, a VédettSarok PWA
// identitása változatlan marad minden MÁS route-on.
export const metadata: Metadata = {
  title: "Védett Útvonal",
  manifest: "/manifest-vedett-utvonal.json",
  icons: {
    icon: "/vedett-utvonal-icon-192.png",
    apple: "/vedett-utvonal-icon-192.png",
  },
};

export default async function VedettUtvonalPwaPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/belepes?next=%2Fvedett-utvonal%2Fapp");
  }

  const enabled = isVedettRouteFeatureEnabled();
  const hasLevelAccess: boolean =
    VEDETT_ROUTE_ACCESS_LEVEL === "authenticated_users"
      ? true
      : VEDETT_ROUTE_ACCESS_LEVEL === "beta_testers"
        ? hasVedettRouteBetaAccess(
            profile ? { role: profile.role, pilotAccess: profile.pilotAccess ?? [] } : null
          )
        : profile?.role === "admin";

  // Ugyanaz a kizárási elv, mint a normál oldalon (config.ts / access.ts) —
  // a PWA shell NEM kap külön/lazább jogosultsági szabályt. A normál oldal
  // ilyenkor egy teljes leíró üzenetet renderel; itt, a hely
  // kredittakarékossága miatt, egyszerűen a normál oldalra irányítunk,
  // ahol ez az üzenet MÁR létezik (nincs duplikált szöveg).
  if (!enabled || !hasLevelAccess) {
    redirect("/vedett-utvonal");
  }

  return (
    <VedettUtvonalPwaShell>
      <VedettUtvonalWorkspace disabled={!enabled} initialDestination={null} />
    </VedettUtvonalPwaShell>
  );
}
