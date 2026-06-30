import { Search, SlidersHorizontal } from "lucide-react";
import ViewToggle from "@/components/ViewToggle";
import PlaceCard from "@/components/PlaceCard";
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
          <form action="/helyek" method="get" className="mt-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Település vagy hely neve..."
                className="input-field pl-10"
              />
            </div>
            <select name="kategoria" defaultValue={kategoria} className="input-field sm:w-52">
              <option value="">Összes kategória</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            <select name="telepules" defaultValue={telepules} className="input-field sm:w-44">
              <option value="">Összes település</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button type="submit" className="btn-primary sm:px-6">
              <SlidersHorizontal size={16} /> Szűrés
            </button>
          </form>
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
