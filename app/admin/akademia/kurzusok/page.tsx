import { getAllCourses } from "@/lib/academy/data";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export default async function KurzusokPage() {
  const courses = await getAllCourses();
  const admin = createAdminClient();

  // Get version counts
  const { data: versions } = await admin
    .from("academy_course_versions")
    .select("id, course_id, version, status");

  const versionsByCourse = new Map<string, typeof versions>();
  for (const v of (versions ?? [])) {
    const arr = versionsByCourse.get(v.course_id) ?? [];
    arr.push(v);
    versionsByCourse.set(v.course_id, arr);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-sni-text">Kurzusok</h1>
        <Link
          href="/admin/akademia/kurzusok/uj"
          className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition"
        >
          + Új kurzus
        </Link>
      </div>

      {courses.length === 0 ? (
        <p className="text-gray-400 text-sm">Még nincs kurzus.</p>
      ) : (
        <div className="space-y-3">
          {courses.map((c) => {
            const cvs = versionsByCourse.get(c.id) ?? [];
            const published = cvs.filter((v) => v.status === "published");
            return (
              <div key={c.id} className="rounded-2xl border border-gray-100 bg-white shadow-soft px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-sni-text">{c.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      c.status === "published"
                        ? "bg-emerald-100 text-emerald-700"
                        : c.status === "archived"
                        ? "bg-gray-100 text-gray-500"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {c.status === "published" ? "Publikált" : c.status === "archived" ? "Archivált" : "Piszkozat"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {cvs.length} verzió · {published.length} publikált · {c.estimated_duration_minutes ?? "?"} perc
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/akademia/kurzusok/${c.id}`}
                    className="text-xs text-sni-brand-blue underline hover:no-underline"
                  >
                    Szerkesztés
                  </Link>
                  {cvs[0] && (
                    <Link
                      href={`/admin/akademia/kurzusok/${c.id}/import`}
                      className="text-xs text-gray-500 underline hover:no-underline"
                    >
                      DOCX import
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
