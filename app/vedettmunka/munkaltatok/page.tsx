import Link from "next/link";
import { CheckCircle2, XCircle, Building2 } from "lucide-react";

export const metadata = { title: "Munkáltatói információk" };

export default function MunkaltatokPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-3">
        <Building2 className="text-sni-brand-teal" size={28} />
        <h1 className="text-2xl font-extrabold text-sni-brand-navy">Munkáltatói információk</h1>
      </div>

      <div className="mt-6 space-y-6 text-base leading-relaxed text-gray-800">
        <p>
          A <strong>Védett Munka</strong> olyan speciális álláshirdető felület, ahol neurodivergens,
          megváltozott munkaképességű, fogyatékossággal élő, illetve érintett gyermeket nevelő
          álláskeresők is jelentkezhetnek.
        </p>

        <div className="rounded-2xl border border-sni-brand-teal/20 bg-sni-brand-teal/5 p-5">
          <h2 className="font-bold text-sni-brand-navy">A hirdető munkáltató vállalja:</h2>
          <ul className="mt-3 space-y-2">
            {[
              "A jelentkezőket méltányosan, diszkriminációmentesen kezeli.",
              "Nem kér indokolatlanul egészségügyi dokumentumot, diagnózist vagy fogyatékossági igazolást a jelentkezési folyamat első szakaszában.",
              "Nyitott neurodivergens, megváltozott munkaképességű vagy érintett gyermeket nevelő szülő jelöltekre.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 shrink-0 text-sni-brand-teal" size={18} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
          <h2 className="font-bold text-red-700">Tiltott hirdetések</h2>
          <p className="mt-2 text-sm text-red-600">A Védett Munka platformon nem jelenhet meg:</p>
          <ul className="mt-2 space-y-1 text-sm text-red-600">
            {[
              "MLM, piramisjáték, gyors meggazdagodást ígérő ajánlat",
              "Kriptós vagy befektetési ajánlat",
              "Gyanús külföldi munka",
              "Diagnózist, egészségügyi iratot kérő hirdetés (első szakaszban)",
              "Sértő vagy stigmatizáló megfogalmazás",
              "Megtévesztő jutalékos munka alapbér nélkül",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <XCircle className="mt-0.5 shrink-0" size={16} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="font-bold text-sni-brand-navy">Regisztráció és jóváhagyás</h2>
          <p className="mt-2">
            Minden munkáltató előbb regisztrál, majd az oldal adminisztrátorának jóváhagyása után adhat fel hirdetést.
            A jóváhagyás folyamata általában 1–2 munkanap. Az üzemeltető ellenőrzi, hogy a cég valódi és befogadó hozzáállású-e.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <Link
          href="/vedettmunka/munkaltatoi-regisztracio"
          className="inline-block rounded-full bg-sni-brand-navy px-7 py-3 font-bold text-white transition hover:bg-sni-brand-blue"
        >
          Regisztrálok munkáltatóként
        </Link>
      </div>
    </div>
  );
}
