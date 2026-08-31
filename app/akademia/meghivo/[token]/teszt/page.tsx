import { resolveInvitationToken } from "@/lib/academy/data";
import TestEngine from "@/components/academy/TestEngine";
import Link from "next/link";

interface Props {
  params: { token: string };
}

export default async function TesztPage({ params }: Props) {
  const { token } = params;
  const ctx = await resolveInvitationToken(token);

  if (!ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-5xl mb-4">🔗</p>
          <h1 className="text-xl font-bold text-sni-text mb-2">Érvénytelen link</h1>
          <p className="text-sm text-gray-500">Kérj új meghívót a munkáltatódtól.</p>
        </div>
      </div>
    );
  }

  const { enrollment, participant, courseVersion } = ctx;
  const course = courseVersion.course as { title: string } | undefined;

  // Teszt nem érhető el ha a tananyag nincs elvégezve
  if (!["course_completed", "test_in_progress", "test_failed"].includes(enrollment.status)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <p className="text-5xl mb-4">📚</p>
          <h1 className="text-xl font-bold text-sni-text mb-2">Előbb végezd el a tananyagot</h1>
          <p className="text-sm text-gray-500 mb-6">
            A teszt csak a teljes tananyag elvégzése után érhető el.
          </p>
          <Link
            href={`/akademia/meghivo/${token}`}
            className="inline-block rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy"
          >
            Vissza a képzéshez
          </Link>
        </div>
      </div>
    );
  }

  const isPreviouslyFailed = enrollment.status === "test_failed";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6 flex items-center justify-between">
          <Link
            href={`/akademia/meghivo/${token}`}
            className="text-xs text-gray-500 hover:text-sni-brand-blue"
          >
            ← Vissza
          </Link>
          <span className="text-sm font-semibold text-sni-text">
            {course?.title ?? "Teszt"} – Ellenőrző teszt
          </span>
          <span className="text-xs text-gray-400">
            {participant.last_name} {participant.first_name}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {isPreviouslyFailed && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 mb-6 text-sm text-amber-800">
            <p className="font-semibold mb-1">Korábbi sikertelen kísérlet</p>
            <p>Most újra megpróbálhatod. Tekintsd át a tananyagot az eredmény javítása érdekében.</p>
          </div>
        )}

        <div className="rounded-2xl border border-gray-100 bg-white shadow-soft px-6 py-8 mb-6">
          <div className="text-center mb-8">
            <p className="text-4xl mb-3">🎓</p>
            <h1 className="text-xl font-bold text-sni-text mb-1">Ellenőrző teszt</h1>
            <p className="text-sm text-gray-500">
              Válaszolj a kérdésekre! A teszt eredménye meghatározza az igazolás kiállítását.
            </p>
          </div>

          <TestEngine enrollmentId={enrollment.id} token={token} />
        </div>
      </div>
    </div>
  );
}
