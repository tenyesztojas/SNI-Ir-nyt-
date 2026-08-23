import { redirect } from "next/navigation";
import Link from "next/link";
import { isCurrentUserAdmin } from "@/lib/data";
import { adminGetAllCommunityProfiles } from "@/lib/community/data";
import { ROLE_LABELS } from "@/lib/community/types";
import AdminProfileAction from "./AdminProfileAction";

export const metadata = { title: "Közösség moderáció – Admin" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  draft: "Piszkozat",
  pending_review: "Jóváhagyásra vár",
  active: "Aktív",
  hidden_by_user: "Elrejtve",
  suspended: "Felfüggesztve",
  deleted: "Törölve",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending_review: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  hidden_by_user: "bg-gray-100 text-gray-500",
  suspended: "bg-red-100 text-red-700",
  deleted: "bg-red-200 text-red-800",
};

export default async function AdminKozossegPage() {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect("/");

  const profiles = await adminGetAllCommunityProfiles();

  const pending = profiles.filter((p) => p.status === "pending_review");
  const active = profiles.filter((p) => p.status === "active");
  const others = profiles.filter(
    (p) => !["pending_review", "active"].includes(p.status)
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-sni-text">Közösség moderáció</h1>
        <Link href="/admin/kozosseg/jelentesek" className="btn-secondary text-sm">
          Jelentések →
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="card">
          <p className="text-2xl font-bold text-amber-600">{pending.length}</p>
          <p className="text-xs text-gray-500">Jóváhagyásra vár</p>
        </div>
        <div className="card">
          <p className="text-2xl font-bold text-green-600">{active.length}</p>
          <p className="text-xs text-gray-500">Aktív</p>
        </div>
        <div className="card">
          <p className="text-2xl font-bold text-gray-600">{profiles.length}</p>
          <p className="text-xs text-gray-500">Összes</p>
        </div>
      </div>

      {/* Jóváhagyásra váró profilok */}
      {pending.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-amber-700 mb-3">
            Jóváhagyásra vár ({pending.length})
          </h2>
          <ProfileTable profiles={pending} />
        </section>
      )}

      {/* Aktív profilok */}
      <section className="mt-8">
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          Aktív profilok ({active.length})
        </h2>
        <ProfileTable profiles={active} />
      </section>

      {/* Egyéb */}
      {others.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            Egyéb ({others.length})
          </h2>
          <ProfileTable profiles={others} />
        </section>
      )}
    </div>
  );

  function ProfileTable(props: { profiles: typeof profiles }) {
    return (
      <div className="overflow-x-auto rounded-2xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Név</th>
              <th className="px-4 py-3 text-left">Szerepkör</th>
              <th className="px-4 py-3 text-left">Helyszín</th>
              <th className="px-4 py-3 text-left">Státusz</th>
              <th className="px-4 py-3 text-left">Létrehozva</th>
              <th className="px-4 py-3 text-left">Műveletek</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {props.profiles.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-sni-text">{p.display_name}</td>
                <td className="px-4 py-3 text-gray-500">{ROLE_LABELS[p.role]}</td>
                <td className="px-4 py-3 text-gray-400">
                  {p.city}{p.district ? `, ${p.district}` : ""}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(p.created_at).toLocaleDateString("hu-HU")}
                </td>
                <td className="px-4 py-3">
                  <AdminProfileAction profileId={p.id} currentStatus={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}
