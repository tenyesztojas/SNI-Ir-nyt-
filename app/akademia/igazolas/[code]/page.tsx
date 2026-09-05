import { getCertificateByCode } from "@/lib/academy/data";
import type { Metadata } from "next";
import Link from "next/link";

interface Props {
  params: Promise<{ code: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  return {
    title: `Igazolás ellenőrzése – ${params.code} | Védett Akadémia`,
    robots: "noindex",
  };
}

export default async function IgazolasEllenorzesPage(props: Props) {
  const params = await props.params;
  const { code } = params;
  const data = await getCertificateByCode(code);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <p className="text-5xl mb-4">❌</p>
          <h1 className="text-xl font-bold text-sni-text mb-2">Igazolás nem található</h1>
          <p className="text-sm text-gray-500">
            A <code className="bg-gray-100 px-1 rounded text-xs">{code}</code> azonosítójú igazolás
            nem létezik vagy már nem érvényes.
          </p>
          <p className="text-xs text-gray-400 mt-4">
            Ha kérdésed van, vedd fel a kapcsolatot a munkáltatóddal.
          </p>
        </div>
      </div>
    );
  }

  const { certificate, participantName, courseName, courseVersion, partnerName } = data;

  const issuedAt = certificate.issued_at
    ? new Date(certificate.issued_at).toLocaleDateString("hu-HU")
    : "–";

  const expiresAt = certificate.expires_at
    ? new Date(certificate.expires_at).toLocaleDateString("hu-HU")
    : null;

  const isExpired = certificate.expires_at
    ? new Date(certificate.expires_at) < new Date()
    : false;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-widest text-sni-brand-teal font-bold mb-1">
            Védett Akadémia
          </p>
          <h1 className="text-xl font-black text-sni-brand-navy">Igazolás ellenőrzése</h1>
        </div>

        {/* Status badge */}
        <div className={`rounded-full text-center py-2 px-4 text-sm font-bold mb-6 ${
          isExpired
            ? "bg-gray-100 text-gray-500"
            : "bg-emerald-100 text-emerald-700"
        }`}>
          {isExpired ? "⚠️ Ez az igazolás lejárt" : "✓ Érvényes igazolás"}
        </div>

        {/* Certificate card */}
        <div className="rounded-2xl border-2 border-sni-brand-teal bg-white shadow-soft overflow-hidden mb-6">
          <div className="bg-sni-brand-teal/5 border-b border-sni-brand-teal/20 px-6 py-4">
            <p className="font-mono text-xs text-gray-400">Igazolás azonosító</p>
            <p className="font-mono font-bold text-sni-brand-navy">{code}</p>
          </div>
          <div className="px-6 py-5 grid grid-cols-1 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Képzésben résztvevő</p>
              <p className="font-bold text-sni-text">{participantName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Elvégzett képzés</p>
              <p className="font-semibold text-sni-text">{courseName}</p>
              <p className="text-xs text-gray-400">Verzió: {courseVersion}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Munkáltató</p>
              <p className="font-semibold text-sni-text">{partnerName}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Teszt eredmény</p>
                <p className="font-bold text-emerald-600">{certificate.test_score}%</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Kiállítva</p>
                <p className="font-semibold text-sni-text text-sm">{issuedAt}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Érvényes</p>
                <p className={`font-semibold text-sm ${isExpired ? "text-gray-400 line-through" : "text-sni-text"}`}>
                  {expiresAt ?? "Korlátlan"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400">
          Ez az oldal a VédettSarok Védett Akadémia rendszerén keresztül állíttatott ki.{" "}
          <Link href="/" className="underline">vedettsarok.hu</Link>
        </p>
      </div>
    </div>
  );
}
