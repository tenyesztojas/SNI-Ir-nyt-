// FEJLESZTŐI TESZT-HARNESS — iOS navigációs elrendezés (Playwright / iOS-szimulátor).
// Útvonal: /vu-nav-layout-harness (route group, a meglévő app/dev/ mappától külön).
// MINDEN környezetben 404, kivéve ha VU_LAYOUT_HARNESS=1 (csak a CI-futtatón); a Vercel production környezetben akkor is 404. Nincs auth, nincs
// adatbázis: a keresési API-t a teszt mockolja. NEM éles funkció.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Harness from "./Harness";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Page() {
  // Kétszeres védelem: a route group önmagában NEM véd. Az oldal MINDEN
  // környezetben 404, hacsak a szerveroldali VU_LAYOUT_HARNESS=1 nincs
  // kifejezetten beállítva (csak a szimulátoros CI-futtató állítja be);
  // productionben ráadásul a NODE_ENV-ellenőrzés is kizárja.
  if (process.env.VU_LAYOUT_HARNESS !== "1") notFound();
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production") notFound();
  return <Harness />;
}
