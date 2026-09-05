import { createAdminClient } from "@/lib/supabase/admin";
import DocxImportClient from "./DocxImportClient";
import Link from "next/link";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}

export default async function DocxImportPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { v } = await searchParams;

  const admin = createAdminClient();

  // Get course
  const { data: course } = await admin
    .from("academy_courses")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();

  if (!course) notFound();

  // Get versions for this course
  const { data: versions } = await admin
    .from("academy_course_versions")
    .select("id, version, status")
    .eq("course_id", id)
    .order("created_at", { ascending: false });

  const selectedVersionId = v ?? versions?.[0]?.id;
  const selectedVersion = (versions ?? []).find(
    (version) => version.id === selectedVersionId
  );

  if (!selectedVersion) {
    return (
      <div>
        <Link
          href={`/admin/akademia/kurzusok/${id}`}
          className="text-xs text-gray-400 hover:text-sni-brand-blue"
        >
          ← Vissza a kurzushoz
        </Link>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Ehhez a kurzushoz még nincs verzió. Hozz létre egyet a kurzus
          szerkesztő oldalon.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/admin/akademia/kurzusok/${id}`}
          className="text-xs text-gray-400 hover:text-sni-brand-blue"
        >
          ← {course.title}
        </Link>

        <span className="text-gray-300">›</span>
        <span className="text-xs font-semibold text-gray-600">
          DOCX import
        </span>
      </div>

      {/* Version selector */}
      {(versions?.length ?? 0) > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {(versions ?? []).map((version) => (
            <Link
              key={version.id}
              href={`/admin/akademia/kurzusok/${id}/import?v=${version.id}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                version.id === selectedVersionId
                  ? "bg-sni-brand-teal text-sni-brand-navy"
                  : "border border-gray-200 text-gray-500 hover:border-sni-brand-teal"
              }`}
            >
              {version.version}{" "}
              {version.status === "published" ? "🟢" : "🟡"}
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