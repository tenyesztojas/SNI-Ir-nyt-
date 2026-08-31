"use client";
import { useState, useCallback } from "react";
import type { AcademyCertificate } from "@/lib/academy/types";

interface Props {
  certificate: AcademyCertificate;
  participantName: string;
  courseName: string;
  courseVersion: string;
  partnerName: string;
}

export default function CertificatePdf({
  certificate,
  participantName,
  courseName,
  courseVersion,
  partnerName,
}: Props) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setError(null);
    try {
      const el = document.getElementById("academy-certificate-root");
      if (!el) throw new Error("Elem nem található.");
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf().set({
        margin: 0,
        filename: `igazolas-${certificate.certificate_code}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
      }).from(el).save();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ismeretlen hiba.");
    } finally {
      setDownloading(false);
    }
  }, [certificate.certificate_code]);

  const issuedAt = certificate.issued_at
    ? new Date(certificate.issued_at).toLocaleDateString("hu-HU")
    : "";
  const expiresAt = certificate.expires_at
    ? new Date(certificate.expires_at).toLocaleDateString("hu-HU")
    : null;

  return (
    <div className="flex flex-col gap-6 items-center">
      {/* Certificate visual */}
      <div
        id="academy-certificate-root"
        className="w-full max-w-3xl bg-white border-4 border-sni-brand-teal rounded-2xl px-12 py-10"
        style={{ fontFamily: "Nunito, sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs uppercase tracking-widest text-sni-brand-teal font-bold">
              Védett Akadémia
            </p>
            <p className="text-xs text-gray-400">vedettsarok.hu</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Azonosító:</p>
            <p className="font-mono text-xs font-bold text-sni-brand-navy">{certificate.certificate_code}</p>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <p className="text-sm text-gray-400 mb-1">KÉPZÉSI IGAZOLÁS</p>
          <h1 className="text-3xl font-black text-sni-brand-navy leading-tight">
            {participantName}
          </h1>
          <p className="text-sm text-gray-500 mt-2">sikeresen teljesítette a következő képzést:</p>
          <p className="text-xl font-bold text-sni-text mt-2">{courseName}</p>
          <p className="text-xs text-gray-400">Verzió: {courseVersion}</p>
        </div>

        {/* Details */}
        <div className="grid grid-cols-3 gap-6 text-center mb-8">
          <div className="rounded-xl bg-gray-50 py-4 px-3">
            <p className="text-xs text-gray-400 mb-1">Kiállítva</p>
            <p className="font-bold text-sni-text">{issuedAt}</p>
          </div>
          <div className="rounded-xl bg-gray-50 py-4 px-3">
            <p className="text-xs text-gray-400 mb-1">Teszt eredmény</p>
            <p className="font-bold text-emerald-600 text-lg">{certificate.test_score}%</p>
          </div>
          <div className="rounded-xl bg-gray-50 py-4 px-3">
            <p className="text-xs text-gray-400 mb-1">Érvényes</p>
            <p className="font-bold text-sni-text">{expiresAt ?? "Korlátlan"}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-end justify-between border-t border-gray-100 pt-6">
          <div>
            <p className="text-xs text-gray-400">Munkáltató</p>
            <p className="font-semibold text-sni-text">{partnerName}</p>
          </div>
          <div className="text-right">
            <div className="h-8 w-24 border-b-2 border-gray-300 mb-1" />
            <p className="text-xs text-gray-400">VédettSarok képviseletében</p>
          </div>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition disabled:opacity-50"
      >
        {downloading ? "PDF generálása..." : "⬇ Igazolás letöltése (PDF)"}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
