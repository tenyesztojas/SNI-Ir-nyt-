import Link from "next/link";
import { UserCircle } from "lucide-react";
import { getCurrentUserAndProfile, getOwnPlaces, getOwnReviews } from "@/lib/data";
import { signOutAction } from "@/lib/actions/auth";

const placeStatusLabel: Record<string, string> = {
  pending: "Jóváhagyásra vár",
  approved: "Jóváhagyva",
  rejected: "Elutasítva",
  archived: "Archiválva",
};

const reviewStatusLabel: Record<string, string> = {
  pending: "Jóváhagyásra vár",
  approved: "Jóváhagyva",
  rejected: "Elutasítva",
};

export default async function ProfilePage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <UserCircle className="mx-auto text-sni-brand-blue" size={40} />
        <h1 className="mt-4 text-2xl font-bold text-sni-text">Profil</h1>
        <p className="mt-3 text-gray-600">
          Bejelentkezés után itt látod a saját beküldött helyeidet és az értékeléseidet.
        </p>
        <Link href="/belepes" className="btn-primary mt-6 inline-flex">
          Belépés / Regisztráció
        </Link>
      </div>
    );
  }

  const [places, reviews] = await Promise.all([getOwnPlaces(user.id), getOwnReviews(user.id)]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <UserCircle className="text-sni-brand-blue" size={36} />
          <div>
            <h1 className="text-2xl font-bold text-sni-text">{profile?.displayName ?? "Profil"}</h1>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="btn-secondary">
            Kijelentkezés
          </button>
        </form>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-sni-text">Beküldött helyeid ({places.length})</h2>
        {places.length === 0 ? (
          <p className="mt-2 text-gray-500">Még nem küldtél be helyet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {places.map((p) => (
              <div key={p.id} className="card flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sni-text">{p.name}</p>
                  <p className="text-sm text-gray-500">{p.city}</p>
                </div>
                <span className="text-sm font-medium text-sni-brand-blue">
                  {placeStatusLabel[p.status] ?? p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-sni-text">Értékeléseid ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <p className="mt-2 text-gray-500">Még nem írtál értékelést.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {reviews.map((r) => (
              <div key={r.id} className="card flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sni-text">{r.title}</p>
                  <p className="text-sm text-gray-500">Összbenyomás: {r.overallRating}/5</p>
                </div>
                <span className="text-sm font-medium text-sni-brand-blue">
                  {reviewStatusLabel[r.status] ?? r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
