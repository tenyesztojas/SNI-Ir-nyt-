import Link from "next/link";
import { Heart } from "lucide-react";
import { getCurrentUserAndProfile, getFavoritePlaces, getCategories } from "@/lib/data";
import PlaceCard from "@/components/PlaceCard";

export default async function FavoritesPage() {
  const { user } = await getCurrentUserAndProfile();

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <Heart className="mx-auto text-sni-brand-blue" size={40} />
        <h1 className="mt-4 text-2xl font-bold text-sni-text">Kedvenc helyeid</h1>
        <p className="mt-3 text-gray-600">
          A kedvenc helyek mentéséhez be kell jelentkezned — ezután bármelyik hely lapján egy
          kattintással elmentheted, és itt mindig megtalálod őket.
        </p>
        <Link href="/belepes" className="btn-primary mt-6 inline-flex">
          Belépés / Regisztráció
        </Link>
      </div>
    );
  }

  const [places, categories] = await Promise.all([getFavoritePlaces(user.id), getCategories()]);
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-sni-text">Kedvenc helyeid</h1>

      {places.length === 0 ? (
        <div className="card mt-6 text-center text-gray-500">
          Még nincs kedvenc helyed. Keress helyeket a{" "}
          <Link href="/helyek" className="text-sni-brand-blue underline">
            Helyek keresése
          </Link>{" "}
          oldalon, és a részletes nézetben mentsd el a kedvenceid közé.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((p) => (
            <PlaceCard key={p.id} place={p} category={categoryBySlug.get(p.category)} />
          ))}
        </div>
      )}
    </div>
  );
}
