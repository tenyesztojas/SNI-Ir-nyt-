import Link from "next/link";
import { isCurrentUserAdmin, getPlacesLog } from "@/lib/data";
import { redirect } from "next/navigation";
import { MapPin, User, Clock } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  published: "Közzétett",
  pending: "Függőben",
  rejected: "Elutasított",
  removed: "Eltávolított",
  archived: "Archivált",
};

const SOURCE_LABEL: Record<string, string> = {
  admin: "Admin",
  user_suggested: "Felhasználó",
  import: "Import",
};

export default async function AdminPlacesLogPage() {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect("/");

  const places = await getPlacesLog();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">
        Helyek beküldési naplója ({places.length})
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Melyik helyet ki és mikor adta hozzá — időrendben visszafelé.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-soft">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Hely</th>
              <th className="px-4 py-3">Beküldő</th>
              <th className="px-4 py-3">Forrás</th>
              <th className="px-4 py-3">Státusz</th>
              <th className="px-4 py-3">Dátum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {places.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/helyek/${p.slug}`}
                    className="font-medium text-sni-brand-blue hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="ml-1.5 text-xs text-gray-400">{p.city}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-gray-700">
                    <User size={13} className="text-gray-400" />
                    {p.submitterName}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {SOURCE_LABEL[p.source ?? ""] ?? p.source ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.status === "published" ? "bg-emerald-50 text-emerald-700" :
                    p.status === "removed" ? "bg-red-50 text-red-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 text-gray-500">
                    <Clock size={12} />
                    {new Date(p.createdAt).toLocaleDateString("hu-HU", {
                      year: "numeric", month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {places.length === 0 && (
          <p className="py-12 text-center text-gray-400">Nincs adat.</p>
        )}
      </div>
    </div>
  );
}
