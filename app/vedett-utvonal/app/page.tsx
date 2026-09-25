// /vedett-utvonal/app — korábban a Védett Útvonal NAVIGATION-ONLY PWA
// dedikált start route-ja (lásd a 2026-09-21 sprintet a git historyban).
// A Védett Útvonal PWA-verziót véglegesen elvetettük (natív app jön
// később helyette) — a VedettUtvonalPwaShell komponens és a hozzá tartozó
// saját manifest/service worker (public/manifest-vedett-utvonal.json,
// public/vedett-utvonal-sw.js) törölve lettek.
//
// EZ AZ ÚTVONAL MOSTANTÓL a normál /vedett-utvonal oldalra irányít, ahol
// UGYANAZ a keresés/navigáció (VedettUtvonalWorkspace) elérhető — nincs
// külön PWA shell/UX többé. A route maga megmarad (nem törölve), mert
// külső hivatkozások (pl. components/HeaderClient.tsx VédettSarok PWA ->
// Védett Útvonal handoff linkje) még ide mutatnak.
import { redirect } from "next/navigation";

export default function VedettUtvonalPwaPage() {
  redirect("/vedett-utvonal");
}
