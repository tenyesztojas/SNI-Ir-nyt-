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
      <h1 className="mt-4 text-2xl font-extrabold text-gray-900 sm:text-3xl">Mi az autizmus?</h1>
      <p className="mt-3 text-base font-medium text-gray-600">Az autizmus spektrumzavar egy idegrendszeri fejlődési állapot, amely a társas kommunikációt, a társas kapcsolatok kialakítását és a viselkedés rugalmasságát érinti.</p>
          <p className="mt-4 leading-relaxed text-gray-700">Az autizmus gyakran okoz nehézséget a szemkontaktusban, a kölcsönös kommunikációban és a társas helyzetek értelmezésében. Az állapot gyakran együtt jár ismétlődő viselkedésekkel, erős rutinigénnyel és fokozott vagy eltérő érzékszervi érzékenységgel.</p>
          <p className="mt-4 leading-relaxed text-gray-700">A diagnózist minden esetben szakorvos vagy erre felkészült szakértői team állapítja meg. A vizsgálat a gyermek vagy a felnőtt fejlődési előzményeit, viselkedését, kommunikációját és társas működését elemzi.</p>
    </div>
  );
}
