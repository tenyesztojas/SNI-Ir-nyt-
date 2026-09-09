// /vedett-utvonal — Védett Útvonal ZÁRT BÉTA, publikus (nem /admin alatti)
// oldal a menürendszerbe integrált verzióhoz (2026-09-09).
//
// SZÁNDÉKOSAN KÜLÖN oldal az /admin/vedett-utvonal-tól: EZ az oldal a
// bejelentkezett admin/béta-tesztelő felhasználóknak szól, és KIZÁRÓLAG a
// keresési/útvonaltervezési felületet (VedettUtvonalSearchForm — ami
// magában foglalja a megosztott térképet, GPS/"Aktuális helyzetem" origint,
// pihenőpont-discovery-t, route-to-rest-point-ot és a resume flow-t) adja
// oda. A GTFS feltöltő és a diagnosztikai státusz-panel ADMIN-ONLY marad,
// azok TOVÁBBRA IS kizárólag az /admin/vedett-utvonal oldalon érhetők el —
// ezt az oldalt szándékosan NEM bővítjük azokkal.
//
// SZERVER OLDALI VÉDELEM (Section 8, "Ne csak CSS-sel rejtsd el"):
// - Nincs bejelentkezve → redirect("/belepes") — ugyanaz a bejelentkezési
//   útvonal, amit a HeaderClient "Belépés" gombja is használ.
// - Bejelentkezve, de nincs jogosultsága (nem admin ÉS nincs
//   `vedett_route_beta` pilot_access grant) → 403-ekvivalens app-szintű
//   üzenet, NEM redirect — így a felhasználó érti, MIÉRT nem fér hozzá,
//   ahelyett hogy csak visszadobná a főoldalra.
// - VEDETT_ROUTE_ENABLED=false → a globális kill switch mindenkit (adminot
//   is) kizár, ugyanazzal az üzenettel mint egy jogosultság nélküli
//   felhasználó esetén, hogy ne szivárogtassa ki, hogy a funkció egyébként
//   élesítve van-e valakinek.
//
// Ez a check UGYANAZT a hasVedettRouteBetaAccess()-t hívja, mint a
// lib/vedett-route/access.ts requireVedettRouteBetaAccess() az API
// route-okon — nincs duplikált jogosultsági logika, csak a válasz formája
// más (redirect/JSX itt, JSON válasz ott).

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/data";
import { isVedettRouteFeatureEnabled } from "@/lib/vedett-route/config";
import { hasVedettRouteBetaAccess } from "@/lib/vedett-route/access";
import VedettUtvonalSearchForm from "@/components/vedett-utvonal/VedettUtvonalSearchForm";

// Lásd app/admin/vedett-utvonal/page.tsx fejlécét — ugyanaz a build-time
// hálózati hívás elleni védelem indokolja itt is a force-dynamic-ot: a
// VedettUtvonalSearchForm kliens komponens, de az oldal maga a
// jogosultsági ellenőrzést mindig futásidőben, nem build időben kell,
// hogy elvégezze (a felhasználó session-je csak runtime-ban ismert).
export const dynamic = "force-dynamic";

export default async function VedettUtvonalPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/belepes");
  }

  const enabled = isVedettRouteFeatureEnabled();
  const allowed =
    enabled &&
    hasVedettRouteBetaAccess(
      profile ? { role: profile.role, pilotAccess: profile.pilotAccess ?? [] } : null
    );

  if (!allowed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-bold text-sni-text">Nincs hozzáférésed ehhez a béta funkcióhoz.</h1>
        <p className="mt-3 text-gray-600">
          A Védett Útvonal jelenleg zárt béta tesztelés alatt áll, és csak meghívott
          tesztelők számára érhető el.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-sni-brand-blue hover:underline">
          ← Vissza a főoldalra
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-sni-text">Védett Útvonal</h1>
        <span className="rounded bg-sni-brand-teal/15 px-2 py-1 text-xs font-semibold text-sni-brand-teal">
          BÉTA
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        A Védett Útvonal jelenleg tesztelés alatt áll. Az útvonal- és pihenőpont-adatok
        pontatlanok lehetnek.
      </p>

      <div className="mt-6">
        <VedettUtvonalSearchForm disabled={!enabled} />
      </div>
    </div>
  );
}
