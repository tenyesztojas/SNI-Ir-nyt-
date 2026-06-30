import Link from "next/link";
import { Search, MapPin, HeartHandshake } from "lucide-react";
import { getCategories, getApprovedPlaces } from "@/lib/data";

export default async function HomePage() {
  const [categories, places] = await Promise.all([getCategories(), getApprovedPlaces()]);

  return (
    <div>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sni-brand-teal/20 blur-3xl sm:h-96 sm:w-96"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 top-32 h-56 w-56 rounded-full bg-sni-brand-navy/10 blur-3xl sm:h-72 sm:w-72"
        />

        <div className="relative mx-auto max-w-5xl px-4 pt-10 pb-6 sm:px-6 sm:pt-16">
        <h1 className="text-3xl font-bold leading-tight text-sni-text sm:text-4xl">
          Autizmus- és SNI-barát helyek térképe családoknak
        </h1>
        <p className="mt-4 max-w-2xl text-base text-gray-600 sm:text-lg">
          Az SNI Iránytű közösségi tapasztalatok alapján segít megtalálni a nyugodtabb,
          elfogadóbb és szenzorosan kevésbé terhelő helyeket — éttermeket, játszóházakat,
          fejlesztőházakat és sok mást. Nem orvosi vagy diagnosztikai eszköz: valódi családok
          valódi tapasztalatai.
        </p>

        <form action="/helyek" method="get" className="mt-8 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              name="q"
              placeholder="Település vagy hely neve..."
              className="input-field pl-11"
            />
          </div>
          <select name="kategoria" className="input-field sm:w-64" defaultValue="">
            <option value="">Összes kategória</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary">
            Hely keresése
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/uj-hely" className="btn-secondary">
            <MapPin size={18} /> Új hely beküldése
          </Link>
          <Link href="/helyek" className="btn-secondary">
            Összes hely böngészése ({places.length})
          </Link>
        </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
        <div className="card flex items-start gap-4 bg-sni-green/30">
          <HeartHandshake className="mt-1 flex-shrink-0 text-sni-greendark" size={28} />
          <div>
            <p className="text-lg font-semibold text-sni-text">
              Segíts más családoknak a tapasztalatoddal.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Minden beküldött hely és értékelés egy-egy családnak segít abban, hogy ne vakon
              induljon el egy új helyre.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <h2 className="text-xl font-semibold text-sni-text">Kategóriák</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/helyek?kategoria=${c.slug}`}
              className="card flex flex-col items-center gap-2 py-5 text-center"
            >
              <span className="text-2xl" aria-hidden>
                {c.icon}
              </span>
              <span className="text-sm font-medium text-sni-text">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
