import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getMyConnections, getOwnCommunityProfile } from "@/lib/community/data";
import { ROLE_LABELS } from "@/lib/community/types";
import RespondButton from "./RespondButton";

export const metadata = { title: "Kapcsolataim – VédettSarok Közösség" };
export const dynamic = "force-dynamic";

export default async function KapcsolataimPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes");

  const [ownProfile, connections] = await Promise.all([
    getOwnCommunityProfile(),
    getMyConnections(),
  ]);
  if (!ownProfile) redirect("/kozosseg/bekapcsolas");

  const pending = connections.filter(
    (c) => c.status === "pending" && c.receiver_user_id === user.id
  );
  const accepted = connections.filter((c) => c.status === "accepted");
  const sent = connections.filter(
    (c) => c.status === "pending" && c.requester_user_id === user.id
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-sni-text">Kapcsolataim</h1>

      {/* Bejövő kérések */}
      {pending.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            Bejövő kérések ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((c) => {
              const profile = c.other_profile;
              return (
                <div key={c.id} className="card flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-sni-brand-teal/20 flex items-center justify-center text-sni-brand-teal font-bold text-lg shrink-0">
                    {profile?.display_name?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sni-text">{profile?.display_name ?? "—"}</p>
                    <p className="text-xs text-gray-400">{profile ? ROLE_LABELS[profile.role] : ""}</p>
                    {c.intro_message && (
                      <p className="mt-1 text-sm text-gray-600 italic">&ldquo;{c.intro_message}&rdquo;</p>
                    )}
                  </div>
                  <RespondButton connectionId={c.id} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Elfogadott kapcsolatok */}
      <section className="mt-8">
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          Kapcsolatok ({accepted.length})
        </h2>
        {accepted.length === 0 ? (
          <p className="text-sm text-gray-400">Még nincsenek elfogadott kapcsolataid.</p>
        ) : (
          <div className="space-y-3">
            {accepted.map((c) => {
              const other = c.other_profile;
              return (
                <div key={c.id} className="card flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-sni-brand-teal/20 flex items-center justify-center text-sni-brand-teal font-bold text-lg shrink-0">
                    {other?.display_name?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sni-text">{other?.display_name ?? "—"}</p>
                    <p className="text-xs text-gray-400">{other ? ROLE_LABELS[other.role] : ""}</p>
                  </div>
                  <Link href="/kozosseg/uzenetek" className="text-sm font-semibold text-sni-brand-teal hover:underline shrink-0">
                    Üzenet
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Elküldött, várakozó kérések */}
      {sent.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            Elküldött kérések ({sent.length})
          </h2>
          <div className="space-y-3">
            {sent.map((c) => {
              const other = c.other_profile;
              return (
                <div key={c.id} className="card flex items-center gap-3 opacity-70">
                  <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-bold text-lg shrink-0">
                    {other?.display_name?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sni-text">{other?.display_name ?? "—"}</p>
                    <p className="text-xs text-gray-400">Várakozás a válaszra...</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {connections.length === 0 && (
        <div className="mt-12 text-center text-gray-400">
          <p className="text-4xl mb-3">🤝</p>
          <p>Még nincs kapcsolatod.</p>
          <Link href="/kozosseg/tagok" className="mt-3 inline-block text-sm font-semibold text-sni-brand-teal hover:underline">
            Keress tagokat →
          </Link>
        </div>
      )}
    </div>
  );
}
