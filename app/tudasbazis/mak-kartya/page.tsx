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
      <h1 className="mt-4 text-2xl font-extrabold text-gray-900 sm:text-3xl">MÁK-kártya igénylése</h1>
      <p className="mt-3 text-base font-medium text-gray-600">A köznyelvben MÁK-kártyának nevezett igazolás a magasabb összegű családi pótlékhoz kapcsolódó jogosultság igazolására szolgál.</p>
          <p className="mt-4 leading-relaxed text-gray-700">A jogosultság alapját a gyermek tartós betegségéről vagy súlyos fogyatékosságáról kiállított szakorvosi igazolás teremti meg. A szülő először felkeresi a megfelelő szakorvost, majd beszerzi a szükséges igazolást.</p>
          <p className="mt-4 leading-relaxed text-gray-700">Ezt követően a szülő a családi pótlék ügyintézésével együtt kezdeményezi a kapcsolódó igazolás kiállítását.</p>
          <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Ez az oldal tájékoztató jellegű, nem minősül jogi tanácsadásnak. Kérjük, az aktuális feltételekről mindig tájékozódjon a hatóságoknál.</p>
    </div>
  );
}
