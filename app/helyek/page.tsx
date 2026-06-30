import ViewToggle from "@/components/ViewToggle";
import PlaceCard from "@/components/PlaceCard";
import { getCategories, getApprovedPlaces, citiesFromPlaces } from "@/lib/data";

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
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
      q === "" || normalize(p.name).includes(normalize(q)) || normalize(p.city).includes(normalize(q));
    const matchesCategory = kategoria === "" || p.category === kategoria;
    const matchesCity = telepules === "" || p.city === telepules;
    return matchesQ && matchesCategory && matchesCity;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-sni-text">Helyek keresése</h1>

      <form action="/helyek" method="get" className="mt-5 grid gap-3 sm:grid-cols-4">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Település vagy hely neve..."
          className="input-field sm:col-span-2"
        />
        <select name="kategoria" defaultValue={kategoria} className="input-field">
          <option value="">Összes kategória</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <select name="telepules" defaultValue={telepules} className="input-field">
          <option value="">Összes település</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary sm:col-span-4 sm:w-fit">
          Szűrés
        </button>
      </form>

      <p className="mt-6 text-sm text-gray-500">{filtered.length} hely található.</p>

      <div className="mt-3">
        <ViewToggle
          places={filtered}
          categories={categories}
          listView={
            filtered.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((p) => (
                  <PlaceCard key={p.id} place={p} category={categoryBySlug.get(p.category)} />
                ))}
              </div>
            ) : (
              <div className="card text-center text-gray-500">
                Nincs a szűrésnek megfelelő hely. Próbálj más keresőszót vagy kategóriát.
              </div>
            )
          }
        />
      </div>
    </div>
  );
}
