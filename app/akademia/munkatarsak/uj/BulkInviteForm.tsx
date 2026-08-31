"use client";
import { useState, useRef } from "react";
import { inviteParticipant } from "@/lib/academy/actions";

interface CourseVersion {
  id: string;
  version: string;
  course: { title: string } | null;
}

interface ParsedRow {
  lastName: string;
  firstName: string;
  email: string;
  location: string;
  jobRole: string;
  valid: boolean;
  error?: string;
}

type Tab = "excel" | "csv";

// ── CSV sor parse ───────────────────────────────────────────────
function parseRowFromArray(cells: string[], index: number): ParsedRow {
  const [lastName = "", firstName = "", email = "", location = "", jobRole = ""] = cells.map((s) => s.trim());

  if (!lastName || !firstName)
    return { lastName, firstName, email, location, jobRole, valid: false, error: `${index + 1}. sor: hiányzó név` };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { lastName, firstName, email, location, jobRole, valid: false, error: `${index + 1}. sor: érvénytelen e-mail (${email ?? "üres"})` };

  return { lastName, firstName, email, location, jobRole, valid: true };
}

function parseCsvLine(line: string, index: number): ParsedRow {
  return parseRowFromArray(line.split(","), index);
}

// ── Sablon CSV letöltése ────────────────────────────────────────
function downloadTemplate() {
  const content = [
    "Vezeteknev,Keresztnev,Email,Telephely,Munkakor",
    "Kovács,Anna,kovacs.anna@ceg.hu,Budapest,pénztáros",
    "Nagy,Péter,nagy.peter@ceg.hu,Győr,ügyfélszolgálat",
  ].join("\r\n");

  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "akademia-munkatarsak-sablon.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Komponens ──────────────────────────────────────────────────
export default function BulkInviteForm({ courseVersions }: { courseVersions: CourseVersion[] }) {
  const [tab, setTab] = useState<Tab>("excel");
  const [courseVersionId, setCourseVersionId] = useState(courseVersions[0]?.id ?? "");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; errors: string[] } | null>(null);
  const [xlsxStatus, setXlsxStatus] = useState<"idle" | "loading" | "error">("idle");
  const [xlsxError, setXlsxError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setPreview(null);
    setResult(null);
    setXlsxStatus("idle");
    setXlsxError("");
  }

  // ── Excel feltöltés ────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    resetState();
    setXlsxStatus("loading");

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/akademia/xlsx-parse", { method: "POST", body: formData });
    const json = (await res.json()) as { rows?: string[][]; error?: string };

    if (!res.ok || json.error || !json.rows) {
      setXlsxStatus("error");
      setXlsxError(json.error ?? "Hiba az Excel feldolgozása közben.");
      return;
    }

    setXlsxStatus("idle");

    // Az első sor fejléc lehet — kiszűrjük, ha "email" szó szerepel benne
    let rows = json.rows;
    if (rows.length > 0) {
      const firstRow = rows[0].join(" ").toLowerCase();
      if (firstRow.includes("email") || firstRow.includes("vezet") || firstRow.includes("kereszt")) {
        rows = rows.slice(1);
      }
    }

    const parsed = rows
      .filter((r) => r.some((c) => c.trim()))
      .map((r, i) => parseRowFromArray(r, i));
    setPreview(parsed);
  }

  // ── CSV előnézet ───────────────────────────────────────────
  function handleCsvPreview() {
    const lines = csvText.split("\n").filter((l) => l.trim());
    const parsed = lines.map((l, i) => parseCsvLine(l, i));
    setPreview(parsed);
    setResult(null);
  }

  // ── Meghívók küldése ───────────────────────────────────────
  async function handleSend() {
    if (!preview) return;
    const valid = preview.filter((r) => r.valid);
    if (valid.length === 0) return;

    setSending(true);
    let sent = 0;
    const errors: string[] = [];

    for (const row of valid) {
      const res = await inviteParticipant({
        lastName: row.lastName,
        firstName: row.firstName,
        email: row.email,
        location: row.location,
        jobRole: row.jobRole,
        courseVersionId,
      });
      if (res.ok) sent++;
      else errors.push(`${row.lastName} ${row.firstName}: ${res.error}`);
    }

    setSending(false);
    setResult({ sent, errors });
    setPreview(null);
    setCsvText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const validCount = preview?.filter((r) => r.valid).length ?? 0;
  const invalidCount = preview?.filter((r) => !r.valid).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Képzés választó */}
      <div>
        <label htmlFor="bulk-course" className="block text-xs font-semibold text-gray-600 mb-1">
          Hozzárendelt képzés
        </label>
        <select
          id="bulk-course"
          value={courseVersionId}
          onChange={(e) => setCourseVersionId(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        >
          {courseVersions.map((cv) => (
            <option key={cv.id} value={cv.id}>
              {cv.course?.title ?? "Névtelen kurzus"} ({cv.version})
            </option>
          ))}
        </select>
      </div>

      {/* Tab váltó */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {(["excel", "csv"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); resetState(); setCsvText(""); }}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${tab === t ? "bg-white shadow text-sni-brand-navy" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t === "excel" ? "📊 Excel / CSV fájl" : "⌨️ CSV beillesztés"}
          </button>
        ))}
      </div>

      {/* ── Excel tab ─────────────────────────────────────── */}
      {tab === "excel" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gray-500">
            Tölts fel egy Excel (.xlsx) vagy CSV fájlt. Elvárt oszlopsorrend:{" "}
            <span className="font-mono bg-gray-100 px-1 rounded">Vezetéknév · Keresztnév · E-mail · Telephely · Munkakör</span>
          </p>

          <button
            type="button"
            onClick={downloadTemplate}
            className="self-start text-xs text-sni-brand-blue underline hover:no-underline"
          >
            ⬇ Sablon letöltése (.csv)
          </button>

          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 cursor-pointer hover:border-sni-brand-teal transition">
            <span className="text-2xl">📂</span>
            <span className="text-sm font-semibold text-gray-600">Kattints a fájl kiválasztásához</span>
            <span className="text-xs text-gray-400">.xlsx vagy .csv · max. 5 MB</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>

          {xlsxStatus === "loading" && (
            <p className="text-xs text-gray-500 animate-pulse">Feldolgozás...</p>
          )}
          {xlsxStatus === "error" && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{xlsxError}</p>
          )}
        </div>
      )}

      {/* ── CSV tab ───────────────────────────────────────── */}
      {tab === "csv" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gray-500">
            Illeszd be a munkatársak adatait soronként.{" "}
            Formátum: <span className="font-mono bg-gray-100 px-1 rounded">Vezetéknév,Keresztnév,Email,Telephely,Munkakör</span>
          </p>
          <textarea
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); resetState(); }}
            rows={6}
            placeholder={"Kovács,Anna,kovacs.anna@ceg.hu,Budapest,pénztáros\nNagy,Péter,nagy.peter@ceg.hu,Győr,ügyfélszolgálat"}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono outline-none focus:border-sni-brand-teal resize-none"
          />
          {!preview && (
            <button
              onClick={handleCsvPreview}
              disabled={!csvText.trim()}
              className="self-start rounded-full border border-sni-brand-teal px-5 py-2 text-sm font-semibold text-sni-brand-teal hover:bg-sni-brand-teal hover:text-sni-brand-navy transition disabled:opacity-40"
            >
              Előnézet és ellenőrzés
            </button>
          )}
        </div>
      )}

      {/* ── Előnézet (mindkét tabhoz) ─────────────────────── */}
      {preview && (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 flex gap-4 text-xs font-semibold">
            <span className="text-emerald-600">Érvényes: {validCount}</span>
            {invalidCount > 0 && <span className="text-red-500">Hibás: {invalidCount}</span>}
          </div>
          <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
            {preview.map((r, i) => (
              <div
                key={i}
                className={`px-4 py-2 text-xs flex items-start gap-2 ${r.valid ? "text-gray-700" : "text-red-600 bg-red-50/60"}`}
              >
                <span className="mt-0.5 shrink-0">{r.valid ? "✓" : "✗"}</span>
                <span>
                  {r.valid
                    ? `${r.lastName} ${r.firstName} — ${r.email}${r.location ? ` · ${r.location}` : ""}${r.jobRole ? ` · ${r.jobRole}` : ""}`
                    : r.error}
                </span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-gray-50 flex gap-3">
            <button
              onClick={handleSend}
              disabled={sending || validCount === 0}
              className="rounded-full bg-sni-brand-teal px-5 py-2 text-xs font-bold text-sni-brand-navy disabled:opacity-40 hover:bg-sni-brand-blue hover:text-white transition"
            >
              {sending ? "Küldés..." : `${validCount} meghívó küldése`}
            </button>
            <button
              onClick={() => { setPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              className="rounded-full border border-gray-200 px-4 py-2 text-xs text-gray-500 hover:border-gray-400 transition"
            >
              Mégse
            </button>
          </div>
        </div>
      )}

      {/* ── Eredmény ─────────────────────────────────────── */}
      {result && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${result.errors.length === 0 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}
          role="status"
        >
          <p className="font-semibold">{result.sent} meghívó sikeresen elküldve.</p>
          {result.errors.map((e, i) => (
            <p key={i} className="text-xs mt-1 text-red-600">{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}
