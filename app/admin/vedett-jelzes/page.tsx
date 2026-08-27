import Link from "next/link";
import { adminGetWaitlistKpis, adminGetAllWaitlistEntries } from "@/lib/vedett-jelzes/data";
import { getVjProducts } from "@/lib/vedett-jelzes/data";
import { PRODUCT_SLUG_LABELS } from "@/lib/vedett-jelzes/types";
import AdminToggleProductStatus from "./AdminToggleProductStatus";

export const dynamic = "force-dynamic";

export default async function AdminVedettJelzesPage() {
  const [kpis, products] = await Promise.all([
    adminGetWaitlistKpis(),
    getVjProducts(),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Védett Jelzés — Admin</h1>
      <p className="mt-1 text-sm text-gray-500">
        Termékvárólisták kezelése, státuszkezelés és CSV export.
      </p>

      {/* KPI kártyák */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {products.map((product) => {
          const stat = kpis[product.slug] ?? { total: 0, pending: 0, confirmed: 0, shipped: 0 };
          return (
            <div key={product.slug} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <p className="font-bold text-sni-text">{product.name_hu}</p>
                <AdminToggleProductStatus slug={product.slug} currentStatus={product.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-gray-50 px-3 py-2 text-center">
                  <p className="text-xl font-extrabold text-sni-brand-navy">{stat.total}</p>
                  <p className="text-xs text-gray-500">Összes</p>
                </div>
                <div className="rounded-xl bg-amber-50 px-3 py-2 text-center">
                  <p className="text-xl font-extrabold text-amber-600">{stat.pending}</p>
                  <p className="text-xs text-gray-500">Várólistán</p>
                </div>
                <div className="rounded-xl bg-blue-50 px-3 py-2 text-center">
                  <p className="text-xl font-extrabold text-blue-600">{stat.confirmed}</p>
                  <p className="text-xs text-gray-500">Visszaigazolt</p>
                </div>
                <div className="rounded-xl bg-green-50 px-3 py-2 text-center">
                  <p className="text-xl font-extrabold text-green-600">{stat.shipped}</p>
                  <p className="text-xs text-gray-500">Kiszállított</p>
                </div>
              </div>
              <Link
                href={`/admin/vedett-jelzes/${product.slug}`}
                className="mt-auto inline-flex items-center justify-center rounded-xl bg-sni-brand-teal px-4 py-2 text-sm font-bold text-white transition hover:bg-sni-brand-blue"
              >
                Részletek →
              </Link>
            </div>
          );
        })}
      </div>

      {/* Termék slug / label referencia */}
      <div className="mt-8 text-xs text-gray-400">
        {Object.entries(PRODUCT_SLUG_LABELS).map(([slug, label]) => (
          <span key={slug} className="mr-4">{slug} = {label}</span>
        ))}
      </div>
    </div>
  );
}
