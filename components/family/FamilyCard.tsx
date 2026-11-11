import type { FamilyView } from "@/lib/family/data";
import AddChildForm from "@/components/family/AddChildForm";
import ChildCard from "@/components/family/ChildCard";
import ChildScheduleSection from "@/components/family/ChildScheduleSection";
import ChildAccountSection from "@/components/family/ChildAccountSection";
import GuardianManagement from "@/components/family/GuardianManagement";
import ChildTravelStatusSummary from "@/components/family/ChildTravelStatusSummary";
import FamilyMemberActions from "@/components/family/FamilyMemberActions";
import { canLeaveFamily, canRemoveMember } from "@/lib/family/memberRemoval";
import OwnershipHandover from "@/components/family/OwnershipHandover";
import { handoverCandidates } from "@/lib/family/ownershipHandover";
import type { TravelStatusWithTitle } from "@/lib/family/travelStatusData";
import type { TravelStatusRow } from "@/lib/family/travelStatus";
import ChildDayOverview from "@/components/family/ChildDayOverview";

const ROLE_LABEL: Record<string, string> = {
  owner: "Tulajdonos",
  guardian: "Gondviselő",
};

export default function FamilyCard({
  family,
  travelStatusByChild = {},
  currentUserId,
  travelRowsByChild,
  travelDataAvailable = false,
  nowIso,
}: {
  family: FamilyView;
  travelStatusByChild?: Record<string, TravelStatusWithTitle>;
  currentUserId?: string;
  // Szülői napi áttekintés: gyermekenként a mai + tegnapi utazási sorok.
  // Hiányában (pl. régi hívó) az áttekintés nem jelenik meg.
  travelRowsByChild?: Record<string, TravelStatusRow[]>;
  travelDataAvailable?: boolean;
  nowIso?: string;
}) {
  const viewer = currentUserId ? { userId: currentUserId, role: family.myRole } : null;
  const familyName = family.name?.trim() ? family.name : "Elnevezés nélküli család";
  const candidates = handoverCandidates(viewer, family.members);
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
      <h2 className="text-lg font-bold text-gray-900">
        {family.name?.trim() ? family.name : "Elnevezés nélküli család"}
      </h2>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-gray-700">Családtagok</h3>
        <ul className="mt-2 flex flex-col gap-1">
          {family.members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm text-gray-700"
            >
              <span>{member.displayName}</span>
              <span className="flex items-center gap-3">
                <span className="text-gray-500">
                  {ROLE_LABEL[member.role] ?? member.role}
                </span>
                {canRemoveMember(viewer, member) && (
                  <FamilyMemberActions
                    mode="remove"
                    familyId={family.id}
                    memberUserId={member.userId}
                    memberName={member.displayName}
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
        {candidates.length > 0 && (
          <div className="mt-3">
            <OwnershipHandover
              familyId={family.id}
              candidates={candidates.map((c) => ({ userId: c.userId, displayName: c.displayName }))}
            />
          </div>
        )}
        {canLeaveFamily(viewer) && (
          <div className="mt-3">
            <FamilyMemberActions mode="leave" familyId={family.id} familyName={familyName} />
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-700">Gyermekek</h3>
        {family.children.length === 0 ? (
          <p className="mt-2 text-gray-500">Még nincs gyermekprofil.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {family.children.map((child) => (
              <div key={child.id}>
                <ChildCard child={child} canEdit={family.myRole === "owner"} />
                <ChildTravelStatusSummary childId={child.id} status={travelStatusByChild[child.id]} />
                {travelRowsByChild && nowIso && (
                  <ChildDayOverview
                    childId={child.id}
                    childName={child.firstName}
                    scheduleItems={child.scheduleItems}
                    initialRows={travelRowsByChild[child.id] ?? []}
                    initialDataAvailable={travelDataAvailable}
                    nowIso={nowIso}
                  />
                )}
                {/* Napirend create/edit/delete: owner-családnál mindig
                    true, guardian-családnál a SAJÁT aktív
                    can_manage_schedule jogosultság dönt (lásd
                    FamilyChildView.canManageSchedule felépítését
                    lib/family/data.ts getMyFamilies()-ében, és a
                    hozzá tartozó RLS-t a
                    20261001_family_schedule_authorization_completion.sql
                    migrációban). Ez a UI-gate csak kozmetikai; a
                    valódi védelmet a backend RLS/RPC adja. */}
                <ChildScheduleSection
                  child={child}
                  canManage={child.canManageSchedule}
                />
                {family.myRole === "owner" && child.accountStatus && (
                  <ChildAccountSection
                    childId={child.id}
                    childFirstName={child.firstName}
                    accountStatus={child.accountStatus}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {family.myRole === "owner" && <AddChildForm familyId={family.id} />}
      </div>

      {family.myRole === "owner" && <GuardianManagement family={family} />}
    </div>
  );
}
