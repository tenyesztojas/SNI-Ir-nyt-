import Link from "next/link";
import { MapPin, HeartHandshake, ArrowRight, CalendarDays, ExternalLink } from "lucide-react";
import { getCategories, getApprovedPlaces, citiesFromPlaces } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import PlaceCard from "@/components/PlaceCard";
import HeroSearchForm from "@/components/HeroSearchForm";

export default async function HomePage() {
  const supabase = createClient();
  const [categories, places, programsResult] = await Promise.all([
    getCategories(),
    getApprovedPlaces(),
    supabase
      .from("programs")
      .select("id, name, location, event_date, description, url")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);
  const programs = programsResult.data ?? [];
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
  const cities = citiesFromPlaces(places);
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
            VédettSarok —<br className="hidden sm:block" /> itt biztonságban vagy!
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-white/80 sm:text-lg">
            Közösségi térkép és tudástár autizmussal és ADHD-val érintett családoknak,
            szülőknek és szakembereknek, hogy könnyebb legyen biztonságos,
            elfogadó és kiszámítható helyeket találni.
          </p>

          <HeroSearchForm categories={categories} cities={cities} />

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/70">
            <span>
              <strong className="font-bold text-white">{Math.floor(places.length / 5) * 5}+</strong> hely az adatbázisban
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
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/helyek?kategoria=${c.slug}`}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white px-2 py-5 text-center shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-sni-brand-teal/40 hover:shadow-softHover min-h-[110px]"
            >
              <span className="text-4xl leading-none" aria-hidden>{c.icon}</span>
              <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-gray-700">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* PROGRAMAJÁNLÓ */}
      {programs && programs.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-4 pt-2 sm:px-6">
          <div className="rounded-3xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-indigo-100 p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <CalendarDays size={22} className="text-indigo-500" />
                  Programajánló
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">Autizmus- és ADHD-barát közelgő programok</p>
              </div>
              <Link
                href="/programajanlok"
                target="_blank"
                className="flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Összes program <ArrowRight size={16} />
              </Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {programs.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-2 rounded-2xl bg-white border border-indigo-100 px-4 py-4 shadow-soft"
                >
                  <p className="font-bold text-gray-900 leading-snug">{p.name}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><MapPin size={12} />{p.location}</span>
                    <span className="flex items-center gap-1"><CalendarDays size={12} />{p.event_date}</span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{p.description}</p>
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-auto flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      <ExternalLink size={12} /> Részletek
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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

      {/* PARTNER */}
      <section className="mx-auto max-w-5xl px-4 pb-12 pt-2 sm:px-6">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-8 shadow-soft sm:flex-row sm:justify-center sm:gap-8">
          <p className="text-sm font-semibold text-gray-500 whitespace-nowrap">Szakmai tanácsadó partnerünk:</p>
          <a
            href="https://www.vadaskertiskola.hu/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-75"
          >
            <img
              src="https://files.site.forpsi.com/8f/e1/8fe1f8dc-27e2-4b90-8fbe-c37cb77711d6.png"
              alt="Vadaskert Általános Iskola"
              className="h-12 w-auto object-contain"
            />
          </a>
        </div>
      </section>
    </div>
  );
}
