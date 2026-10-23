import type { Metadata } from "next";
import Link from "next/link";

// Védett Útvonal — nyilvános támogatási oldal (App Store Support URL,
// Guideline 1.5). Statikus szerver komponens: nincs bejelentkezés, nincs
// kliensoldali JavaScript, nincs analitika vagy külső szolgáltatás.

const SUPPORT_EMAIL = "kapcsolat@vedettsarok.hu";
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Védett Útvonal – segítségkérés")}`;
const BUG_REPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Védett Útvonal – hibabejelentés")}&body=${encodeURIComponent(
  "Eszköz típusa:\nRendszerverzió (pl. iOS 18):\nMi történt?\nMit vártál volna?\nMikor történt?\n"
)}`;

export const metadata: Metadata = {
  title: "Védett Útvonal – Segítség és támogatás",
  description: "Segítségkérés, hibabejelentés és kapcsolatfelvétel a Védett Útvonal alkalmazással kapcsolatban.",
};

export default function VedettUtvonalSegitsegPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">Védett Útvonal – Segítség és támogatás</h1>

      <section className="mt-6" aria-labelledby="segitsegkeres">
        <h2 id="segitsegkeres" className="text-lg font-bold text-gray-900">Segítségkérés</h2>
        <p className="mt-2 text-gray-700">
          Ha kérdésed van a Védett Útvonal használatával kapcsolatban (útvonaltervezés, navigáció, bejelentkezés,
          beállítások), írj nekünk e-mailben. Igyekszünk mielőbb válaszolni.
        </p>
        <p className="mt-3">
          <a href={SUPPORT_MAILTO} className="font-semibold text-sni-brand-blue underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </section>

      <section className="mt-8" aria-labelledby="hibabejelentes">
        <h2 id="hibabejelentes" className="text-lg font-bold text-gray-900">Hibabejelentés</h2>
        <p className="mt-2 text-gray-700">
          Ha valami nem úgy működik, ahogy kellene, kérjük, írd meg az eszközöd típusát, a rendszer verzióját, és
          hogy mi történt.
        </p>
        <p className="mt-3">
          <a
            href={BUG_REPORT_MAILTO}
            className="inline-block rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Hiba bejelentése e-mailben
          </a>
        </p>
      </section>

      <section className="mt-8" aria-labelledby="kapcsolat">
        <h2 id="kapcsolat" className="text-lg font-bold text-gray-900">Kapcsolatfelvételi űrlap</h2>
        <p className="mt-2 text-gray-700">
          Üzenetet a{" "}
          <Link href="/kapcsolat" className="font-semibold text-sni-brand-blue underline">
            kapcsolatfelvételi oldalon
          </Link>{" "}
          is küldhetsz.
        </p>
      </section>

      <section className="mt-8" aria-labelledby="fiok-adatok">
        <h2 id="fiok-adatok" className="text-lg font-bold text-gray-900">Fiók és adatok</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-700">
          <li>
            <Link href="/vedett-utvonal/fiok" className="text-sni-brand-blue underline">Fiókom és fióktörlés</Link>{" "}
            (bejelentkezve, az alkalmazásban)
          </li>
          <li>
            <Link href="/fiok-torles" className="text-sni-brand-blue underline">Tájékoztató a fiók törléséről</Link>
          </li>
          <li>
            <Link href="/adatkezelesi-tajekoztato" className="text-sni-brand-blue underline">Adatkezelési tájékoztató</Link>
          </li>
          <li>
            <Link href="/aszf" className="text-sni-brand-blue underline">Általános Szerződési Feltételek</Link>
          </li>
        </ul>
      </section>

      <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" aria-labelledby="biztonsag">
        <h2 id="biztonsag" className="font-bold">Fontos biztonsági tájékoztatás</h2>
        <p className="mt-1">
          A Védett Útvonal nem segélyhívó szolgáltatás. Vészhelyzetben hívd a <a href="tel:112" className="font-bold underline">112</a>-t.
        </p>
      </section>
    </main>
  );
}
