import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, Globe, MapPin, Star } from "lucide-react";
import {
  getPlaceBySlug,
  getCategoryBySlug,
  getApprovedReviewsForPlace,
  getCurrentUserAndProfile,
  isPlaceFavorited,
} from "@/lib/data";
import CategoryBadge from "@/components/CategoryBadge";
import Disclaimer from "@/components/Disclaimer";
import FavoriteButton from "@/components/FavoriteButton";
import ReportButton from "@/components/ReportButton";

export default async function PlaceDetailPage({ params }: { params: { slug: string } }) {
  const place = await getPlaceBySlug(params.slug);
  if (!place) notFound();

  const [category, reviews, { user }] = await Promise.all([
    getCategoryBySlug(place.category),
    getApprovedReviewsForPlace(place.id),
    getCurrentUserAndProfile(),
  ]);

  const initialFavorite = user ? await isPlaceFavorited(user.id, place.id) : false;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/helyek" className="text-sm text-sni-brand-blue hover:underline">
        ← Vissza a helyekhez
      </Link>

      {place.status !== "approved" && (
        <div className="mt-3 rounded-xl2 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ez a hely még jóváhagyásra vár — addig csak te és az adminok látják.
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-sni-text sm:text-3xl">{place.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-gray-500">
            <MapPin size={16} /> {place.city}
          </p>
        </div>
        <CategoryBadge category={category} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <FavoriteButton placeId={place.id} placeName={place.name} initialActive={initialFavorite} />
        <Link href={`/ertekeles/${place.id}`} className="btn-primary">
          <Star size={18} /> Értékelést írok
        </Link>
      </div>

      <div className="card mt-6">
        <h2 className="font-semibold text-sni-text">Leírás</h2>
        <p className="mt-2 text-gray-700">{place.description}</p>

        <h2 className="mt-5 font-semibold text-sni-text">Miért autizmus/SNI-barát?</h2>
        <p className="mt-2 rounded-xl2 bg-sni-green/40 px-4 py-3 text-gray-700">
          {place.whyFriendly}
        </p>

        <dl className="mt-5 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-sni-brand-blue" />
            <dd>{place.address}</dd>
          </div>
          {place.phone && (
            <div className="flex items-center gap-2">
              <Phone size={16} className="text-sni-brand-blue" />
              <dd>{place.phone}</dd>
            </div>
          )}
          {place.website && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <Globe size={16} className="text-sni-brand-blue" />
              <a href={place.website} target="_blank" rel="noopener noreferrer" className="truncate text-sni-brand-blue hover:underline">
                {place.website}
              </a>
            </div>
          )}
        </dl>
      </div>

      <div className="card mt-6">
        <h2 className="font-semibold text-sni-text">Vélemények ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <p className="mt-2 text-gray-500">
            Még nincs felhasználói értékelés ehhez a helyhez — legyél te az első, aki megosztja a
            tapasztalatát!
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {reviews.map((r) => (
              <div key={r.id} className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium text-sni-text">{r.title}</h3>
                  <span className="text-sm text-gray-500">
                    {r.authorName} · Összbenyomás: {r.overallRating}/5
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-gray-700">{r.positiveText}</p>
                {r.warningText && (
                  <p className="mt-1.5 text-sm text-gray-600">
                    <span className="font-medium">Mire figyelj: </span>
                    {r.warningText}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        <Link href={`/ertekeles/${place.id}`} className="btn-secondary mt-4 inline-flex">
          <Star size={18} /> Elsőként/te is értékeld
        </Link>
      </div>

      <div className="mt-6">
        <Disclaimer />
      </div>

      <div className="mt-4">
        <ReportButton placeId={place.id} />
      </div>

      {category && (
        <p className="mt-6 text-xs text-gray-400">Kategória: {category.name}</p>
      )}
    </div>
  );
}
