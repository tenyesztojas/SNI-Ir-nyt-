import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getActiveCommunityMembers } from "@/lib/community/data";
import { ROLE_LABELS, CONNECTION_GOAL_OPTIONS, type CommunityRole } from "@/lib/community/types";

export const metadata = { title: "Közösségi tagok – VédettSarok" };
export const dynamic = "force-dynamic";

export default async function TagokPage({
  searchParams,
}: {
  searchParams: { varos?: string; role?: string; cel?: string };
}) {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes");

  const members = await getActiveCommunityMembers({
    city: searchParams.varos,
    role: searchParams.role,
    goal: searchParams.cel,
  });

  const roleOptions = Object.entries(ROLE_LABELS) as [CommunityRole, string][];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-sni-text">Közösségi tagok</h1>
      <p className="mt-1 text-gray-500">Keress szülőket, érintett felnőtteket és szakembereket.</p>

      {/* Szűrők */}
      <form method="GET" className="mt-5 flex flex-wrap gap-3">
        <input
          name="varos"
          defaultValue={searchParams.varos}
          placeholder="Város..."
          className="input-field max-w-[180px]"
        />
        <select name="role" defaultValue={searchParams.role} className="input-field max-w-[200px]">
          <option value="">Minden szerepkör</option>
          {roleOptions.map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select name="cel" defaultValue={searchParams.cel} className="input-field max-w-[220px]">
          <option value="">Minden cél</option>
          {CONNECTION_GOAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button type="submit" className="btn-primary">Szűrés</button>
        <Link href="/kozosseg/tagok" className="btn-secondary">Törlés</Link>
      </form>

      {/* Lista */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.length === 0 ? (
          <p className="col-span-full text-center text-gray-400 py-12">
            Nincs a szűrésnek megfelelő tag.
          </p>
        ) : (
          members.map((m) => (
            <div key={m.id} className="card flex flex-col gap-2">
              {/* Avatar */}
              <div className="flex items-center gap-3">
                {m.profile_image_url ? (
                  <img
                    src={m.profile_image_url}
                    alt={m.display_name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-sni-brand-teal/20 flex items-center justify-center text-sni-brand-teal font-bold text-lg">
                    {m.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-sni-text">{m.display_name}</p>
                  <p className="text-xs text-gray-400">{ROLE_LABELS[m.role]}</p>
                </div>
              </div>

              {(m.city || m.district) && (
                <p className="text-xs text-gray-400">
                  📍 {m.city}{m.district ? `, ${m.district}` : ""}
                </p>
              )}

              {m.intro_text && (
                <p className="text-sm text-gray-600 line-clamp-2">{m.intro_text}</p>
              )}

              {(m.connection_goals?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.connection_goals!.slice(0, 2).map((g) => (
                    <span key={g} className="rounded-full bg-sni-brand-teal/10 px-2 py-0.5 text-[11px] text-sni-brand-teal font-medium">
                      {CONNECTION_GOAL_OPTIONS.find((o) => o.value === g)?.label ?? g}
                    </span>
                  ))}
                  {(m.connection_goals?.length ?? 0) > 2 && (
                    <span className="text-[11px] text-gray-400">+{m.connection_goals!.length - 2}</span>
                  )}
                </div>
              )}

              <div className="mt-auto flex gap-2 pt-2">
                <Link href={`/kozosseg/tag/${m.id}`} className="flex-1 rounded-xl border border-gray-200 py-1.5 text-center text-sm font-medium text-gray-700 hover:border-sni-brand-teal hover:text-sni-brand-teal transition">
                  Profil
                </Link>
                {m.accepts_friend_requests && (
                  <Link href={`/kozosseg/tag/${m.id}#kapcsolodas`} className="flex-1 rounded-xl bg-sni-brand-teal py-1.5 text-center text-sm font-semibold text-white hover:bg-sni-brand-blue transition">
                    Kapcsolódnék
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Adatvédelmi megjegyzés */}
      <p className="mt-8 text-center text-xs text-gray-400">
        Csak aktív, nyilvános profilok jelennek meg. Pontos lakcím nem látható.
      </p>
    </div>
  );
}
