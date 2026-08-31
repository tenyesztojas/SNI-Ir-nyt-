"use client";
import { useState, useRef } from "react";
import { saveDocxImport } from "@/lib/academy/actions";
import type { ParsedDocxModule } from "@/lib/academy/types";

interface Props {
  courseVersionId: string;
  versionLabel: string;
}

export default function DocxImportClient({ courseVersionId, versionLabel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ParsedDocxModule[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setPreview(null);
    setSaved(false);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/akademia/docx-upload", { method: "POST", body: fd });
      const data = await res.json() as { ok: boolean; modules?: ParsedDocxModule[]; warnings?: string[]; error?: string };

      if (!data.ok) {
        setError(data.error ?? "Feltöltési hiba.");
        return;
      }
      setPreview(data.modules ?? []);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Hálózati hiba.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    setError(null);

    const modules = preview.map((m) => ({
      title: m.title,
      lessons: m.lessons.map((l) => ({
        title: l.title,
        blocks: l.blocks.map((b) => ({
          type: b.type,
          content: b.content as Record<string, unknown>,
        })),
      })),
    }));

    const res = await saveDocxImport(courseVersionId, modules);
    setSaving(false);

    if (!res.ok) {
      setError(res.error ?? "Mentési hiba.");
    } else {
      setSaved(true);
      setPreview(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-100 bg-white shadow-soft p-6">
        <h2 className="font-bold text-sni-text mb-1">DOCX fájl feltöltése</h2>
        <p className="text-xs text-gray-400 mb-4">
          Verzió: <span className="font-mono font-bold">{versionLabel}</span> – a meglévő tartalom nem törlődik, az import kiegészíti.
        </p>

        <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 px-6 py-10 cursor-pointer hover:border-sni-brand-teal transition-colors">
          <span className="text-3xl">📄</span>
          <span className="text-sm font-semibold text-gray-600">
            {uploading ? "Feldolgozás..." : "Kattints vagy húzd ide a .docx fájlt"}
          </span>
          <span className="text-xs text-gray-400">Max. 10 MB</span>
          <input
            ref={fileRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {saved && (
          <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 font-semibold">
            ✓ Tartalom sikeresen elmentve!
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-xs font-bold text-amber-800 mb-1">Figyelmeztetések ({warnings.length})</p>
          <ul className="space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-sni-text">
              Előnézet – {preview.length} modul, {preview.reduce((a, m) => a + m.lessons.length, 0)} lecke
            </h2>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition disabled:opacity-50"
            >
              {saving ? "Mentés..." : "Tartalom mentése"}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {preview.map((mod, mi) => (
              <div key={mi} className="px-5 py-3">
                <p className="font-bold text-sni-brand-navy text-sm">
                  Modul {mi + 1}: {mod.title}
                </p>
                {mod.lessons.map((lesson, li) => (
                  <div key={li} className="ml-4 mt-1">
                    <p className="text-sm text-gray-700">
                      {li + 1}. {lesson.title}
                      <span className="ml-2 text-xs text-gray-400">{lesson.blocks.length} blokk</span>
                    </p>
                    <div className="ml-4 flex flex-wrap gap-1 mt-0.5">
                      {lesson.blocks.slice(0, 8).map((b, bi) => (
                        <span key={bi} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                          {b.type}
                        </span>
                      ))}
                      {lesson.blocks.length > 8 && (
                        <span className="text-xs text-gray-400">+{lesson.blocks.length - 8} több</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
