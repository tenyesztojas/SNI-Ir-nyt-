import { getCourseWithVersions } from "@/lib/academy/data";
import { publishCourseVersion, createCourse } from "@/lib/academy/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function KurzusEditorPage({ params }: Props) {
  const { id } = await params;

  // Handle "uj" route
  if (id === "uj") {
    return (
      <div className="max-w-lg">
        <h1 className="mb-6 text-xl font-bold text-sni-text">
          Új kurzus létrehozása
        </h1>

        <form
          action={async (fd: FormData) => {
            "use server";

            const res = await createCourse({
              title: fd.get("title") as string,
              description: fd.get("description") as string,
              estimatedMinutes: Number(fd.get("estimated_minutes") ?? 60),
              validityMonths: Number(fd.get("validity_months") ?? 12),
            });

            if (res.ok && res.courseId) {
              const { redirect } = await import("next/navigation");
              redirect(`/admin/akademia/kurzusok/${res.courseId}`);
            }
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Cím *
            </label>
            <input
              name="title"
              required
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Leírás
            </label>
            <textarea
              name="description"
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                Becsült perc
              </label>
              <input
                name="estimated_minutes"
                type="number"
                defaultValue={60}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                Igazolás érvényessége (hónap)
              </label>
              <input
                name="validity_months"
                type="number"
                defaultValue={12}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-full bg-sni-brand-teal px-5 py-2.5 text-sm font-bold text-sni-brand-navy"
          >
            Kurzus létrehozása
          </button>
        </form>
      </div>
    );
  }

  const course = await getCourseWithVersions(id);

  if (!course) {
    notFound();
  }

  // Create new version helper
  async function createVersion(fd: FormData) {
    "use server";

    const admin = createAdminClient();

    await admin.from("academy_course_versions").insert({
      course_id: id,
      version: fd.get("version") as string,
      passing_score: Number(fd.get("passing_score") ?? 80),
      question_count: Number(fd.get("question_count") ?? 10),
      max_attempts: Number(fd.get("max_attempts") ?? 3),
      status: "draft",
    });

    const { revalidatePath } = await import("next/cache");
    revalidatePath(`/admin/akademia/kurzusok/${id}`);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/admin/akademia/kurzusok"
            className="text-xs text-gray-400 hover:text-sni-brand-blue"
          >
            ← Kurzusok
          </Link>

          <h1 className="mt-0.5 text-xl font-bold text-sni-text">
            {course.title}
          </h1>
        </div>
      </div>

      {/* Versions table */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="font-bold text-sni-text">Verziók</h2>
        </div>

        {course.versions.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-400">
            Még nincs verzió.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase text-gray-500">
                <th className="px-4 py-2 text-left">Verzió</th>
                <th className="px-4 py-2 text-left">Státusz</th>
                <th className="px-4 py-2 text-left">Min. pont</th>
                <th className="px-4 py-2 text-left">Kérdésszám</th>
                <th className="px-4 py-2 text-left">Műveletek</th>
              </tr>
            </thead>

            <tbody>
              {course.versions.map((version) => (
                <tr key={version.id} className="border-t border-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-bold">
                    {version.version}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        version.status === "published"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {version.status === "published"
                        ? "Publikált"
                        : "Piszkozat"}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-xs">
                    {version.passing_score}%
                  </td>

                  <td className="px-4 py-3 text-xs">
                    {version.question_count}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex gap-2 text-xs">
                      <Link
                        href={`/admin/akademia/kurzusok/${id}/import?v=${version.id}`}
                        className="text-sni-brand-blue underline"
                      >
                        DOCX import
                      </Link>

                      <Link
                        href={`/admin/akademia/kurzusok/${id}/kerdesek?v=${version.id}`}
                        className="text-gray-500 underline"
                      >
                        Kérdésbank
                      </Link>

                      {version.status === "draft" && (
                        <form
                          action={publishCourseVersion.bind(
                            null,
                            version.id
                          )}
                        >
                          <button
                            type="submit"
                            className="text-emerald-600 underline"
                          >
                            Publikálás
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New version form */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
        <h2 className="mb-4 font-bold text-sni-text">
          Új verzió létrehozása
        </h2>

        <form action={createVersion} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Verzióazonosító (pl. VP-CORE-1.1)
            </label>
            <input
              name="version"
              required
              placeholder="VP-CORE-1.0"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Min. átmenő pont (%)
            </label>
            <input
              name="passing_score"
              type="number"
              defaultValue={80}
              min={1}
              max={100}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Kérdések száma
            </label>
            <input
              name="question_count"
              type="number"
              defaultValue={10}
              min={1}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Max próbálkozás
            </label>
            <input
              name="max_attempts"
              type="number"
              defaultValue={3}
              min={1}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2">
            <button
              type="submit"
              className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy"
            >
              Verzió létrehozása
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}