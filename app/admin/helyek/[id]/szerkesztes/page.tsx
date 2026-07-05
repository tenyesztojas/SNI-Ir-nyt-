import Link from "next/link";
import { getPlaceById, getCategories, isCurrentUserAdmin } from "@/lib/data";
import { redirect, notFound } from "next/navigation";
import AdminPlaceEditForm from "@/components/AdminPlaceEditForm";

export default async function AdminPlaceEditPage({ params }: { params: { id: string } }) {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect("/");

  const [place, categories] = await Promise.all([
    getPlaceById(params.id),
    getCategories(),
  ]);

  if (!place) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/admin/helyek/osszes" className="text-sm text-sni-brand-blue hover:underline">
        ← Összes hely
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Hely szerkesztése</h1>
      <p className="mt-1 text-sm text-gray-500 font-mono">{place.name}</p>
      <div className="mt-6">
        <AdminPlaceEditForm place={place} categories={categories} />
      </div>
    </div>
  );
}
