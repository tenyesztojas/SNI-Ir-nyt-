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
      <h1 className="mt-4 text-2xl font-extrabold text-gray-900 sm:text-3xl">Mi az ADHD?</h1>
      <p className="mt-3 text-base font-medium text-gray-600">Az ADHD, vagyis a figyelemhiányos hiperaktivitás-zavar olyan idegrendszeri fejlődési zavar, amely a figyelem szabályozását, a viselkedés kontrollját és az aktivitás szintjét befolyásolja.</p>
          <p className="mt-4 leading-relaxed text-gray-700">Az ADHD gyakran okoz figyelmetlenséget, feledékenységet, szétszórtságot és szervezetlenséget. Az állapot sok esetben nyugtalansággal, impulzív viselkedéssel és a feladatok befejezésének nehézségével is együtt jár.</p>
          <p className="mt-4 leading-relaxed text-gray-700">A diagnózist szakorvos állapítja meg részletes klinikai vizsgálat alapján. A szakember a tünetek fennállását, időtartamát, életkori kezdetét és a mindennapi működésre gyakorolt hatását is értékeli.</p>
    </div>
  );
}
