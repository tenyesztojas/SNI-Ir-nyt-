"use client";

import { useState } from "react";
import { submitUserReport } from "@/app/kozosseg/actions";
import { USER_REPORT_REASONS } from "@/lib/community/types";

interface Props {
  reportedUserId: string;
  relatedHelpSettingId?: string | null;
}

export default function ReportUserButton({ reportedUserId, relatedHelpSettingId }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (description.trim().length < 20) {
      setResult({ ok: false, text: "Kérjük, adj meg legalább 20 karakteres indoklást." });
      return;
    }
    if (description.trim().length > 1000) {
      setResult({ ok: false, text: "A jelentés szövege legfeljebb 1000 karakter lehet." });
      return;
    }
    setSending(true);
    const res = await submitUserReport({
      reportedUserId,
      relatedHelpSettingId: relatedHelpSettingId ?? null,
      reason,
      description,
    });
    setSending(false);
    if (res.ok) {
      setResult({ ok: true, text: "Köszönjük, megkaptuk a jelentést. Az adminisztrátorok megvizsgálják, és szükség esetén intézkednek." });
    } else {
      setResult({ ok: false, text: res.error ?? "A jelentést most nem sikerült elküldeni. Kérjük, próbáld újra később." });
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setResult(null); }}
        className="text-xs text-gray-400 hover:text-red-500 transition underline"
      >
        Felhasználó jelentése
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-sni-text mb-2">Felhasználó jelentése</h2>
            <p className="text-xs text-gray-500 mb-4">
              A jelentés segít abban, hogy a VédettSarok közössége biztonságosabb maradjon.
              Kérjük, írd le röviden, mi történt vagy miért tartod problémásnak a felhasználó viselkedését.
              A jelentést az adminisztrátorok vizsgálják meg.
            </p>

            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500 mb-4">
              A VédettSarok csak a kapcsolatfelvételi felületet biztosítja. A konkrét segítségnyújtás a felek saját felelőssége.
            </div>

            {result?.ok ? (
              <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 mb-4">{result.text}</div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-600">Jelentés oka</span>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
                  >
                    <option value="">— Válassz okot —</option>
                    {USER_REPORT_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-600">
                    Miért jelented ezt a felhasználót? <span className="text-red-500">*</span>
                  </span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
                    required
                    rows={4}
                    placeholder="Írd le röviden, mi történt. Például: zaklatott, kéretlen üzeneteket küldött, pénzt kért, veszélyesnek tűnő segítséget ajánlott, gyermek személyes adatait osztotta meg, vagy más okból problémásnak tartod."
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal resize-none"
                  />
                  <p className="text-right text-xs text-gray-400">{description.length}/1000</p>
                </label>

                <p className="text-xs text-gray-400">
                  Kérjük, a jelentésben se írj le feleslegesen gyermeknevet, pontos lakcímet, TAJ-számot, diagnózist, egészségügyi dokumentumot vagy más érzékeny adatot. Csak annyi információt adj meg, amennyi a helyzet megértéséhez szükséges.
                </p>

                {result && !result.ok && (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{result.text}</p>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={sending}
                    className="flex-1 rounded-full bg-red-500 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-60 transition"
                  >
                    {sending ? "Küldés..." : "Jelentés elküldése"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-full border border-gray-200 px-5 py-2 text-sm text-gray-500 hover:bg-gray-50"
                  >
                    Mégsem
                  </button>
                </div>
              </form>
            )}

            {result?.ok && (
              <button
                onClick={() => setOpen(false)}
                className="w-full mt-3 rounded-full border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50"
              >
                Bezárás
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
