import { createAdminClient } from "@/lib/supabase/admin";
import { getQuestionsForVersion } from "@/lib/academy/data";
import KerdesekClient from "./KerdesekClient";
import Link from "next/link";
import { notFound } from "next/navigation";

interface Props {
  params: { id: string };
  searchParams: { v?: string };
}

export default async function KerdesekPage({ params, searchParams }: Props) {
  const admin = createAdminClient();

  const { data: course } = await admin
    .from("academy_courses")
    .select("id, title")
    .eq("id", params.id)
    .maybeSingle();

  if (!course) notFound();

  const { data: versions } = await admin
    .from("academy_course_versions")
    .select("id, version, status")
    .eq("course_id", params.id)
    .order("created_at", { ascending: false });

  const selectedVersionId = searchParams.v ?? versions?.[0]?.id;
  const selectedVersion = (versions ?? []).find((v) => v.id === selectedVersionId);

  if (!selectedVersion) {
    return (
      <div>
        <p className="text-sm text-gray-400">Nincs verzió ehhez a kurzushoz.</p>
      </div>
    );
  }

  const questions = await getQuestionsForVersion(selectedVersion.id);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/admin/akademia/kurzusok/${params.id}`} className="text-xs text-gray-400 hover:text-sni-brand-blue">
          ← {course.title}
        </Link>
        <span className="text-gray-300">›</span>
        <span className="text-xs font-semibold text-gray-600">Kérdésbank – {selectedVersion.version}</span>
      </div>

      <KerdesekClient courseVersionId={selectedVersion.id} initialQuestions={questions} />
    </div>
  );
}
