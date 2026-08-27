import Link from "next/link";
import Image from "next/image";
import { Shield, CreditCard, Pin, Award, ArrowRight, CheckCircle } from "lucide-react";
import { getVjProducts } from "@/lib/vedett-jelzes/data";
import { getCurrentUserAndProfile } from "@/lib/data";
import type { VjProduct } from "@/lib/vedett-jelzes/types";

export const metadata = {
  title: "Védett Jelzés – VédettSarok",
  description:
    "Digitális és fizikai azonosító autizmus spektrumon élők és ADHD-val élők számára. Jelezd segítségigényeidet — érthetően, gyorsan.",
};

export const dynamic = "force-dynamic";

function ProductCard({ product }: { product: VjProduct }) {
  const icon =
    product.slug === "kartya"
      ? CreditCard
      : product.slug === "jelveny"
      ? Pin
      : Award;
  const Icon = icon;

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sni-blue">
          <Icon size={20} className="text-sni-brand-blue" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-sni-text">{product.name_hu}</h3>
          {product.status === "COMING_SOON" && (
            <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              Hamarosan rendelhető
            </span>
          )}
          {product.status === "AVAILABLE" && (
            <span className="mt-0.5 inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
              Elérhető
            </span>
          )}
        </div>
      </div>
      {product.description_hu && (
        <p className="text-sm text-gray-600">{product.description_hu}</p>
      )}
      <Link
        href={`/vedett-jelzes/feliratkozas/${product.slug}`}
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-sni-brand-teal px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sni-brand-blue"
      >
        {product.status === "COMING_SOON" ? "Feliratkozás értesítőre" : "Megrendelés"} <ArrowRight size={15} />
      </Link>
    </div>
  );
}

const BENEFITS = [
  "Azonnal megmutatja a segítségigényeidet — szavak nélkül",
  "Digitálisan mindig nálad van — semmi extra eszköz nem kell",
  "QR kóddal beolvasható — részletes tájékoztatás percek alatt",
  "Fizikai kártya, jelvény vagy nyakba akasztó — viseld ahogy kényelmes",
];

export default async function VedettJelzesPage() {
  const [products, { user }] = await Promise.all([
    getVjProducts(),
    getCurrentUserAndProfile(),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">

      {/* Hero */}
      <section className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
        <div className="shrink-0">
          <Image
            src="/vedett-jelzes-logo.png"
            alt="Védett Jelzés logó"
            width={140}
            height={140}
            priority
            className="drop-shadow-sm"
          />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-sni-brand-navy sm:text-4xl">
            Védett Jelzés
          </h1>
          <p className="mt-3 max-w-xl text-lg text-gray-600">
            Digitális azonosító autizmus spektrumon élők és ADHD-val élők számára.
            Mutasd meg segítségigényeidet — érthetően, gyorsan, szavak nélkül.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {user ? (
              <Link
                href="/vedett-jelzes/sajat-jelzes"
                className="inline-flex items-center gap-2 rounded-full bg-sni-brand-teal px-6 py-3 font-bold text-white shadow-md transition hover:bg-sni-brand-blue hover:shadow-lg"
              >
                <Shield size={18} /> Saját jelzésem
              </Link>
            ) : (
              <Link
                href="/belepes?next=/vedett-jelzes/sajat-jelzes"
                className="inline-flex items-center gap-2 rounded-full bg-sni-brand-teal px-6 py-3 font-bold text-white shadow-md transition hover:bg-sni-brand-blue hover:shadow-lg"
              >
                <Shield size={18} /> Jelzésem létrehozása
              </Link>
            )}
            <Link
              href="#termekek"
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-6 py-3 font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Fizikai termékek
            </Link>
          </div>
        </div>
      </section>

      {/* Előnyök */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-sni-text">Mire jó a Védett Jelzés?</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-3 rounded-2xl bg-sni-blue/40 px-4 py-3">
              <CheckCircle size={18} className="mt-0.5 shrink-0 text-sni-brand-teal" />
              <span className="text-sm text-gray-700">{b}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Digitális kártya CTA */}
      <section className="mt-12 rounded-3xl bg-gradient-to-br from-sni-brand-navy to-sni-brand-blue p-8 text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold">Digitális Védett Jelzés</h2>
            <p className="mt-2 max-w-md text-sm text-white/80">
              Hozd létre a személyes digitális jelzésedet. Megjelenik a telefonon, beolvasható QR kóddal,
              és bármikor aktiválhatod a Túlterhelődtem módot.
            </p>
          </div>
          {user ? (
            <Link
              href="/vedett-jelzes/sajat-jelzes"
              className="shrink-0 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-sni-brand-navy transition hover:bg-gray-100"
            >
              Saját jelzésem <ArrowRight size={16} />
            </Link>
          ) : (
            <Link
              href="/belepes?next=/vedett-jelzes/sajat-jelzes"
              className="shrink-0 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-sni-brand-navy transition hover:bg-gray-100"
            >
              Belépés / Regisztráció <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </section>

      {/* Fizikai termékek */}
      <section id="termekek" className="mt-14">
        <h2 className="text-xl font-bold text-sni-text">Fizikai termékek</h2>
        <p className="mt-2 text-sm text-gray-500">
          Rendelhető kártyák, jelvények és nyakba akasztók — a jelzésedet valódi tárgyra nyomtatva.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Saját várólisták link */}
      {user && (
        <div className="mt-8 text-center">
          <Link
            href="/vedett-jelzes/varolistaim"
            className="text-sm font-medium text-sni-brand-blue hover:underline"
          >
            Saját várólistáim →
          </Link>
        </div>
      )}
    </main>
  );
}
