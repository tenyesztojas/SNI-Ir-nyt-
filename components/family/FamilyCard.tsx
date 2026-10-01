import type { FamilyView } from "@/lib/family/data";
import AddChildForm from "@/components/family/AddChildForm";
import ChildCard from "@/components/family/ChildCard";
import GuardianManagement from "@/components/family/GuardianManagement";

const ROLE_LABEL: Record<string, string> = {
  owner: "Tulajdonos",
  guardian: "Gondviselő",
};

export default function FamilyCard({ family }: { family: FamilyView }) {
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
              className="flex items-center justify-between gap-3 text-sm text-gray-700"
            >
              <span>{member.displayName}</span>
              <span className="text-gray-500">
                {ROLE_LABEL[member.role] ?? member.role}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-700">Gyermekek</h3>
        {family.children.length === 0 ? (
          <p className="mt-2 text-gray-500">Még nincs gyermekprofil.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {family.children.map((child) => (
              <ChildCard
                key={child.id}
                child={child}
                canEdit={family.myRole === "owner"}
              />
            ))}
          </div>
        )}

        {family.myRole === "owner" && <AddChildForm familyId={family.id} />}
      </div>

      {family.myRole === "owner" && <GuardianManagement family={family} />}
    </div>
  );
}
