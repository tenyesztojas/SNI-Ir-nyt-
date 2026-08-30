import { redirect, notFound } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/data";
import {
  getCommunityProfileById,
  getOwnCommunityProfile,
  getConnectionBetween,
  getHelpSettingsByUserId,
} from "@/lib/community/data";
import {
  ROLE_LABELS,
  CONNECTION_GOAL_OPTIONS,
  NEURODIVERGENCE_OPTIONS,
  CHILD_AGE_OPTIONS,
  HELP_NEEDED_CATEGORIES,
  HELP_OFFERED_CATEGORIES,
} from "@/lib/community/types";
import ConnectionActions from "./ConnectionActions";
import ReportUserButton from "./ReportUserButton";

export const dynamic = "force-dynamic";

export default async function TagProfilPage({
  params,
}: {
  params: { id: string };
}) {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes");

  const [profile, ownProfile, existingConn] = await Promise.all([
    getCommunityProfileById(params.id),
    getOwnCommunityProfile(),
    getConnectionBetween(user.id, params.id).catch(() => null),
  ]);
  // Help settings csak bejelentkezett tagoknak — utólag hozzuk le, hogy ne lassítsa a lapot
  const helpSettings = profile ? await getHelpSettingsByUserId(profile.user_id).catch(() => null) : null;

  if (!profile) notFound();
  if (profile.user_id === user.id) redirect("/kozosseg/profilom");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Profil fejléc */}
      <div className="flex items-start gap-4">
        {profile.profile_image_url ? (
          <img
            src={profile.profile_image_url}
            alt={profile.display_name}
            className="h-16 w-16 rounded-full object-cover shadow"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-sni-brand-teal/20 flex items-center justify-center text-sni-brand-teal font-bold text-2xl shadow">
            {profile.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-extrabold text-sni-text">{profile.display_name}</h1>
          <p className="text-gray-500">{ROLE_LABELS[profile.role]}</p>
          {(profile.city || profile.district) && (
            <p className="text-sm text-gray-400 mt-0.5">
              📍 {profile.city}{profile.district ? `, ${profile.district}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* Bemutatkozás */}
      {profile.intro_text && (
        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
          <p className="text-gray-700">{profile.intro_text}</p>
        </div>
      )}

      {/* Kapcsolódási célok */}
      {(profile.connection_goals?.length ?? 0) > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-500 mb-2">Amire nyitott</p>
          <div className="flex flex-wrap gap-2">
            {profile.connection_goals!.map((g) => (
              <span key={g} className="rounded-full bg-sni-brand-teal/10 px-3 py-1 text-xs text-sni-brand-teal font-medium">
                {CONNECTION_GOAL_OPTIONS.find((o) => o.value === g)?.label ?? g}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Érintettség */}
      {(profile.neurodivergence_tags?.length ?? 0) > 0 &&
        !profile.neurodivergence_tags!.includes("nem_adom_meg") && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-gray-500 mb-2">Érintettség</p>
            <div className="flex flex-wrap gap-2">
              {profile.neurodivergence_tags!.map((g) => (
                <span key={g} className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700 font-medium">
                  {NEURODIVERGENCE_OPTIONS.find((o) => o.value === g)?.label ?? g}
                </span>
              ))}
            </div>
          </div>
        )}

      {/* Életkori sáv */}
      {(profile.child_age_group?.length ?? 0) > 0 &&
        !profile.child_age_group!.includes("nem_adom_meg") && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-gray-500 mb-2">Gyermek életkora</p>
            <div className="flex flex-wrap gap-2">
              {profile.child_age_group!.map((g) => (
                <span key={g} className="rounded-full bg-green-50 px-3 py-1 text-xs text-green-700 font-medium">
                  {CHILD_AGE_OPTIONS.find((o) => o.value === g)?.label ?? g}
                </span>
              ))}
            </div>
          </div>
        )}

      {/* Kapcsolódási gombok */}
      {ownProfile && (
        <div id="kapcsolodas" className="mt-8">
          <ConnectionActions
            profile={profile}
            ownProfile={ownProfile}
            existingConnection={existingConn}
            currentUserId={user.id}
          />
        </div>
      )}
      {!ownProfile && (
        <div className="mt-8 rounded-2xl bg-gray-50 border border-gray-200 px-5 py-4 text-sm text-gray-600">
          <a href="/kozosseg/bekapcsolas" className="font-semibold text-sni-brand-teal hover:underline">
            Hozz létre közösségi profilt
          </a>{" "}
          a kapcsolódáshoz.
        </div>
      )}

      {/* Közösségi segítség */}
      {helpSettings?.enabled && (
        <div className="mt-8 rounded-2xl border border-sni-brand-teal/20 bg-white p-5 shadow-soft">
          <p className="text-xs text-gray-400 mb-3">
            A VédettSarok csak a kapcsolatfelvételi felületet biztosítja. A konkrét segítségnyújtás a felek saját felelőssége.
          </p>
          <h2 className="text-sm font-bold text-sni-text mb-3">Közösségi segítség</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {helpSettings.help_needed_enabled && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700 font-medium">Segítséget kér</span>
            )}
            {helpSettings.help_offered_enabled && (
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs text-green-700 font-medium">Segítséget ajánl</span>
            )}
            {[...helpSettings.help_needed_categories, ...helpSettings.help_offered_categories]
              .filter((v, i, a) => a.indexOf(v) === i)
              .slice(0, 6)
              .map((cat) => {
                const label =
                  HELP_NEEDED_CATEGORIES.find((c) => c.value === cat)?.label ??
                  HELP_OFFERED_CATEGORIES.find((c) => c.value === cat)?.label ??
                  cat;
                return (
                  <span key={cat} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 font-medium">
                    {label}
                  </span>
                );
              })}
          </div>
          {helpSettings.help_needed_description && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-500 mb-1">Miben kér segítséget:</p>
              <p className="text-sm text-gray-700">{helpSettings.help_needed_description}</p>
            </div>
          )}
          {helpSettings.help_offered_description && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-500 mb-1">Miben tud segíteni:</p>
              <p className="text-sm text-gray-700">{helpSettings.help_offered_description}</p>
            </div>
          )}
          <p className="mt-3 text-xs text-gray-400">
            Kérjük, a részletek egyeztetésére privát üzenetet használj. Ne ossz meg nyilvánosan gyermeknevet, pontos lakcímet, diagnózist vagy egészségügyi adatot.
          </p>
        </div>
      )}

      {/* Adatvédelmi szöveg + Jelentés */}
      <div className="mt-8 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Csak az a felhasználó engedélyezte ezen adatainak megtekintését.
          Pontos lakcím nem látható.
        </p>
        <ReportUserButton
          reportedUserId={profile.user_id}
          relatedHelpSettingId={helpSettings?.id ?? null}
        />
      </div>
    </div>
  );
}
