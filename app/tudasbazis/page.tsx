import Link from "next/link";
import { BookOpen } from "lucide-react";

const ITEMS = [
  { href: "/tudasbazis/autizmus", label: "Mi az autizmus?", desc: "Autizmus spektrumzavar: kommunikáció, viselkedés, diagnózis." },
  { href: "/tudasbazis/adhd", label: "Mi az ADHD?", desc: "Figyelemhiányos hiperaktivitás-zavar: tünetek, diagnózis." },
  { href: "/tudasbazis/emelt-csaladi-potlek", label: "Emelt családi pótlék igénylése", desc: "Ki igényelheti, hogyan kell benyújtani a kérelmet." },
  { href: "/tudasbazis/mak-kartya", label: "MÁK-kártya igénylése", desc: "A jogosultság igazolása és az igénylés menete." },
  { href: "/tudasbazis/gyod", label: "GYOD igénylése", desc: "Gyermekek Otthongondozási Díja: feltételek és benyújtás." },
  { href: "/tudasbazis/sni-tajekoztato", label: "SNI tájékoztató", desc: "Mi a sajátos nevelési igény, és mit jelent autizmussal vagy ADHD-val érintett gyermekek számára?" },
];

export default function TudasbazisPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-3">
        <BookOpen className="text-sni-brand-teal" size={32} />
        <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">Tudásbázis</h1>
      </div>
      <p className="mt-2 text-gray-500">Hasznos információk autizmusról, ADHD-ről és a kapcsolódó támogatásokról.</p>
      <div className="mt-8 flex flex-col gap-4">
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-sni-brand-teal/30 hover:shadow-softHover"
          >
            <h2 className="font-bold text-gray-900 group-hover:text-sni-brand-blue">{item.label}</h2>
            <p className="mt-1 text-sm text-gray-500">{item.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
