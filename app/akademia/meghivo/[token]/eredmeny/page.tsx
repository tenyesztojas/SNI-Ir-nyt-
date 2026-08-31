import { resolveInvitationToken } from "@/lib/academy/data";
import { createAdminClient } from "@/lib/supabase/admin";
import CertificatePdf from "@/components/academy/CertificatePdf";
import Link from "next/link";
import type { AcademyCertificate } from "@/lib/academy/types";

interface Props {
  params: { token: string };
}

export default async function EredmenyPage({ params }: Props) {
  const { token } = params;
  const ctx = await resolveInvitationToken(token);

  if (!ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Érvénytelen link.</p>
      </div>
    );
  }

  const { enrollment, participant, courseVersion, partnerName } = ctx;
  const admin = createAdminClient();

  // Get certificate if exists
  const { data: cert } = await admin
    .from("academy_certificates")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .maybeSingle();

  const course = courseVersion.course as { title: string } | undefined;
  const isPassed = enrollment.status === "completed" && !!cert;
  const isFailed = enrollment.status === "test_failed";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6 flex items-center justify-between">
          <Link href={`/akademia/meghivo/${token}`} className="text-xs text-gray-500 hover:text-sni-brand-blue">
            ← Vissza
          </Link>
          <span className="text-xs text-gray-400">
            {participant.last_name} {participant.first_name}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {isPassed && cert ? (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-black text-sni-brand-navy mb-2">Gratulálunk! 🎉</h1>
              <p className="text-gray-500">
                Sikeresen teljesítetted a <strong>{course?.title}</strong> képzést.
              </p>
            </div>
            <CertificatePdf
              certificate={cert as AcademyCertificate}
              participantName={`${participant.last_name} ${participant.first_name}`}
              courseName={course?.title ?? ""}
              courseVersion={courseVersion.version}
              partnerName={partnerName}
            />
            <p className="mt-6 text-center text-xs text-gray-400">
              Az igazolás ellenőrizhető a következő linken:{" "}
              <a
                href={`/akademia/igazolas/${(cert as AcademyCertificate).certificate_code}`}
                target="_blank"
                className="text-sni-brand-blue underline"
              >
                Igazolás ellenőrzése
              </a>
            </p>
          </>
        ) : isFailed ? (
          <div className="max-w-md mx-auto text-center py-12">
            <p className="text-5xl mb-4">😔</p>
            <h1 className="text-xl font-bold text-sni-text mb-2">Sajnos nem sikerült</h1>
            <p className="text-sm text-gray-500 mb-6">
              Nem értük el a szükséges pontszámot. Tekintsd át a tananyagot és próbáld újra.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href={`/akademia/meghivo/${token}`}
                className="rounded-full border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-600 hover:border-sni-brand-teal hover:text-sni-brand-teal transition"
              >
                Tananyag áttekintése
              </Link>
              <Link
                href={`/akademia/meghivo/${token}/teszt`}
                className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition"
              >
                Teszt újra →
              </Link>
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto text-center py-12">
            <p className="text-5xl mb-4">⏳</p>
            <h1 className="text-xl font-bold text-sni-text mb-2">Teszt még nincs befejezve</h1>
            <p className="text-sm text-gray-500 mb-6">Végezd el a tesztet az igazolás megszerzéséhez.</p>
            <Link
              href={`/akademia/meghivo/${token}/teszt`}
              className="inline-block rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy"
            >
              Ugrás a teszthez →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
