export const dynamic = "force-dynamic";

import ViewToggle from "@/components/ViewToggle";
import PlaceCard from "@/components/PlaceCard";
import PlacesSearchForm from "@/components/PlacesSearchForm";
import { getCategories, getApprovedPlaces, citiesFromPlaces } from "@/lib/data";

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export default async function HelyekPage({
  searchParams,
}: {
  searchParams: { q?: string; kategoria?: string; telepules?: string };
}) {
  const q = searchParams.q?.trim() ?? "";
  const kategoria = searchParams.kategoria ?? "";
  const telepules = searchParams.telepules ?? "";

  const [categories, places] = await Promise.all([getCategories(), getApprovedPlaces()]);
  const cities = citiesFromPlaces(places);
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  const filtered = places.filter((p) => {
    const matchesQ =
      q === "" ||
      normalize(p.name).includes(normalize(q)) ||
      normalize(p.city).includes(normalize(q));
    const matchesCategory = kategoria === "" || p.category === kategoria;
    const matchesCity = telepules === "" || p.city === telepules;
    return matchesQ && matchesCategory && matchesCity;
  });

  const isFiltered = q !== "" || kategoria !== "" || telepules !== "";

  return (
    <div>
      <div className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-gray-900">Helyek keresése</h1>
          <PlacesSearchForm
            categories={categories}
            cities={cities}
            defaultQ={q}
            defaultKategoria={kategoria}
            defaultTelepules={telepules}
          />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            <strong className="font-semibold text-gray-900">{filtered.length} hely</strong> található
            {isFiltered && " a szűrési feltételeknek megfelelően"}
          </p>
          {isFiltered && (
            <a href="/helyek" className="text-sm font-semibold text-sni-brand-blue hover:text-sni-brand-teal">
              Szűrők törlése ×
            </a>
          )}
        </div>

        <ViewToggle
          places={filtered}
          categories={categories}
          listView={
            filtered.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((p) => (
                  <PlaceCard key={p.id} place={p} category={categoryBySlug.get(p.category)} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-soft">
                <p className="text-4xl">🔍</p>
                <p className="mt-3 font-semibold text-gray-700">Nincs a szűrésnek megfelelő hely</p>
                <p className="mt-1 text-sm text-gray-500">Próbálj más keresőszót vagy kategóriát</p>
                <a href="/helyek" className="mt-4 inline-flex items-center rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-white hover:bg-sni-brand-blue">
                  Összes hely
                </a>
              </div>
            )
          }
        />
      </div>
    </div>
  );
}
