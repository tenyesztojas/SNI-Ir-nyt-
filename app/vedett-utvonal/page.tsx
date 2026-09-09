// /vedett-utvonal — Védett Útvonal PUBLIKUS, REGISZTRÁLT FELHASZNÁLÓI BÉTA
// (2026-09-09, korábbi zárt béta szakasz után), publikus (nem /admin alatti)
// oldal a menürendszerbe integrált verzióhoz.
//
// SZÁNDÉKOSAN KÜLÖN oldal az /admin/vedett-utvonal-tól: EZ az oldal
// BÁRMELY bejelentkezett, regisztrált felhasználónak szól, és KIZÁRÓLAG a
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
// - Bejelentkezve → hozzáfér (NEM kell admin szerep vagy `vedett_route_beta`
//   pilot_access grant többé — a korábbi zárt béta grant-ellenőrzés
//   lezárult, lásd config.ts VEDETT_ROUTE_ACCESS_LEVEL).
// - VEDETT_ROUTE_ENABLED=false → a globális kill switch MINDENKIT
//   (bejelentkezett, admin is) kizár, ugyanazzal az üzenettel, hogy ne
//   szivárogtassa ki, hogy a funkció egyébként élesítve van-e valakinek.
//
// Ez a check UGYANAZT a VEDETT_ROUTE_ACCESS_LEVEL háromágú modellt követi,
// mint a lib/vedett-route/access.ts requireVedettRouteAccess() az API
// route-okon — nincs duplikált/párhuzamos jogosultsági rendszer, csak a
// válasz formája más (redirect/JSX itt, JSON válasz ott). A "beta_testers"
// és "admin_only" ágak a switch-ben megmaradnak (a grant/admin infrastruktúra
// nem törlődik), de jelenleg az "authenticated_users" ág aktív.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/data";
import { isVedettRouteFeatureEnabled, VEDETT_ROUTE_ACCESS_LEVEL } from "@/lib/vedett-route/config";
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

  // Ugyanaz a háromágú döntés, mint access.ts requireVedettRouteAccess()-ben
  // (nem hozunk létre új/párhuzamos jogosultsági rendszert, csak a szerver
  // komponens JSX-válaszához szükséges boolean formában ismételjük meg):
  //   authenticated_users -> a fent már ellenőrzött bejelentkezés elég
  //   beta_testers         -> hasVedettRouteBetaAccess() (admin VAGY grant)
  //   egyéb (admin_only)    -> csak admin
  const hasLevelAccess: boolean =
    VEDETT_ROUTE_ACCESS_LEVEL === "authenticated_users"
      ? true
      : VEDETT_ROUTE_ACCESS_LEVEL === "beta_testers"
        ? hasVedettRouteBetaAccess(
            profile ? { role: profile.role, pilotAccess: profile.pilotAccess ?? [] } : null
          )
        : profile?.role === "admin";

  const allowed = enabled && hasLevelAccess;

  if (!allowed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-bold text-sni-text">A Védett Útvonal funkció jelenleg ki van kapcsolva.</h1>
        <p className="mt-3 text-gray-600">
          A Védett Útvonal (BÉTA) funkció jelenleg nem elérhető. Nézz vissza később.
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
