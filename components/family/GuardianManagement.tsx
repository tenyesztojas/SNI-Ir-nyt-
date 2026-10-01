import type { FamilyView } from "@/lib/family/data";
import GuardianInviteForm from "@/components/family/GuardianInviteForm";
import RevokeGuardianInvitationButton from "@/components/family/RevokeGuardianInvitationButton";
import GuardianChildScheduleAccessRow from "@/components/family/GuardianChildScheduleAccessRow";

// OWNER-ONLY gondviselő-kezelő szekció a /csalad FamilyCard-on. Ezt a
// komponenst a FamilyCard KIZÁRÓLAG family.myRole === "owner" esetén
// rendereli (lásd FamilyCard.tsx) — de ez csak UI-rejtés, NEM
// biztonsági réteg: a tényleges jogosultságot az invite_family_guardian
// / revoke_family_guardian_invitation RPC-k (is_family_owner ellenőrzés)
// és a family_guardian_invitations RLS SELECT policy garantálja (lásd
// supabase/migrations/20260927_family_guardian_invitation_foundation.sql).
// A family.pendingGuardianInvitations mezőt a data loader is csak
// owner-családokra tölti fel — guardianra ez mindig üres tömb.
//
// A Napirend-hozzáférés (can_view_schedule/can_manage_schedule)
// szerkesztő sorai (lásd lent) ugyanígy KIZÁRÓLAG itt, owner nézetben
// jelennek meg — a family.guardianChildSchedulePermissions mezőt a data
// loader is csak owner-családokra tölti (lásd lib/family/data.ts), és a
// tényleges védelmet a upsert_guardian_child_permission RPC saját
// is_child_family_owner ellenőrzése adja (lásd lib/actions/family.ts
// updateGuardianChildScheduleAccessAction), nem ez a UI-rejtés.
export default function GuardianManagement({ family }: { family: FamilyView }) {
  const guardians = family.members.filter((member) => member.role === "guardian");

  return (
    <div className="mt-6 border-t border-gray-100 pt-6">
      <h3 className="text-sm font-semibold text-gray-700">Gondviselők</h3>

      {guardians.length === 0 ? (
        <p className="mt-2 text-gray-500">Még nincs gondviselő a családban.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {guardians.map((guardian) => (
            <li key={guardian.userId} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 text-sm text-gray-700">
                <span>{guardian.displayName}</span>
                <span className="text-gray-500">Aktív gondviselő</span>
              </div>

              {family.children.length > 0 && (
                <div className="flex flex-col gap-2 pl-2">
                  {family.children.map((child) => {
                    const existing = family.guardianChildSchedulePermissions.find(
                      (permission) =>
                        permission.guardianUserId === guardian.userId &&
                        permission.childId === child.id
                    );
                    return (
                      <GuardianChildScheduleAccessRow
                        key={`${guardian.userId}:${child.id}`}
                        guardianUserId={guardian.userId}
                        childId={child.id}
                        childFirstName={child.firstName}
                        initialCanViewSchedule={existing?.canViewSchedule ?? false}
                        initialCanManageSchedule={
                          existing?.canManageSchedule ?? false
                        }
                      />
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <GuardianInviteForm familyId={family.id} />

      {family.pendingGuardianInvitations.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Függő meghívások
          </h4>
          <ul className="mt-2 flex flex-col gap-2">
            {family.pendingGuardianInvitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 text-sm text-gray-700"
              >
                <div className="flex flex-col">
                  <span>{invitation.invitedEmail}</span>
                  <span className="text-xs text-gray-500">Függő meghívás</span>
                </div>
                <RevokeGuardianInvitationButton invitationId={invitation.id} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
