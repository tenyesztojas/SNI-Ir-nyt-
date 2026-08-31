import { resolveInvitationToken, hashToken } from "@/lib/academy/data";
import { markInvitationOpened } from "@/lib/academy/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

interface Props {
  params: { token: string };
}

export default async function MeghivoLandingPage({ params }: Props) {
  const { token } = params;
  const ctx = await resolveInvitationToken(token);

  if (!ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <p className="text-5xl mb-4">🔗</p>
          <h1 className="text-xl font-bold text-sni-text mb-2">Érvénytelen vagy lejárt link</h1>
          <p className="text-sm text-gray-500">
            Ez a meghívó link már nem aktív. Kérj új meghívót a munkáltatódtól.
          </p>
        </div>
      </div>
    );
  }

  const { invitation, enrollment, participant, courseVersion, partnerName } = ctx;

  // Mark as opened if not yet
  if (!invitation.opened_at) {
    await markInvitationOpened(invitation.id, enrollment.id);
  }

  // Find first lesson
  const admin = createAdminClient();
  const { data: firstModule } = await admin
    .from("academy_modules")
    .select("id, academy_lessons(id)")
    .eq("course_version_id", courseVersion.id)
    .order("display_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const firstLessonId =
    (firstModule?.academy_lessons as { id: string }[] | undefined)?.[0]?.id ?? null;

  const course = courseVersion.course as { title: string; description: string; estimated_duration_minutes: number } | undefined;

  const isCompleted = ["completed"].includes(enrollment.status);
  const testStarted = ["test_in_progress", "test_failed", "completed"].includes(enrollment.status);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Védett Akadémia</p>
            <p className="font-bold text-sni-text">{partnerName}</p>
          </div>
          <span className="text-xs bg-sni-brand-teal/10 text-sni-brand-teal font-semibold px-3 py-1 rounded-full">
            Munkatársi felület
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* Welcome card */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-soft p-8 mb-6">
          <p className="text-sm text-gray-500 mb-1">
            Üdvözöljük, {participant.last_name} {participant.first_name}!
          </p>
          <h1 className="text-2xl font-black text-sni-brand-navy mb-2">
            {course?.title ?? "Védett Akadémia képzés"}
          </h1>
          <p className="text-sm text-gray-600 mb-4">{course?.description ?? ""}</p>

          <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-6">
            {course?.estimated_duration_minutes && (
              <span>⏱ Becsült idő: {course.estimated_duration_minutes} perc</span>
            )}
            <span>📋 Kurzus: {courseVersion.version}</span>
            <span>🏢 Munkáltató: {partnerName}</span>
          </div>

          {/* Progress */}
          {enrollment.progress_percent > 0 && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Haladás</span>
                <span>{enrollment.progress_percent}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div className="h-2 rounded-full bg-sni-brand-teal" style={{ width: `${enrollment.progress_percent}%` }} />
              </div>
            </div>
          )}

          {/* Action */}
          {isCompleted ? (
            <Link
              href={`/akademia/meghivo/${token}/eredmeny`}
              className="inline-block rounded-full bg-emerald-500 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-600 transition"
            >
              Igazolás megtekintése 🎉
            </Link>
          ) : testStarted ? (
            <div className="flex gap-3 flex-wrap">
              {firstLessonId && (
                <Link
                  href={`/akademia/meghivo/${token}/tananyag/${firstLessonId}`}
                  className="inline-block rounded-full border border-sni-brand-teal px-5 py-2.5 text-sm font-semibold text-sni-brand-teal hover:bg-sni-brand-teal hover:text-sni-brand-navy transition"
                >
                  Tananyag áttekintése
                </Link>
              )}
              <Link
                href={`/akademia/meghivo/${token}/teszt`}
                className="inline-block rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition"
              >
                Teszt folytatása →
              </Link>
            </div>
          ) : firstLessonId ? (
            <Link
              href={`/akademia/meghivo/${token}/tananyag/${firstLessonId}`}
              className="inline-block rounded-full bg-sni-brand-teal px-6 py-3 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition"
            >
              Képzés megkezdése →
            </Link>
          ) : (
            <p className="text-sm text-amber-600">A képzési anyag hamarosan elérhető lesz.</p>
          )}
        </div>

        {/* Privacy notice */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-600">
          <h2 className="font-bold text-sni-text mb-2">Adatvédelmi tájékoztató</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            A képzés teljesítése során a VédettSarok platform rögzíti az Ön haladását, teszt
            eredményét és az igazolás adatait. Ezeket az adatokat kizárólag a munkáltató
            ({partnerName}) és a VédettSarok kezeli. Az igazolás személyes azonosítót és teszt
            eredményt tartalmaz. Az adatkezelésről részletes tájékoztatást a
            vedettsarok.hu/adatvedelmi-tajekoztato oldalon talál.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            A képzés megkezdésével Ön elfogadja, hogy az említett adatok rögzítésre kerülnek.
          </p>
        </div>
      </div>
    </div>
  );
}
