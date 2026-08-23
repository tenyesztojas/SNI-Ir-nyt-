import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getMyThreads, getOwnCommunityProfile } from "@/lib/community/data";
import { ROLE_LABELS } from "@/lib/community/types";

export const metadata = { title: "Üzenetek – VédettSarok Közösség" };
export const dynamic = "force-dynamic";

export default async function UzenetekPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes");

  const [ownProfile, threads] = await Promise.all([
    getOwnCommunityProfile(),
    getMyThreads(),
  ]);
  if (!ownProfile) redirect("/kozosseg/bekapcsolas");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-sni-text">Üzenetek</h1>

      {/* Figyelmeztetés */}
      <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
        A VédettSarok Közösség sorstársi kapcsolódást segít. Kérjük, ne ossz meg gyermeknevet,
        pontos címet, iskolát, óvodát vagy más beazonosítható érzékeny adatot.
      </div>

      {threads.length === 0 ? (
        <div className="mt-12 text-center text-gray-400">
          <p className="text-4xl mb-3">💬</p>
          <p>Még nincs üzeneted.</p>
          <Link href="/kozosseg/kapcsolataim" className="mt-3 inline-block text-sm font-semibold text-sni-brand-teal hover:underline">
            Kapcsolataim →
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {threads.map((t) => {
            const other = t.other_profile;
            return (
              <Link
                key={t.id}
                href={`/kozosseg/uzenetek/${t.id}`}
                className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-soft hover:border-sni-brand-teal transition"
              >
                <div className="relative shrink-0">
                  <div className="h-11 w-11 rounded-full bg-sni-brand-teal/20 flex items-center justify-center text-sni-brand-teal font-bold text-lg">
                    {other?.display_name?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                  {(t.unread_count ?? 0) > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sni-brand-teal text-[10px] font-bold text-white">
                      {t.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sni-text truncate">{other?.display_name ?? "—"}</p>
                  {other && (
                    <p className="text-xs text-gray-400">{ROLE_LABELS[other.role]}</p>
                  )}
                </div>
                {t.last_message_at && (
                  <p className="text-xs text-gray-400 shrink-0">
                    {new Date(t.last_message_at).toLocaleDateString("hu-HU", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
