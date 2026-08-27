import { redirect, notFound } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/data";
import {
  getVjProductBySlug,
  getMySignal,
  getMyFulfillmentProfile,
  getMyWaitlistEntry,
} from "@/lib/vedett-jelzes/data";
import { PRODUCT_SLUGS } from "@/lib/vedett-jelzes/types";
import FeliratkozasForm from "./FeliratkozasForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { termek: string } }) {
  return { title: `Feliratkozás – Védett Jelzés ${params.termek}` };
}

export default async function FeliratkozasPage({
  params,
}: {
  params: { termek: string };
}) {
  // Validáció
  if (!(PRODUCT_SLUGS as readonly string[]).includes(params.termek)) notFound();

  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect(`/belepes?next=/vedett-jelzes/feliratkozas/${params.termek}`);

  const [product, signal, fulfillment, existing] = await Promise.all([
    getVjProductBySlug(params.termek),
    getMySignal(),
    getMyFulfillmentProfile(),
    getMyWaitlistEntry(params.termek),
  ]);

  if (!product) notFound();

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <a href="/vedett-jelzes" className="text-sm text-sni-brand-blue hover:underline">
        ← Védett Jelzés
      </a>

      <h1 className="mt-3 text-2xl font-extrabold text-sni-brand-navy">
        {product.name_hu}
      </h1>

      {product.status === "COMING_SOON" && (
        <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <strong>Ez a termék hamarosan rendelhető.</strong> Feliratkozásoddal értesítünk, amint megjelenik.
          Szállítási adataidat is rögzítjük, hogy a rendelés gyorsan menjen.
        </div>
      )}

      {/* Már feliratkozott */}
      {existing && existing.status !== "cancelled" ? (
        <div className="mt-8 rounded-2xl bg-green-50 border border-green-200 px-5 py-5">
          <p className="font-bold text-green-800">Már fel vagy iratkozva!</p>
          <p className="mt-1 text-sm text-green-700">
            Státusz: <strong>{existing.status === "pending" ? "Várólistán" : existing.status === "confirmed" ? "Visszaigazolva" : existing.status === "shipped" ? "Kiszállítva" : existing.status}</strong>
          </p>
          <a
            href="/vedett-jelzes/varolistaim"
            className="mt-3 inline-block text-sm font-medium text-sni-brand-blue hover:underline"
          >
            Várólistáim →
          </a>
        </div>
      ) : (
        <div className="mt-8">
          {!signal && (
            <div className="mb-6 rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
              <strong>Nincs még digitális jelzésed.</strong>{" "}
              <a href="/vedett-jelzes/sajat-jelzes" className="underline">
                Hozd létre a jelzésedet
              </a>
              , hogy a terméken is megjelenjen.
            </div>
          )}
          <FeliratkozasForm
            productSlug={product.slug}
            productName={product.name_hu}
            productStatus={product.status}
            fulfillment={fulfillment}
          />
        </div>
      )}
    </main>
  );
}
