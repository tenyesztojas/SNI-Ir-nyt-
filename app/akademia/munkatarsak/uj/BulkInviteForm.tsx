"use client";
import { useState } from "react";
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

function parseRow(line: string, index: number): ParsedRow {
  const parts = line.split(",").map((s) => s.trim());
  const [lastName, firstName, email, location = "", jobRole = ""] = parts;

  if (!lastName || !firstName)
    return { lastName: "", firstName: "", email: "", location: "", jobRole: "", valid: false, error: `${index + 1}. sor: hiányzó név` };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { lastName, firstName, email: email ?? "", location, jobRole, valid: false, error: `${index + 1}. sor: érvénytelen e-mail (${email})` };

  return { lastName, firstName, email, location, jobRole, valid: true };
}

export default function BulkInviteForm({ courseVersions }: { courseVersions: CourseVersion[] }) {
  const [csvText, setCsvText] = useState("");
  const [courseVersionId, setCourseVersionId] = useState(courseVersions[0]?.id ?? "");
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; errors: string[] } | null>(null);

  function handlePreview() {
    const lines = csvText.split("\n").filter((l) => l.trim());
    const parsed = lines.map((l, i) => parseRow(l, i));
    setPreview(parsed);
    setResult(null);
  }

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
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="csv-course" className="block text-xs font-semibold text-gray-600 mb-1">
          Hozzárendelt képzés
        </label>
        <select
          id="csv-course"
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

      <div>
        <label htmlFor="bulk-csv" className="block text-xs font-semibold text-gray-600 mb-1">
          CSV adatok (soronként egy munkatárs)
        </label>
        <textarea
          id="bulk-csv"
          value={csvText}
          onChange={(e) => { setCsvText(e.target.value); setPreview(null); setResult(null); }}
          rows={6}
          placeholder={"Kovács,Anna,kovacs.anna@ceg.hu,Budapest,pénztáros\nNagy,Péter,nagy.peter@ceg.hu,Győr,ügyfélszolgálat"}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono outline-none focus:border-sni-brand-teal resize-none"
        />
      </div>

      {!preview && (
        <button
          onClick={handlePreview}
          disabled={!csvText.trim()}
          className="rounded-full border border-sni-brand-teal px-5 py-2 text-sm font-semibold text-sni-brand-teal hover:bg-sni-brand-teal hover:text-sni-brand-navy transition disabled:opacity-40"
        >
          Előnézet és ellenőrzés
        </button>
      )}

      {preview && (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 flex gap-4 text-xs font-semibold">
            <span className="text-emerald-600">Érvényes: {preview.filter((r) => r.valid).length}</span>
            <span className="text-red-500">Hibás: {preview.filter((r) => !r.valid).length}</span>
          </div>
          <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
            {preview.map((r, i) => (
              <div key={i} className={`px-4 py-2 text-xs flex items-center gap-2 ${r.valid ? "text-gray-700" : "text-red-600 bg-red-50"}`}>
                {r.valid ? "✓" : "✗"}
                <span>{r.valid ? `${r.lastName} ${r.firstName} – ${r.email}` : r.error}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-gray-50 flex gap-3">
            <button
              onClick={handleSend}
              disabled={sending || preview.filter((r) => r.valid).length === 0}
              className="rounded-full bg-sni-brand-teal px-5 py-2 text-xs font-bold text-sni-brand-navy disabled:opacity-40 hover:bg-sni-brand-blue hover:text-white transition"
            >
              {sending ? "Küldés..." : `${preview.filter((r) => r.valid).length} meghívó küldése`}
            </button>
            <button
              onClick={() => setPreview(null)}
              className="rounded-full border border-gray-200 px-4 py-2 text-xs text-gray-500"
            >
              Mégse
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className={`rounded-xl px-4 py-3 text-sm ${result.errors.length === 0 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`} role="status">
          <p className="font-semibold">{result.sent} meghívó sikeresen elküldve.</p>
          {result.errors.map((e, i) => (
            <p key={i} className="text-xs mt-1 text-red-600">{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}
