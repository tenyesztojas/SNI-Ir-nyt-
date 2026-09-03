import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";

export const metadata = { title: "Karrierpartner-információk – VédettKarrier" };

export default function MunkaltatokPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-extrabold text-sni-brand-navy">Karrierpartner-információk</h1>
      <p className="mt-2 text-sm text-gray-500">
        Hirdess rugalmas, tervezhető lehetőséget a VédettSarok közösségének.
      </p>

      <div className="mt-6 space-y-6 text-base leading-relaxed text-gray-800">
        <p>
          A <strong>VédettKarrier</strong> a VédettSarok webapplikáció karrier- és lehetőségkereső funkciója.
          Olyan rugalmas munkákat, megbízásokat és lehetőségeket gyűjtünk össze, amelyek jobban illeszkedhetnek
          kiszámíthatóbb, tervezhetőbb családi mindennapokhoz.
        </p>

        <p>
          Ha van olyan munkád, megbízásod vagy együttműködési lehetőséged, amely ezekhez az élethelyzetekhez
          jobban illeszkedhet — például otthonról végezhető, részmunkaidős, előre tervezhető beosztású
          vagy kevés telefonálással jár —, karrierpartnerként bemutathatod a VédettSarok közösségének.
        </p>

        <div className="rounded-2xl border border-sni-brand-teal/20 bg-sni-brand-teal/5 p-5">
          <h2 className="font-bold text-sni-brand-navy">A karrierpartner vállalja:</h2>
          <ul className="mt-3 space-y-2">
            {[
              "A lehetőségkártyán megadott munkavégzési feltételek, rugalmassági lehetőségek, munkaidő, díjazás és elvárások valósak, pontosak és nem megtévesztők.",
              "A jelentkezőket méltányosan, diszkriminációmentesen kezeli.",
              "Nem kér indokolatlanul egészségügyi dokumentumot vagy diagnózist a jelentkezési folyamat első szakaszában.",
              "Törekszi az egyértelmű, emberi hangvételű kommunikációra.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 shrink-0 text-sni-brand-teal" size={18} />
                <span className="text-sm">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
          <h2 className="font-bold text-red-700">Nem fogadunk el ilyen lehetőségkártyát</h2>
          <ul className="mt-2 space-y-1 text-sm text-red-600">
            {[
              "MLM, piramisjáték, gyors meggazdagodást ígérő ajánlat",
              "Kriptós vagy befektetési ajánlat",
              "Gyanús külföldi munka",
              "Diagnózist, egészségügyi iratot kérő hirdetés az első szakaszban",
              "Sértő vagy lekezelő megfogalmazás",
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
          <p className="mt-2 text-sm">
            Először regisztrálsz karrierpartnerként, majd az oldal csapata jóváhagyja a profilt.
            A jóváhagyás általában 1–2 munkanap. Utána tudsz lehetőségkártyát feladni.
          </p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
          <strong>Fontos:</strong> A VédettSarok nem munkaerő-közvetítő szolgáltatás.
          Nem garantál elhelyezkedést, munkáltatói választ, interjút vagy jogviszony létrejöttét.
          A VédettKarrier a karrierpartner lehetőségkártyáit mutatja meg, és a jelentkezéseket technikailag továbbítja.
        </div>
      </div>

      <div className="mt-8">
        <Link
          href="/vedettmunka/munkaltatoi-regisztracio"
          className="inline-block rounded-full bg-sni-brand-navy px-7 py-3 font-bold text-white transition hover:bg-sni-brand-blue"
        >
          Karrierpartner leszek
        </Link>
      </div>
    </div>
  );
}
