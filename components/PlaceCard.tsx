import Link from "next/link";
import { MapPin } from "lucide-react";
import { Place, Category } from "@/lib/types";
import CategoryBadge from "./CategoryBadge";

export default function PlaceCard({ place, category }: { place: Place; category?: Category | null }) {
  return (
    <Link href={`/helyek/${place.slug}`} className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold text-sni-text">{place.name}</h3>
        <CategoryBadge category={category} />
      </div>
      <p className="flex items-center gap-1.5 text-sm text-gray-500">
        <MapPin size={14} /> {place.city}
      </p>
      <p className="line-clamp-2 text-sm text-gray-600">{place.description}</p>
      <p className="line-clamp-2 rounded-xl2 bg-sni-green/40 px-3 py-2 text-sm text-sni-text">
        {place.whyFriendly}
      </p>
    </Link>
  );
}
