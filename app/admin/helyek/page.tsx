import Link from "next/link";
import { getPendingPlacesWithSubmitter } from "@/lib/data";
import AdminPendingPlaces from "@/components/AdminPendingPlaces";
import { getCategories } from "@/lib/data";

export default async function AdminPendingPlacesPage() {
  const [places, categories] = await Promise.all([
    getPendingPlacesWithSubmitter(),
    getCategories(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Helyek kezelése</h1>
      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Tájékoztató:</strong> A felhasználók által beküldött helyek automatikusan kerülnek közzétételre
        (ÁSZF 3. pont). Az alábbi lista a korábbi, még nem feldolgozott javaslatokat mutatja.
        Szerkesztés az adatminőség javítása érdekében lehetséges — ez nem minősül tartalmi jóváhagyásnak.
      </div>
      {places.length === 0 ? (
        <p className="mt-8 text-center text-gray-500">Nincs feldolgozatlan javaslat.</p>
      ) : (
        <div className="mt-6">
          <AdminPendingPlaces initial={places} categories={categories} />
        </div>
      )}
    </div>
  );
}
