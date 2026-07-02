import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, Globe, MapPin, Star, CheckCircle2, ArrowLeft } from "lucide-react";
import {
  getPlaceBySlug,
  getCategoryBySlug,
  getApprovedReviewsForPlace,
  getCurrentUserAndProfile,
  isPlaceFavorited,
} from "@/lib/data";
import { Review } from "@/lib/types";
import CategoryBadge from "@/components/CategoryBadge";
import Disclaimer from "@/components/Disclaimer";
import FavoriteButton from "@/components/FavoriteButton";
import ReportButton from "@/components/ReportButton";

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          style={{ width: size, height: size }}
          className={i <= Math.round(rating) ? "text-amber-400" : "text-gray-200"}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function RatingBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value / 5) * 100);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-36 shrink-0 text-gray-600">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-sni-brand-teal" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-xs font-bold text-gray-700">{value}</span>
    </div>
  );
}

function avgRating(reviews: Review[]): number {
  if (reviews.length === 0) return 0;
  return reviews.reduce((s, r) => s + r.overallRating, 0) / reviews.length;
}

const GRADIENTS = [
  "from-teal-400/50 to-cyan-600/60",
  "from-blue-400/50 to-teal-600/60",
  "from-emerald-400/50 to-teal-500/60",
  "from-sky-400/50 to-blue-600/60",
  "from-indigo-400/50 to-sky-600/60",
  "from-cyan-400/50 to-blue-500/60",
];
function pickGradient(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) & 0xffffff;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export default async function PlaceDetailPage({ params }: { params: { slug: string } }) {
  const place = await getPlaceBySlug(params.slug);
  if (!place) notFound();

  const [category, reviews, { user }] = await Promise.all([
    getCategoryBySlug(place.category),
    getApprovedReviewsForPlace(place.id),
    getCurrentUserAndProfile(),
  ]);

  const initialFavorite = user ? await isPlaceFavorited(user.id, place.id) : false;
  const avg = avgRating(reviews);
  const gradient = pickGradient(place.slug ?? place.name);

  return (
    <div>
      {/* Photo hero */}
      {place.images && place.images.length > 0 ? (
        <div className="relative h-56 sm:h-72 bg-gray-900 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={place.images[0]}
            alt={place.name}
            className="w-full h-full object-cover opacity-90"
          />
          {place.images.length > 1 && (
            <div className="absolute bottom-16 right-4 flex gap-1.5 sm:bottom-14">
              {place.images.slice(1).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="h-14 w-14 rounded-lg object-cover border-2 border-white shadow-md cursor-pointer hover:opacity-90"
                  onClick={() => window.open(url, "_blank")}
                />
              ))}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent px-4 py-4 sm:px-8">
            <Link href="/helyek" className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-gray-800 shadow-sm backdrop-blur-sm hover:bg-white">
              <ArrowLeft size={15} /> Vissza
            </Link>
          </div>
        </div>
      ) : (
        <div className={`relative flex h-56 items-center justify-center bg-gradient-to-br ${gradient} sm:h-72`}>
          <span className="text-8xl drop-shadow-lg" aria-hidden>{category?.icon ?? "📍"}</span>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/30 to-transparent px-4 py-4 sm:px-8">
            <Link href="/helyek" className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-gray-800 shadow-sm backdrop-blur-sm hover:bg-white">
              <ArrowLeft size={15} /> Vissza
            </Link>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {place.status !== "approved" && (
          <div className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Ez a hely még jóváhagyásra vár — addig csak te és az adminok látják.
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">{place.name}</h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-gray-500">
              <MapPin size={15} className="text-sni-brand-teal" /> {place.city}
            </p>
            {reviews.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <Stars rating={avg} />
                <span className="text-sm font-semibold text-gray-700">{avg.toFixed(1)}</span>
                <span className="text-sm text-gray-400">({reviews.length} értékelés)</span>
              </div>
            )}
          </div>
          <CategoryBadge category={category} />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <FavoriteButton placeId={place.id} placeName={place.name} initialActive={initialFavorite} />
          <Link href={`/ertekeles/${place.id}`} className="btn-primary">
            <Star size={17} /> Értékelést írok
          </Link>
        </div>

        {/* Description */}
        <div className="mt-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-bold text-gray-900">Leírás</h2>
          <p className="mt-2 leading-relaxed text-gray-700">{place.description}</p>

          <h2 className="mt-6 text-lg font-bold text-gray-900">Miért autizmus/ADHD-barát?</h2>
          <div className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            <p className="leading-relaxed text-emerald-900">{place.whyFriendly}</p>
          </div>

          <dl className="mt-6 space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <MapPin size={15} className="mt-0.5 shrink-0 text-sni-brand-teal" />
              <dd>{place.address}, {place.city}{place.postalCode ? ` (${place.postalCode})` : ""}</dd>
            </div>
            {place.phone && (
              <div className="flex items-center gap-2">
                <Phone size={15} className="shrink-0 text-sni-brand-teal" />
                <dd><a href={`tel:${place.phone}`} className="hover:text-sni-brand-blue hover:underline">{place.phone}</a></dd>
              </div>
            )}
            {place.website && (
              <div className="flex items-center gap-2">
                <Globe size={15} className="shrink-0 text-sni-brand-teal" />
                <dd>
                  <a href={place.website} target="_blank" rel="noopener noreferrer" className="truncate text-sni-brand-blue hover:underline">
                    {place.website}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Reviews */}
        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">
              Vélemények
              {reviews.length > 0 && (
                <span className="ml-2 rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-semibold text-gray-600">
                  {reviews.length}
                </span>
              )}
            </h2>
            {reviews.length > 0 && (
              <div className="flex items-center gap-2">
                <Stars rating={avg} size={18} />
                <span className="text-xl font-extrabold text-gray-900">{avg.toFixed(1)}</span>
                <span className="text-sm text-gray-400">/ 5</span>
              </div>
            )}
          </div>

          {reviews.length > 0 && (
            <div className="mt-4 space-y-2 rounded-xl bg-gray-50 p-4">
              {[
                { label: "Zajszint", key: "noiseRating" as const },
                { label: "Zsúfoltság", key: "crowdRating" as const },
                { label: "Személyzet empátiája", key: "staffEmpathyRating" as const },
                { label: "Biztonságérzet", key: "safetyRating" as const },
                { label: "Csendes sarok", key: "quietSpaceRating" as const },
              ].map(({ label, key }) => {
                const a = reviews.reduce((s, r) => s + r[key], 0) / reviews.length;
                return <RatingBar key={key} label={label} value={Math.round(a * 10) / 10} />;
              })}
            </div>
          )}

          {reviews.length === 0 ? (
            <div className="mt-4 text-center">
              <p className="text-3xl">💬</p>
              <p className="mt-2 font-semibold text-gray-700">Még nincs értékelés</p>
              <p className="mt-1 text-sm text-gray-500">Legyél az első, aki megosztja a tapasztalatát!</p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {reviews.map((r) => (
                <div key={r.id} className="border-t border-gray-100 pt-5 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-gray-900">{r.title}</h3>
                      <div className="mt-1 flex items-center gap-2">
                        <Stars rating={r.overallRating} size={14} />
                        <span className="text-xs text-gray-500">{r.authorName}</span>
                        {r.wouldReturn && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            Visszatérne
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-gray-700">{r.positiveText}</p>
                  {r.warningText && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <span className="font-semibold">Mire figyelj: </span>{r.warningText}
                    </p>
                  )}
                  {r.images && r.images.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.images.map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={url}
                          alt={`Kép ${i + 1}`}
                          className="h-20 w-20 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-90"
                          onClick={() => window.open(url, "_blank")}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <Link href={`/ertekeles/${place.id}`} className="btn-secondary mt-5 inline-flex">
            <Star size={17} /> Értékelés írása
          </Link>
        </div>

        <div className="mt-6"><Disclaimer /></div>
        <div className="mt-4"><ReportButton placeId={place.id} /></div>
      </div>
    </div>
  );
}
