import { getCurrentPartnerId, getPartnerProfile } from "@/lib/academy/data";
import { createAdminClient } from "@/lib/supabase/admin";
import AcademyNav from "@/components/academy/AcademyNav";
import InviteParticipantForm from "./InviteParticipantForm";
import BulkInviteForm from "./BulkInviteForm";

export default async function UjMunkatarsPage() {
  const partnerId = (await getCurrentPartnerId())!;
  const partner = await getPartnerProfile(partnerId);

  // Publikált kurzusverziók listája
  const admin = createAdminClient();
  const { data: versions } = await admin
    .from("academy_course_versions")
    .select("id, version, course:academy_courses(title)")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  // Ha nincs publikált verzió, draft-okat is megmutatjuk (fejlesztési célra)
  const { data: allVersions } = !versions?.length
    ? await admin
        .from("academy_course_versions")
        .select("id, version, course:academy_courses(title)")
        .order("created_at", { ascending: false })
    : { data: null };

  const courseVersions = (versions?.length ? versions : (allVersions ?? [])) as unknown as {
    id: string;
    version: string;
    course: { title: string } | null;
  }[];

  return (
    <div className="min-h-screen bg-gray-50">
      <AcademyNav companyName={partner?.company_name ?? ""} active="munkatarsak" />

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-sni-text mb-6">Munkatárs hozzáadása és meghívása</h1>

        {courseVersions.length === 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 mb-6" role="alert">
            Jelenleg nincs publikált képzés. Az admin felületen szükséges először egy kurzust publikálni.
          </div>
        )}

        {/* Egyedi meghívás */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft mb-6">
          <h2 className="text-base font-bold text-sni-text mb-4">Egyedi meghívás</h2>
          <InviteParticipantForm courseVersions={courseVersions} />
        </div>

        {/* Tömeges meghívás */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
          <h2 className="text-base font-bold text-sni-text mb-4">Tömeges meghívás (Excel / CSV)</h2>
          <BulkInviteForm courseVersions={courseVersions} />
        </div>
      </div>
    </div>
  );
}
