import Link from "next/link";
import { getVisiblePlaces, getCategories, isCurrentUserAdmin } from "@/lib/data";
import { redirect } from "next/navigation";
import AdminAllPlaces from "@/components/AdminAllPlaces";

export default async function AdminAllPlacesPage() {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect("/");

  const [places, categories] = await Promise.all([getVisiblePlaces(), getCategories()]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sni-text">
          Összes hely ({places.length})
        </h1>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Szerkesztés, törlés, státuszváltás – minden hely egyben.
      </p>
      <div className="mt-6">
        <AdminAllPlaces initial={places} categories={categories} />
      </div>
    </div>
  );
}
