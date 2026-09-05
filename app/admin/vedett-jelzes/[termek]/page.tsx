import Link from "next/link";
import { notFound } from "next/navigation";
import {
  adminGetWaitlistByProduct,
  getVjProductBySlug,
} from "@/lib/vedett-jelzes/data";
import {
  PRODUCT_SLUGS,
  NEURODIVERGENCE_LABELS,
} from "@/lib/vedett-jelzes/types";
import AdminStatusSelect from "./AdminStatusSelect";
import CsvExportButton from "./CsvExportButton";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    termek: string;
  }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { termek } = await params;

  return {
    title: `Admin – VJ ${termek}`,
  };
}

export default async function AdminVjTermekPage({
  params,
}: PageProps) {
  const { termek } = await params;

  if (!(PRODUCT_SLUGS as readonly string[]).includes(termek)) {
    notFound();
  }

  const [product, entries] = await Promise.all([
    getVjProductBySlug(termek),
    adminGetWaitlistByProduct(termek),
  ]);

  if (!product) {
    notFound();
  }

  const active = entries.filter((e) => e.status !== "cancelled");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        href="/admin/vedett-jelzes"
        className="text-sm text-sni-brand-blue hover:underline"
      >
        ← Védett Jelzés admin
      </Link>

      <div className="mt-3 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-sni-text">
          {product.name_hu}
        </h1>

        <div className="flex gap-2">
          <CsvExportButton
            entries={active}
            type="production"
            label="Gyártási CSV"
          />
          <CsvExportButton
            entries={active}
            type="fulfillment"
            label="Szállítási CSV"
          />
        </div>
      </div>

      <p className="mt-1 text-sm text-gray-500">
        {active.length} aktív bejegyzés (lemondott:{" "}
        {entries.length - active.length})
      </p>

      {active.length === 0 ? (
        <p className="mt-10 text-center text-gray-400">
          Még nincs aktív feliratkozó.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-400">
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">Név</th>
                <th className="pb-2 pr-4">E-mail</th>
                <th className="pb-2 pr-4">Cím</th>
                <th className="pb-2 pr-4">Érintettség</th>
                <th className="pb-2 pr-4">Feliratkozás</th>
                <th className="pb-2">Státusz</th>
              </tr>
            </thead>

            <tbody>
              {active.map((entry, i) => {
                const f = entry.fulfillment_snapshot;
                const s = entry.signal_snapshot;

                return (
                  <tr
                    key={entry.id}
                    className="border-b border-gray-100 align-top"
                  >
                    <td className="py-3 pr-4 text-gray-400">
                      {i + 1}
                    </td>

                    <td className="py-3 pr-4 font-medium text-sni-text">
                      {f?.full_name ?? "—"}
                    </td>

                    <td className="py-3 pr-4 text-gray-600">
                      {f?.email ?? "—"}
                    </td>

                    <td className="py-3 pr-4 text-gray-600">
                      {f
                        ? `${f.postal_code} ${f.city}, ${f.address_line}`
                        : "—"}
                    </td>

                    <td className="py-3 pr-4 text-gray-600">
                      {s
                        ? NEURODIVERGENCE_LABELS[
                            s.neurodivergence_type
                          ]
                        : "—"}
                    </td>

                    <td className="py-3 pr-4 text-gray-400">
                      {new Date(entry.created_at).toLocaleDateString(
                        "hu-HU"
                      )}
                    </td>

                    <td className="py-3">
                      <AdminStatusSelect
                        entryId={entry.id}
                        currentStatus={entry.status}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}