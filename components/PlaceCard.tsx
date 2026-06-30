import Link from "next/link";
import { MapPin } from "lucide-react";
import { Place, Category } from "@/lib/types";

const GRADIENTS = [
  "from-teal-400/40 to-cyan-600/50",
  "from-blue-400/40 to-teal-600/50",
  "from-emerald-400/40 to-teal-500/50",
  "from-sky-400/40 to-blue-600/50",
  "from-indigo-400/40 to-sky-600/50",
  "from-cyan-400/40 to-blue-500/50",
];

function pickGradient(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffffff;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export default function PlaceCard({
  place,
  category,
}: {
  place: Place;
  category?: Category | null;
}) {
  const gradient = pickGradient(place.slug ?? place.name);

  return (
    <Link
      href={`/helyek/${place.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-sni-brand-teal/30 hover:shadow-softHover"
    >
      <div
        className={`relative flex h-44 items-center justify-center bg-gradient-to-br ${gradient}`}
      >
        <span className="text-6xl drop-shadow" aria-hidden>
          {category?.icon ?? "\u{1F4CD}"}
        </span>
        {category && (
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-sni-brand-navy shadow-sm backdrop-blur-sm">
            {category.name}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 text-base font-bold text-gray-900 transition-colors group-hover:text-sni-brand-blue">
          {place.name}
        </h3>
        <p className="flex items-center gap-1 text-sm text-gray-500">
          <MapPin size={13} className="flex-shrink-0 text-sni-brand-teal" />
          {place.city}
        </p>
        <p className="line-clamp-2 text-sm leading-relaxed text-gray-600">{place.description}</p>
        <div className="mt-auto pt-2">
          <p className="line-clamp-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800">
            <span className="font-semibold">\u2713 </span>
            {place.whyFriendly}
          </p>
        </div>
      </div>
    </Link>
  );
}
