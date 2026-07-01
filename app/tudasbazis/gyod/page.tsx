import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/tudasbazis"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-sni-brand-blue hover:text-sni-brand-teal"
      >
        <ArrowLeft size={14} /> Vissza a Tudásbázishoz
      </Link>
      <h1 className="mt-4 text-2xl font-extrabold text-gray-900 sm:text-3xl">GYOD igénylése</h1>
      <p className="mt-3 text-base font-medium text-gray-600">A Gyermekek Otthongondozási Díját az a szülő igényelheti, aki önellátásra képtelen, tartósan beteg vagy súlyosan fogyatékos gyermekéről otthon gondoskodik.</p>
          <p className="mt-4 leading-relaxed text-gray-700">A szülő a GYOD iránti kérelmet a lakóhelye szerint illetékes járási hivatalnál, kormányablaknál vagy a települési önkormányzat polgármesteri hivatalánál nyújthatja be. A kérelmező a kérelmet személyesen, egyes esetekben elektronikus úton is benyújthatja.</p>
          <p className="mt-4 leading-relaxed text-gray-700">A szülőnek a kérelemhez csatolnia kell a szükséges orvosi igazolásokat és egyéb előírt dokumentumokat. Hat év alatti gyermek esetén a szakorvosi igazolás, hat év feletti gyermek esetén pedig a háziorvosi igazolás és szükség szerint az intézménylátogatási igazolás is szükséges lehet.</p>
          <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Ez az oldal tájékoztató jellegű, nem minősül jogi tanácsadásnak. Kérjük, az aktuális feltételekről mindig tájékozódjon a hatóságoknál.</p>
    </div>
  );
}
