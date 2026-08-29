import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import MediaAdminForm from "./MediaAdminForm";
import MediaDeleteButton from "./MediaDeleteButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin – Médiamegjelenések",
};

async function getMediaAppearances() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("media_appearances")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return data ?? [];
}

export default async function AdminMediaPage() {
  const items = await getMediaAppearances();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Médiamegjelenések</h1>
      <p className="mt-1 text-sm text-gray-500">
        YouTube videók beágyazva jelennek meg. Cikk linkek külső oldalra nyílnak.
      </p>

      {/* Hozzáadás form */}
      <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <h2 className="mb-4 font-bold text-sni-text">Új megjelenés hozzáadása</h2>
        <MediaAdminForm />
      </div>

      {/* Lista */}
      <div className="mt-8">
        <h2 className="mb-4 font-bold text-sni-text">
          Megjelenések ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-gray-400">Még nincs hozzáadva megjelenés.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        item.type === "youtube"
                          ? "bg-red-100 text-red-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {item.type === "youtube" ? "YouTube" : "Cikk"}
                    </span>
                    {item.published_at && (
                      <span className="text-xs text-gray-400">
                        {new Date(item.published_at).toLocaleDateString("hu-HU")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-semibold text-sni-text truncate">{item.title}</p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 block truncate text-xs text-sni-brand-blue hover:underline"
                  >
                    {item.url}
                  </a>
                </div>
                <MediaDeleteButton id={item.id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
