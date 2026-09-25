// /vedett-utvonal — Védett Útvonal PUBLIKUS BEMUTATÓ + BEJELENTKEZETT
// FELHASZNÁLÓI FUNKCIÓ (2026-09-23 frissítés).
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
// PUBLIKUS BEMUTATÓ (2026-09-23): a Védett Útvonal nincs elrejtve a
// kijelentkezett/nem regisztrált látogatók elől — ők most egy valódi
// funkcióbemutató (hero + funkciólista + CTA) oldalt kapnak, NEM redirectet
// loginra. A tényleges keresés/navigáció (VedettUtvonalWorkspace) TOVÁBBRA
// IS csak bejelentkezve érhető el. A CTA ("Útvonaltervezés indítása")
// bejelentkezve egyenesen a keresőt mutatja, kijelentkezve a meglévő
// /belepes?next=... mintát használja (lásd pl. app/vedett-karrier/*),
// hogy sikeres belépés/regisztráció után visszatérjen ide.
//
// SZERVER OLDALI VÉDELEM (Section 8, "Ne csak CSS-sel rejtsd el") —
// VÁLTOZATLAN, csak az anonim ág UI-ja változott:
// - Nincs bejelentkezve → a nyilvános bemutató JSX-e renderelődik (NEM a
//   VedettUtvonalWorkspace kereső). Az anonim felhasználó a kereső
//   komponenst egyáltalán nem kapja meg a szerver válaszban.
// - Bejelentkezve → hozzáfér (NEM kell admin szerep vagy `vedett_route_beta`
//   pilot_access grant többé — a korábbi zárt béta grant-ellenőrzés
//   lezárult, lásd config.ts VEDETT_ROUTE_ACCESS_LEVEL).
// - VEDETT_ROUTE_ENABLED=false → a globális kill switch MINDENKIT
//   (bejelentkezett, admin, anonim is) kizár, ugyanazzal az üzenettel.
//
// Ez a check UGYANAZT a VEDETT_ROUTE_ACCESS_LEVEL háromágú modellt követi,
// mint a lib/vedett-route/access.ts requireVedettRouteAccess() az API
// route-okon — nincs duplikált/párhuzamos jogosultsági rendszer, csak a
// válasz formája más (JSX itt, JSON válasz ott). Az API route-ok MINDEGYIKE
// saját maga hívja a requireVedettRouteAccess()/requireVedettRoute*
// guardokat is — az itteni oldal-szintű JSX-ág tehát NEM az egyetlen
// védelmi vonal, csak a felhasználói élmény része; a tényleges adatlekérés
// bejelentkezés nélkül minden esetben 401/403-at ad.
//
// DEEP LINK (Védett Hely "Navigálj oda" integráció, 2026-09-09): az oldal
// mostantól ?name=...&lat=...&lon=... query paraméterekből előre kitöltött
// úti célt fogadhat el (lásd components/NavigateButton.tsx és
// app/helyek/[slug]/page.tsx, ahol a link összeáll). A query paramétereket
// a lib/vedett-route/schemas.ts routeDestinationDeepLinkSchema-jával
// (a MEGLÉVŐ latitude/longitude séma alapján) validáljuk — érvénytelen
// vagy hiányzó adat esetén csendben null-ra esik vissza (normál, üres
// kereső, SOSEM crash). A `searchParams` prop szinkron objektum, ugyanúgy,
// mint app/helyek/page.tsx-ben — nem hozunk létre eltérő konvenciót.

import Link from "next/link";
import { Bus, Footprints, Repeat2, HeartPulse, MapPinned, Sparkles, ArrowRight } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/data";
import { isVedettRouteFeatureEnabled, VEDETT_ROUTE_ACCESS_LEVEL } from "@/lib/vedett-route/config";
import { hasVedettRouteBetaAccess } from "@/lib/vedett-route/access";
import { routeDestinationDeepLinkSchema } from "@/lib/vedett-route/schemas";
import VedettUtvonalWorkspace from "@/components/vedett-utvonal/VedettUtvonalWorkspace";
import type { Metadata } from "next";

// Lásd app/admin/vedett-utvonal/page.tsx fejlécét — ugyanaz a build-time
// hálózati hívás elleni védelem indokolja itt is a force-dynamic-ot: a
// VedettUtvonalSearchForm kliens komponens, de az oldal maga a
// jogosultsági ellenőrzést mindig futásidőben, nem build időben kell,
// hogy elvégezze (a felhasználó session-je csak runtime-ban ismert).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Védett Útvonal — közösségi közlekedési navigáció",
  description:
    "A Védett Útvonal az érkezési idő mellett az egyéni és szenzoros preferenciákat is figyelembe vevő útvonaltervező, valós BKK, MÁV, Volán és MOL Bubi adatokkal.",
};

function parseDeepLinkDestination(
  searchParams: Record<string, string | string[] | undefined>
): { name: string; latitude: number; longitude: number } | null {
  const name = searchParams.name;
  const lat = searchParams.lat;
  const lon = searchParams.lon;
  // Csak sima string paramétereket fogadunk el (nem tömböt, pl.
  // ?name=a&name=b esetén) — ez már önmagában kizárja a legtöbb hibás
  // bemenetet, mielőtt egyáltalán a zod séma futna.
  if (typeof name !== "string" || typeof lat !== "string" || typeof lon !== "string") {
    return null;
  }
  const parsed = routeDestinationDeepLinkSchema.safeParse({ name, lat, lon });
  if (!parsed.success) return null;
  return { name: parsed.data.name, latitude: parsed.data.lat, longitude: parsed.data.lon };
}

const PREVIEW_FEATURES: { icon: typeof Bus; title: string; desc: string }[] = [
  { icon: Bus, title: "Valós járatok", desc: "BKK, MÁV, Volán és MOL Bubi valós idejű adatai alapján — Budapesten és azon kívül is." },
  { icon: MapPinned, title: "Turn-by-turn navigáció", desc: "Lépésről lépésre kapod a felszállás, leszállás, átszállás és gyalogos fordulók útmutatását." },
  { icon: Footprints, title: "Kevesebb gyaloglás", desc: "Az útvonalak közül azt is megmutatjuk, amelyiknél kevesebbet kell gyalogolnod." },
  { icon: Repeat2, title: "Kevesebb átszállás", desc: "Nyugodtabb utazás — az átszállások számát is figyelembe vevő javaslatok." },
  { icon: Sparkles, title: "Szenzoros preferenciák", desc: "Beállíthatod, mi számít neked: zaj, zsúfoltság, tempó — ahol erről adat rendelkezésre áll." },
  { icon: HeartPulse, title: "Pihenőpontok", desc: "Útközbeni pihenőpontokat is javasolunk, ahol szükség van egy kis szünetre." },
];

export default async function VedettUtvonalPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { user, profile } = await getCurrentUserAndProfile();
  const enabled = isVedettRouteFeatureEnabled();

  if (!enabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-bold text-sni-text">A Védett Útvonal funkció jelenleg ki van kapcsolva.</h1>
        <p className="mt-3 text-gray-600">
          A Védett Útvonal funkció jelenleg nem elérhető. Nézz vissza később.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-sni-brand-blue hover:underline">
          ← Vissza a főoldalra
        </Link>
      </div>
    );
  }

  // NYILVÁNOS BEMUTATÓ — nincs bejelentkezve. A tényleges kereső
  // komponens (VedettUtvonalWorkspace) itt SOSEM renderelődik; az anonim
  // látogató csak statikus, marketing jellegű bemutatót kap, valamint egy
  // CTA-t, ami a meglévő /belepes?next=/vedett-utvonal mintát használja
  // (lásd pl. app/vedett-karrier/munkaprofil/page.tsx, app/akademia/layout.tsx).
  if (!user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex flex-wrap items-center gap-3">
          <img src="/vedett-utvonal-logo-icon.png" alt="" aria-hidden="true" className="h-[35.2px] w-auto sm:h-[39.6px]" />
          <img src="/vedett-utvonal-wordmark.png" alt="Védett Útvonal" className="h-[22px] w-auto sm:h-[26.4px]" />
        </div>

        <h1 className="mt-6 text-2xl font-extrabold leading-tight text-sni-text sm:text-4xl">
          Nem mindig a leggyorsabb út a legjobb út.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg">
          A Védett Útvonal olyan közösségi közlekedési navigáció, amely az érkezési idő mellett
          az egyéni és szenzoros preferenciákat is figyelembe veszi.
        </p>

        <Link
          href="/belepes?next=%2Fvedett-utvonal"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-sni-brand-teal px-6 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-sni-brand-blue hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal focus-visible:ring-offset-2"
        >
          Útvonaltervezés indítása
          <ArrowRight size={18} aria-hidden="true" />
        </Link>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PREVIEW_FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sni-brand-teal/10">
                <Icon size={20} className="text-sni-brand-teal" aria-hidden="true" />
              </div>
              <p className="font-bold text-gray-900">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-500">{desc}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm text-gray-500">
          A Védett Útvonal használata ingyenes regisztrációhoz kötött. Nem ígérünk olyan
          adatpontosságot vagy akadálymentességet, amely technikailag nem garantálható — az
          akadálymentességi információkat ott mutatjuk, ahol ténylegesen rendelkezésre állnak.
        </p>
      </div>
    );
  }

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

  // A deep-link feldolgozás SZÁNDÉKOSAN a hasLevelAccess check UTÁN
  // történik — egy jogosultság nélküli állapotban amúgy sem renderelődik a
  // kereső form, tehát a destinationnak sincs hova kerülnie; nincs szükség
  // rá, hogy egy DENY ágon is validáljunk egy query paramétert.
  const initialDestination = hasLevelAccess ? parseDeepLinkDestination(searchParams) : null;

  if (!hasLevelAccess) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-bold text-sni-text">Nincs hozzáférésed ehhez a funkcióhoz.</h1>
        <p className="mt-3 text-gray-600">
          A Védett Útvonal jelenleg nem elérhető a fiókodhoz. Ha ez tévedésnek tűnik, írj nekünk.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-sni-brand-blue hover:underline">
          ← Vissza a főoldalra
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Branding frissítés (2026-09-20) — a szöveges "Védett Útvonal" cím
          helyett a hivatalos logó (ikon + felirat-kép) jelenik meg. Az `h1`
          szemantika/hozzáférhető név MEGMARAD: a felirat-kép `alt` szövege
          adja a látható/felolvasott címet, az ikon dekoratív (alt=""). */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2.5">
          <img src="/vedett-utvonal-logo-icon.png" alt="" aria-hidden="true" className="h-[35.2px] w-auto sm:h-[39.6px]" />
          <img src="/vedett-utvonal-wordmark.png" alt="Védett Útvonal" className="h-[22px] w-auto sm:h-[26.4px]" />
        </h1>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        A Védett Útvonal jelenleg tesztelés alatt áll. Az útvonal- és pihenőpont-adatok
        pontatlanok lehetnek.
      </p>

      <div className="mt-6 space-y-6">
        {/* Kedvenc útvonalak (2026-09-09) — a lista a kereső FÖLÖTT jelenik
            meg (spec 34. pont illusztratív UX flow-ja). A
            VedettUtvonalWorkspace felelős a "1 kattintásos újratervezés"
            React-key-remount mintájáért — lásd a komponens fejlécét. */}
        <VedettUtvonalWorkspace disabled={!enabled} initialDestination={initialDestination} />
      </div>
    </div>
  );
}
