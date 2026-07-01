import { Heart } from "lucide-react";

export const metadata = {
  title: "Rólunk – VédettSarok",
  description:
    "A VédettSarok egy közösségi térkép és tudástár, amely autizmussal és ADHD-val érintett családoknak, felnőtteknek és szakembereknek segít biztonságos helyeket találni.",
};

export default function RolunkPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Fejléc */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sni-brand-teal/10">
          <Heart className="text-sni-brand-teal" size={22} />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900">Rólunk</h1>
      </div>

      <div className="mt-8 space-y-6 text-base leading-relaxed text-gray-800">
        <p>
          A <strong>VédettSarok</strong> egy magyar nyelvű, közösségi alapú webapplikáció, amely autizmussal és ADHD-val
          élő gyermekek családjainak, érintett felnőtteknek és segítő szakembereknek segít biztonságosabb, elfogadóbb és
          kiszámíthatóbb helyeket találni.
        </p>

        <p>
          Az alkalmazás lényege egyszerű: a felhasználók kereshetnek a térképen és a helylistában, megnézhetik mások
          tapasztalatait, majd saját élményeik alapján ők is ajánlhatnak vagy értékelhetnek helyeket. Így fokozatosan egy
          olyan közösségi tudástár épül, amely valós családi és érintetti tapasztalatokon alapul.
        </p>

        <p>
          A VédettSarok <strong>nem orvosi, diagnosztikai vagy terápiás szolgáltatás</strong>. Nem azt állítja, hogy egy
          hely minden autista vagy ADHD-val élő ember számára biztosan megfelelő, hanem abban segít, hogy a családok
          előzetesen tájékozódhassanak: mennyire nyugodt, elfogadó, szenzorosan terhelhető vagy kiszámítható az adott hely.
        </p>

        <p>
          A webapplikációban ajánlhatók például éttermek, kávézók, játszóterek, játszóházak, fodrászok, orvosi rendelők,
          fogorvosok, fejlesztőhelyek, múzeumok, szállások, kirándulóhelyek és családi programok. A cél nem egy általános
          értékelőoldal létrehozása, hanem egy speciális, bizalmi tér, ahol a legfontosabb kérdés az:{" "}
          <em>„El tudok-e ide menni nyugodtabban a gyermekemmel vagy érintettként?"</em>
        </p>

        <p>
          Az első verzió célja egy egyszerűen használható, mobilbarát rendszer, ahol lehet helyet keresni, új helyet
          beküldeni, tapasztalatot megosztani és térképen böngészni. A hosszabb távú cél egy országos, megbízható,
          moderált adatbázis létrehozása, amely valódi segítséget ad a mindennapi döntésekhez.
        </p>

        {/* Üzenet kiemelő doboz */}
        <div className="rounded-2xl bg-gradient-to-br from-sni-brand-teal/10 to-sni-brand-blue/10 border border-sni-brand-teal/20 px-6 py-5 text-center">
          <p className="text-lg font-bold text-sni-brand-navy">
            A VédettSarok üzenete: itt biztonságban vagy.
          </p>
        </div>
      </div>
    </div>
  );
}
