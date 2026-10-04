import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "VédettSarok-fiók törlése",
  description: "Hogyan törölheted a VédettSarok-fiókodat és a hozzá tartozó személyes adatokat.",
};

export const dynamic = "force-dynamic";

// PUBLIKUS oldal (bejelentkezés nélkül is megnyitható; Google Play fióktörlési
// URL). NINCS rajta űrlap vagy e-mail-mező: a törlés kizárólag bejelentkezett
// fiókból indítható (Profil → Fiók törlése). A visszatérési út FIX belső route
// (/fiok-torles), nem külső vagy felhasználó által megadott URL.
export default async function FiokTorlesPage() {
  let loggedIn = false;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    loggedIn = !!user;
  } catch {
    loggedIn = false;
  }

  const href = loggedIn ? "/profil#fiok-torlese" : "/belepes?next=%2Ffiok-torles";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="mb-4 text-3xl font-bold text-sni-text">VédettSarok-fiók törlése</h1>
      <div className="space-y-4 leading-relaxed text-gray-700">
        <p>
          A VédettSarok-fiókodat (a Védett Útvonal webes, Android és iOS változatában is használt fiókot) bármikor
          törölheted. A törlést az alkalmazásban vagy a weboldalon, bejelentkezve tudod elindítani:{" "}
          <strong>Profil → Fiók törlése</strong>.
        </p>
        <p>
          A törlés végleges. A fiókhoz tartozó személyes adatok (többek között a profil, a mentett helyek, a kedvenc
          útvonalak, a saját pihenőpontok és az értesítési feliratkozások) törlésre kerülnek, kivéve azokat az
          adatokat, amelyeket jogszabály alapján tovább kell megőriznünk.
        </p>
        <p>
          Ha a fiókod családi vagy gyermekprofil-adatokhoz kapcsolódik, további lépés szükséges lehet: ha te vagy a
          család egyetlen tulajdonosa és más családtag is van, előbb át kell adnod a tulajdonjogot; ha egyedül vagy a
          családban, a családot és a kizárólag hozzá tartozó gyermekprofilokat külön megerősítéssel törölheted.
          Bonyolultabb esetben (például gyermekfiók) a törlést egyedileg kezeljük.
        </p>
      </div>
      <div className="mt-8">
        <Link
          href={href}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-red-700 px-5 text-sm font-semibold text-white hover:bg-red-800"
        >
          Bejelentkezés és fióktörlés
        </Link>
      </div>
      <p className="mt-6 text-sm text-gray-600">
        Ha nem tudsz bejelentkezni, írj nekünk: <a href="mailto:kapcsolat@vedettsarok.hu" className="underline">kapcsolat@vedettsarok.hu</a>.
        Személyazonosság-ellenőrzés nélkül, pusztán e-mail-cím megadásával fiókot nem törlünk.
      </p>
      <p className="mt-2 text-sm text-gray-600">
        Az adatkezelésről az <Link href="/adatkezelesi-tajekoztato" className="underline">Adatkezelési Tájékoztatóban</Link> olvashatsz.
      </p>
    </div>
  );
}
