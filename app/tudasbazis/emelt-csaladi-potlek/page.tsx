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
      <h1 className="mt-4 text-2xl font-extrabold text-gray-900 sm:text-3xl">Emelt családi pótlék igénylése</h1>
      <p className="mt-3 text-base font-medium text-gray-600">Az emelt összegű családi pótlékot az a szülő vagy törvényes képviselő igényelheti, akinek gyermeke tartósan beteg vagy súlyosan fogyatékos.</p>
          <p className="mt-4 leading-relaxed text-gray-700">A kérelmező a kérelmet a családi pótlék megállapítására szolgáló nyomtatványon nyújtja be. A szülő a kérelmet személyesen kormányablakban vagy a lakóhely szerint illetékes kormányhivatalnál adhatja be, de postai úton és elektronikusan is benyújthatja.</p>
          <p className="mt-4 leading-relaxed text-gray-700">A kérelmezőnek a kérelemhez csatolnia kell a szükséges szakorvosi igazolást, ha az adat nem kerül be elektronikusan a rendszerbe.</p>
          <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Ez az oldal tájékoztató jellegű, nem minősül jogi tanácsadásnak. Kérjük, az aktuális feltételekről mindig tájékozódjon a hatóságoknál.</p>
    </div>
  );
}
