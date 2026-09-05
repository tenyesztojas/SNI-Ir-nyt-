import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getMyWaitlistEntries } from "@/lib/vedett-jelzes/data";
import { WAITLIST_STATUS_LABELS } from "@/lib/vedett-jelzes/types";
import CancelButton from "./CancelButton";

export const metadata = {
  title: "Várólistáim – Védett Jelzés",
};

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  shipped:   "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export default async function VarolistaPage(
  props: {
    searchParams: Promise<{ feliratkozott?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes?next=/vedett-jelzes/varolistaim");

  const entries = await getMyWaitlistEntries();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <a href="/vedett-jelzes" className="text-sm text-sni-brand-blue hover:underline">
        ← Védett Jelzés
      </a>

      <h1 className="mt-3 text-2xl font-extrabold text-sni-brand-navy">Saját várólistáim</h1>

      {searchParams.feliratkozott && (
        <div className="mt-4 rounded-2xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-700">
          ✓ Sikeresen feliratkoztál! Értesítünk, amint a termék elérhető.
        </div>
      )}

      {entries.length === 0 ? (
        <div className="mt-10 rounded-2xl bg-gray-50 px-6 py-10 text-center">
          <p className="text-gray-500">Még nincs várólistás feliratkozásod.</p>
          <a
            href="/vedett-jelzes"
            className="mt-4 inline-block rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-white transition hover:bg-sni-brand-blue"
          >
            Termékek megtekintése
          </a>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          {entries.map((entry) => (
            <div key={entry.id} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-sni-text">
                    {entry.product?.name_hu ?? entry.product_slug}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Feliratkozás: {new Date(entry.created_at).toLocaleDateString("hu-HU")}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    STATUS_COLORS[entry.status] ?? "bg-gray-100 text-gray-500"
                  }`}
                >
                  {WAITLIST_STATUS_LABELS[entry.status] ?? entry.status}
                </span>
              </div>

              {entry.fulfillment_snapshot && (
                <p className="text-xs text-gray-500">
                  Szállítás: {entry.fulfillment_snapshot.city},{" "}
                  {entry.fulfillment_snapshot.address_line}
                </p>
              )}

              {entry.status === "pending" && (
                <CancelButton productSlug={entry.product_slug} />
              )}

              {entry.status === "confirmed" && (
                <p className="text-xs font-medium text-blue-600">
                  ✓ Visszaigazolva{" "}
                  {entry.confirmed_at
                    ? new Date(entry.confirmed_at).toLocaleDateString("hu-HU")
                    : ""}
                </p>
              )}

              {entry.status === "shipped" && (
                <p className="text-xs font-medium text-green-600">
                  ✓ Kiszállítva{" "}
                  {entry.shipped_at
                    ? new Date(entry.shipped_at).toLocaleDateString("hu-HU")
                    : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
