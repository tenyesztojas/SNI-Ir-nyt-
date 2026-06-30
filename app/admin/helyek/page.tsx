import Link from "next/link";
import { getPendingPlaces, getCategories } from "@/lib/data";
import AdminPendingPlaces from "@/components/AdminPendingPlaces";

export default async function AdminPlacesPage() {
  const [pendingPlaces, categories] = await Promise.all([getPendingPlaces(), getCategories()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Beküldött helyek jóváhagyása</h1>
      <p className="mt-2 text-gray-600">
        Felhasználók által beküldött, &quot;pending&quot; státuszú helyek.
      </p>
      <div className="mt-6">
        <AdminPendingPlaces initial={pendingPlaces} categories={categories} />
      </div>
    </div>
  );
}
