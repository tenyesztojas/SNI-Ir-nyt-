import Link from "next/link";
import { getPendingReviews, getVisiblePlaces } from "@/lib/data";
import AdminPendingReviews from "@/components/AdminPendingReviews";

export default async function AdminReviewsPage() {
  const [pendingReviews, places] = await Promise.all([getPendingReviews(), getVisiblePlaces()]);
  const placeNameById: Record<string, string> = {};
  for (const p of places) placeNameById[p.id] = p.name;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Értékelések moderálása</h1>
      <p className="mt-2 text-gray-600">
        Felhasználók által beküldött, &quot;pending&quot; státuszú értékelések.
      </p>
      <div className="mt-6">
        <AdminPendingReviews initial={pendingReviews} placeNameById={placeNameById} />
      </div>
    </div>
  );
}
