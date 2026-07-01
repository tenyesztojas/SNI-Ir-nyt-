import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";

export const metadata = {
  title: "SNI tájékoztató – VédettSarok",
  description:
    "Tudjon meg többet a sajátos nevelési igényről: mi az SNI, mit takar, és mit jelent autizmussal vagy ADHD-val érintett gyermekek esetén.",
};

export default function SniTajekoztato() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/tudasbazis"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-sni-brand-blue hover:underline"
      >
        <ArrowLeft size={15} /> Tudásbázis
      </Link>

      <h1 className="mt-5 text-3xl font-extrabold text-gray-900">SNI tájékoztató</h1>

      <div className="mt-8 space-y-8 text-base leading-relaxed text-gray-800">

        <section>
          <h2 className="text-xl font-bold text-gray-900">Mi az SNI?</h2>
          <p className="mt-3">
            Az SNI, vagyis a <strong>sajátos nevelési igény</strong> nem diagnózis, hanem oktatási és jogi státusz. Ez a státusz
            azt jelenti, hogy a gyermek valamilyen tartós, szakmailag igazolt eltérés miatt a neveléshez és az oktatáshoz
            többlettámogatást igényel.
          </p>
          <p className="mt-3">
            Az SNI-státuszt nem az orvos állapítja meg, hanem a <strong>szakértői bizottság</strong>. A bizottság a döntést orvosi,
            pszichológiai és pedagógiai vizsgálatok, valamint a rendelkezésre álló diagnózisok alapján hozza meg.
          </p>
          <p className="mt-3">
            Az SNI tehát egy olyan keret, amely azt határozza meg, hogy a gyermek milyen speciális segítséget, fejlesztést vagy
            pedagógiai támogatást kapjon az óvodában vagy az iskolában.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">Mit takar az SNI?</h2>
          <p className="mt-3">
            Az SNI a gyakorlatban azt jelenti, hogy a gyermek számára az intézménynek személyre szabottabb, speciálisabb nevelési
            és oktatási feltételeket kell biztosítania.
          </p>
          <p className="mt-3">
            Ez a támogatás magában foglalhat egyéni fejlesztési tervet, gyógypedagógiai vagy fejlesztőpedagógiai segítséget,
            differenciált tanulásszervezést, valamint szükség esetén könnyítéseket az értékelésben és a számonkérésben.
          </p>
          <p className="mt-3">
            Az SNI célja az, hogy a gyermek a saját szükségleteihez igazodó környezetben tudjon fejlődni, tanulni és teljesíteni.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">Mit jelent az SNI autizmussal érintett gyermekek esetén?</h2>
          <p className="mt-3">
            Autizmus esetén az SNI azt jelenti, hogy a gyermek a társas kommunikáció, a kapcsolódás, a rugalmas alkalmazkodás és
            az érzékszervi feldolgozás területén speciális támogatást igényelhet.
          </p>
          <p className="mt-3">
            Az intézménynek ilyen esetben törekednie kell a kiszámítható napirendre, az egyértelmű szabályokra, a vizuális
            segítségek használatára és az ingerek megfelelő szabályozására.
          </p>
          <p className="mt-3">
            A gyermek számára sokszor nagy segítséget jelent a rövid, világos instrukció, a strukturált környezet, a nyugodtabb
            tanulási helyzet és a rugalmasabb számonkérés.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">Mit jelent az SNI ADHD-val érintett gyermekek esetén?</h2>
          <p className="mt-3">
            ADHD esetén az SNI azt jelenti, hogy a gyermek figyelmi, szervezési és önszabályozási nehézségei miatt a megszokottól
            eltérő pedagógiai támogatásra lehet szükség.
          </p>
          <p className="mt-3">
            Az intézmény ilyen esetben segítheti a gyermeket rövidebb, tagoltabb feladatokkal, gyakori visszajelzéssel,
            mozgásszünetekkel, valamint egyértelmű, lépésekre bontott utasításokkal.
          </p>
          <p className="mt-3">
            A megfelelő támogatás csökkentheti a túlterhelést, és segítheti azt, hogy a gyermek képességeihez mérten sikeresebben
            vegyen részt az óvodai vagy iskolai munkában.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">Mivel jár az SNI a család és a gyermek számára?</h2>
          <p className="mt-3">
            Az SNI-státuszhoz rendszerint szakértői vizsgálat, dokumentáció és intézményi együttműködés kapcsolódik. A szülőnek
            részt kell vennie a folyamatban, tájékoztatnia kell a szakembereket a gyermek működéséről, és figyelemmel kell
            kísérnie a szakértői véleményben foglaltakat.
          </p>
          <p className="mt-3">
            A gyermek számára az SNI elvileg azt biztosítja, hogy az intézmény ne az átlagos elvárásokhoz mérje kizárólagosan a
            teljesítményét, hanem vegye figyelembe az egyéni szükségleteit is.
          </p>
          <p className="mt-3">
            Az SNI megfelelő alkalmazása biztonságosabb, kiszámíthatóbb és támogatóbb tanulási környezetet teremthet a gyermek
            számára.
          </p>
        </section>

        {/* Záró tájékoztatás */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 flex gap-3">
          <Info className="mt-0.5 shrink-0 text-blue-500" size={20} />
          <p className="text-sm text-blue-800">
            <strong>Záró tájékoztatás:</strong> Ez az oldal tájékoztató jellegű, nem minősül jogi tanácsadásnak. Kérjük, az
            aktuális feltételekről mindig tájékozódjon a hatóságoknál.
          </p>
        </div>

      </div>
    </div>
  );
}
