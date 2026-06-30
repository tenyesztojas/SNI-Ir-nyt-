import Link from "next/link";
import { getCategories, getCurrentUserAndProfile } from "@/lib/data";
import NewPlaceForm from "@/components/NewPlaceForm";

export default async function NewPlacePage() {
  const { user } = await getCurrentUserAndProfile();

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-bold text-sni-text">Új hely beküldése</h1>
        <p className="mt-3 text-gray-600">
          Hely beküldéséhez be kell jelentkezned.
        </p>
        <Link href="/belepes" className="btn-primary mt-6 inline-flex">
          Belépés / Regisztráció
        </Link>
      </div>
    );
  }

  const categories = await getCategories();
  return <NewPlaceForm categories={categories} />;
}
