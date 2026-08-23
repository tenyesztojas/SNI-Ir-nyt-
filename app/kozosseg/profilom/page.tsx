import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getOwnCommunityProfile } from "@/lib/community/data";
import {
  ROLE_LABELS,
  CONNECTION_GOAL_OPTIONS,
  NEURODIVERGENCE_OPTIONS,
  CHILD_AGE_OPTIONS,
} from "@/lib/community/types";
import ProfileEditForm from "./ProfileEditForm";

export const metadata = { title: "Közösségi profilom – VédettSarok" };
export const dynamic = "force-dynamic";

export default async function ProfilomPage({
  searchParams,
}: {
  searchParams: { uj?: string };
}) {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes");

  const profile = await getOwnCommunityProfile();
  if (!profile) redirect("/kozosseg/bekapcsolas");

  const statusLabels: Record<string, string> = {
    draft: "Piszkozat",
    pending_review: "Jóváhagyásra vár",
    active: "Aktív",
    hidden_by_user: "Elrejtve",
    suspended: "Felfüggesztve",
    deleted: "Törölve",
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {searchParams.uj === "1" && (
        <div className="mb-6 rounded-2xl bg-green-50 border border-green-200 px-5 py-4 text-sm text-green-800">
          Közösségi profilod létrehozva! Admin jóváhagyás után látható lesz mások számára.
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-sni-text">Közösségi profilom</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            profile.status === "active"
              ? "bg-green-100 text-green-700"
              : profile.status === "pending_review"
              ? "bg-amber-100 text-amber-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {statusLabels[profile.status] ?? profile.status}
        </span>
      </div>

      {/* Előnézet */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-soft">
        <p className="text-xl font-bold text-sni-text">{profile.display_name}</p>
        <p className="text-sm text-gray-500">{ROLE_LABELS[profile.role]}</p>
        {(profile.city || profile.district) && (
          <p className="text-sm text-gray-400">
            {profile.city}{profile.district ? `, ${profile.district} kerület` : ""}
          </p>
        )}
        {profile.intro_text && (
          <p className="mt-3 text-sm text-gray-700">{profile.intro_text}</p>
        )}
        {(profile.connection_goals?.length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.connection_goals!.map((g) => (
              <span key={g} className="rounded-full bg-sni-brand-teal/10 px-2.5 py-0.5 text-xs text-sni-brand-teal font-medium">
                {CONNECTION_GOAL_OPTIONS.find((o) => o.value === g)?.label ?? g}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Gyors linkek */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/kozosseg/kapcsolataim" className="btn-secondary text-sm">
          Kapcsolataim
        </Link>
        <Link href="/kozosseg/uzenetek" className="btn-secondary text-sm">
          Üzeneteim
        </Link>
        <Link href="/kozosseg/terkep" className="btn-secondary text-sm">
          Térkép
        </Link>
      </div>

      {/* Szerkesztő form */}
      <div className="mt-8 border-t pt-8">
        <h2 className="text-lg font-bold text-sni-text mb-5">Profil szerkesztése</h2>
        <ProfileEditForm profile={profile} />
      </div>
    </div>
  );
}
