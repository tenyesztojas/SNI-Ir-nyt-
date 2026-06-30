import Link from "next/link";
import { Search, MapPin, HeartHandshake, ArrowRight } from "lucide-react";
import { getCategories, getApprovedPlaces } from "@/lib/data";
import PlaceCard from "@/components/PlaceCard";

export default async function HomePage() {
  const [categories, places] = await Promise.all([getCategories(), getApprovedPlaces()]);
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
  const featuredPlaces = places.slice(0, 6);

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-sni-brand-navy via-[#195f80] to-sni-brand-teal">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/5" />
        <div aria-hidden className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-white/5" />

        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white">
            🏠 Biztonságos helyek minden családnak
          </div>
          <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-5xl">
            Találd meg a számodra<br className="hidden sm:block" /> barátságos helyeket
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/80 sm:text-lg">
            Autizmus- és ADHD-barát éttermek, játszóházak, fejlesztők és sok más —
            valódi családok tapasztalatai alapján.
          </p>

          <form
            action="/helyek"
            method="get"
            className="mt-8 overflow-hidden rounded-2xl bg-white p-2 shadow-2xl sm:flex sm:gap-2"
          >
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                size={20}
              />
              <input
                type="text"
                name="q"
                placeholder="Hely neve vagy város..."
                className="w-full rounded-xl border-0 py-3.5 pl-12 pr-4 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sni-brand-teal/50"
              />
            </div>
            <select
              name="kategoria"
              defaultValue=""
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white py-3.5 px-4 text-gray-700 focus:outline-none focus:ring-2 focus:ring-sni-brand-teal/50 sm:mt-0 sm:w-52"
            >
              <option value="">Minden kategória</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-sni-brand-teal px-8 py-3.5 font-bold text-white transition-colors hover:bg-sni-brand-blue sm:mt-0 sm:w-auto"
            >
              Keresés
            </button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/70">
            <span>
              <strong className="font-bold text-white">{places.length}+</strong> hely az adatbázisban
            </span>
            <span className="hidden sm:inline">·</span>
            <span>
              <strong className="font-bold text-white">{categories.length}</strong> kategória
            </span>
            <span className="hidden sm:inline">·</span>
            <span>
              <strong className="font-bold text-white">Ingyenes</strong> használat
            </span>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h2 className="text-xl font-bold text-gray-900">Böngéssz kategória szerint</h2>
        <p className="mt-1 text-sm text-gray-500">Válassz egy kategóriát a szűrt találatokhoz</p>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/helyek?kategoria=${c.slug}`}
              className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white p-4 text-center shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-sni-brand-teal/40 hover:shadow-softHover"
            >
              <span className="text-3xl leading-none" aria-hidden>{c.icon}</span>
              <span className="text-xs font-semibold leading-tight text-gray-700">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* FEATURED PLACES */}
      {featuredPlaces.length > 0 && (
        <section className="bg-gray-50 py-12">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Helyek a közösségtől</h2>
                <p className="mt-0.5 text-sm text-gray-500">Közösségi tapasztalatok alapján ajánlott helyek</p>
              </div>
              <Link href="/helyek" className="flex items-center gap-1 text-sm font-bold text-sni-brand-blue transition-colors hover:text-sni-brand-teal">
                Összes hely <ArrowRight size={16} />
              </Link>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featuredPlaces.map((p) => (
                <PlaceCard key={p.id} place={p} category={categoryBySlug.get(p.category)} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sni-brand-navy to-sni-brand-blue p-8 text-center sm:p-12">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/5" />
          <HeartHandshake className="mx-auto text-sni-brand-teal" size={44} />
          <h2 className="mt-4 text-2xl font-bold text-white sm:text-3xl">
            Ismersz egy barátságos helyet?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-base text-white/80">
            Segíts más családoknak! Minden beküldött hely egy-egy útkeresőnek könnyíti meg a mindennapokat.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/uj-hely" className="inline-flex items-center gap-2 rounded-full bg-sni-brand-teal px-8 py-3.5 font-bold text-white transition-all hover:bg-white hover:text-sni-brand-navy">
              <MapPin size={18} /> Hely beküldése
            </Link>
            <Link href="/helyek" className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-8 py-3.5 font-bold text-white transition-all hover:bg-white/10">
              Helyek böngészése
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
