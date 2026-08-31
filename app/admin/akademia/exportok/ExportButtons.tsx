"use client";
import type { AcademyEnrollment } from "@/lib/academy/types";

interface Props {
  enrollments: AcademyEnrollment[];
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function download(filename: string, content: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportButtons({ enrollments }: Props) {
  function exportEnrollments() {
    const header = ["Vezeteknev", "Keresztnev", "Email", "Telephely", "Munkakör", "Kurzus", "Verzio", "Statusz", "Haladas", "Teszt_eredmeny", "Beiratkozas", "Teljesites"];
    const rows = enrollments.map((e) => {
      const p = e.participant as { first_name: string; last_name: string; email: string; location?: string; job_role?: string } | undefined;
      const cv = e.course_version as { version: string; course?: { title: string } | null } | undefined;
      const cert = e.certificate as { test_score: number; issued_at: string } | undefined;
      return [
        p?.last_name ?? "",
        p?.first_name ?? "",
        p?.email ?? "",
        p?.location ?? "",
        p?.job_role ?? "",
        cv?.course?.title ?? "",
        cv?.version ?? "",
        e.status,
        String(e.progress_percent),
        cert ? String(cert.test_score) : "",
        e.created_at ? new Date(e.created_at).toLocaleDateString("hu-HU") : "",
        cert?.issued_at ? new Date(cert.issued_at).toLocaleDateString("hu-HU") : "",
      ];
    });
    download(`akademia-beiratkozasok-${Date.now()}.csv`, toCsv([header, ...rows]));
  }

  function exportCertificates() {
    const completed = enrollments.filter((e) => e.status === "completed");
    const header = ["Igazolas_kod", "Vezeteknev", "Keresztnev", "Email", "Kurzus", "Verzio", "Teszt_eredmeny", "Kiallitva", "Lejar"];
    const rows = completed.map((e) => {
      const p = e.participant as { first_name: string; last_name: string; email: string } | undefined;
      const cv = e.course_version as { version: string; course?: { title: string } | null } | undefined;
      const cert = e.certificate as { certificate_code: string; test_score: number; issued_at: string; expires_at?: string } | undefined;
      return [
        cert?.certificate_code ?? "",
        p?.last_name ?? "",
        p?.first_name ?? "",
        p?.email ?? "",
        cv?.course?.title ?? "",
        cv?.version ?? "",
        cert ? String(cert.test_score) : "",
        cert?.issued_at ? new Date(cert.issued_at).toLocaleDateString("hu-HU") : "",
        cert?.expires_at ? new Date(cert.expires_at).toLocaleDateString("hu-HU") : "",
      ];
    });
    download(`akademia-igazolasok-${Date.now()}.csv`, toCsv([header, ...rows]));
  }

  return (
    <div className="flex flex-wrap gap-4">
      <div className="rounded-2xl border border-gray-100 bg-white shadow-soft p-6 flex flex-col gap-3">
        <h2 className="font-bold text-sni-text">Összes beiratkozás</h2>
        <p className="text-xs text-gray-400">Minden enrollment rekord: munkatárs adatok, státusz, haladás, teszt eredmény.</p>
        <button
          onClick={exportEnrollments}
          className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition"
        >
          ⬇ Beiratkozások letöltése
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-soft p-6 flex flex-col gap-3">
        <h2 className="font-bold text-sni-text">Igazolások</h2>
        <p className="text-xs text-gray-400">Csak teljesített beiratkozások, igazolás kóddal és lejárati dátummal.</p>
        <button
          onClick={exportCertificates}
          className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition"
        >
          ⬇ Igazolások letöltése
        </button>
      </div>
    </div>
  );
}
