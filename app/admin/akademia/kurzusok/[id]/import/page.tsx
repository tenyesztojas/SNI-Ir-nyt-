import { createAdminClient } from "@/lib/supabase/admin";
import DocxImportClient from "./DocxImportClient";
import Link from "next/link";
import { notFound } from "next/navigation";

interface Props {
  params: { id: string };
  searchParams: { v?: string };
}

export default async function DocxImportPage({ params, searchParams }: Props) {
  const admin = createAdminClient();

  // Get course
  const { data: course } = await admin
    .from("academy_courses")
    .select("id, title")
    .eq("id", params.id)
    .maybeSingle();

  if (!course) notFound();

  // Get versions for this course
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
        <Link href={`/admin/akademia/kurzusok/${params.id}`} className="text-xs text-gray-400 hover:text-sni-brand-blue">
          ← Vissza a kurzushoz
        </Link>
        <div className="mt-6 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-800">
          Ehhez a kurzushoz még nincs verzió. Hozz létre egyet a kurzus szerkesztő oldalon.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/admin/akademia/kurzusok/${params.id}`} className="text-xs text-gray-400 hover:text-sni-brand-blue">
          ← {course.title}
        </Link>
        <span className="text-gray-300">›</span>
        <span className="text-xs font-semibold text-gray-600">DOCX import</span>
      </div>

      {/* Version selector */}
      {(versions?.length ?? 0) > 1 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {(versions ?? []).map((v) => (
            <Link
              key={v.id}
              href={`/admin/akademia/kurzusok/${params.id}/import?v=${v.id}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                v.id === selectedVersionId
                  ? "bg-sni-brand-teal text-sni-brand-navy"
                  : "border border-gray-200 text-gray-500 hover:border-sni-brand-teal"
              }`}
            >
              {v.version} {v.status === "published" ? "🟢" : "🟡"}
            </Link>
          ))}
        </div>
      )}

      <DocxImportClient
        courseVersionId={selectedVersion.id}
        versionLabel={selectedVersion.version}
      />
    </div>
  );
}
