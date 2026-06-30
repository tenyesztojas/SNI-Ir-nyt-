import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlaceById, getCurrentUserAndProfile } from "@/lib/data";
import ReviewForm from "@/components/ReviewForm";
import Disclaimer from "@/components/Disclaimer";

export default async function WriteReviewPage({ params }: { params: { placeId: string } }) {
  const place = await getPlaceById(params.placeId);
  if (!place) notFound();

  const { user } = await getCurrentUserAndProfile();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href={`/helyek/${place.slug}`} className="text-sm text-sni-brand-blue hover:underline">
        ← Vissza a hely adatlapjára
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Értékelés írása — {place.name}</h1>
      <p className="mt-2 text-gray-600">
        Köszönjük, hogy megosztod a tapasztalatodat! Ne adj meg gyermekkel kapcsolatos nevet,
        diagnózist vagy egészségügyi adatot.
      </p>
      <div className="mt-4">
        <Disclaimer />
      </div>

      {user ? (
        <div className="mt-6">
          <ReviewForm placeId={place.id} placeName={place.name} />
        </div>
      ) : (
        <div className="card mt-6 text-center">
          <p className="text-gray-600">Az értékelés beküldéséhez be kell jelentkezned.</p>
          <Link href="/belepes" className="btn-primary mt-4 inline-flex">
            Belépés / Regisztráció
          </Link>
        </div>
      )}
    </div>
  );
}
