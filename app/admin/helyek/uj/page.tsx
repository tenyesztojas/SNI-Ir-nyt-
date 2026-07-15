import Link from "next/link";
import { MapPin } from "lucide-react";
import { getCategories } from "@/lib/data";
import AdminNewPlaceForm from "@/components/AdminNewPlaceForm";

export default async function AdminNewPlacePage() {
  const categories = await getCategories();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <MapPin className="text-sni-brand-teal" size={26} />
        <h1 className="text-2xl font-bold text-sni-text">Új hely felvitele (admin)</h1>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Admin által közvetlenül hozzáadott hely — azonnal megjelenik jóváhagyás nélkül.
      </p>

      <div className="mt-6">
        <AdminNewPlaceForm categories={categories} />
      </div>
    </div>
  );
}
