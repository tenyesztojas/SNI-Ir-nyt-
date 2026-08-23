"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  sendConnectionRequest,
  respondToConnection,
  blockUser,
  submitReport,
} from "@/app/kozosseg/actions";
import type { CommunityProfile, CommunityConnection } from "@/lib/community/types";

interface Props {
  profile: CommunityProfile;
  ownProfile: CommunityProfile;
  existingConnection: CommunityConnection | null;
  currentUserId: string;
}

const REPORT_REASONS = [
  "Zaklatás",
  "Kéretlen üzenet",
  "Gyanús profil",
  "Spam",
  "Sértő tartalom",
  "Gyermekadat vagy érzékeny adat megosztása",
  "Nem megfelelő fotó",
  "Reklám",
  "Egyéb",
];

export default function ConnectionActions({
  profile,
  ownProfile,
  existingConnection,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [introMessage, setIntroMessage] = useState("");
  const [showIntro, setShowIntro] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDesc, setReportDesc] = useState("");
  const [reportSent, setReportSent] = useState(false);

  const conn = existingConnection;
  const isRequester = conn?.requester_user_id === currentUserId;
  const isReceiver = conn?.receiver_user_id === currentUserId;

  async function handleConnect() {
    setSending(true);
    const res = await sendConnectionRequest(profile.user_id, introMessage || undefined);
    setSending(false);
    if (res.ok) {
      setMsg("Kapcsolódási kérés elküldve!");
      setShowIntro(false);
      router.refresh();
    } else {
      setMsg(res.error ?? "Hiba történt.");
    }
  }

  async function handleRespond(response: "accepted" | "declined") {
    if (!conn) return;
    setSending(true);
    const res = await respondToConnection(conn.id, response);
    setSending(false);
    if (res.ok) router.refresh();
    else setMsg(res.error ?? "Hiba történt.");
  }

  async function handleBlock() {
    if (!confirm("Biztosan tiltani szeretnéd ezt a felhasználót?")) return;
    await blockUser(profile.user_id);
    router.refresh();
  }

  async function handleReport() {
    const res = await submitReport({
      reportedUserId: profile.user_id,
      reportedProfileId: profile.id,
      reason: reportReason,
      description: reportDesc,
    });
    if (res.ok) {
      setReportSent(true);
      setShowReport(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Kapcsolat állapot */}
      {!conn && profile.accepts_friend_requests && (
        <div>
          {!showIntro ? (
            <button
              onClick={() => setShowIntro(true)}
              className="w-full rounded-xl bg-sni-brand-teal py-3 font-semibold text-white hover:bg-sni-brand-blue transition"
            >
              Kapcsolódnék
            </button>
          ) : (
            <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-sni-text">Kapcsolódási kérés küldése</p>
              <textarea
                className="input-field min-h-[80px] resize-y text-sm"
                placeholder="Opcionális bemutatkozó üzenet..."
                value={introMessage}
                onChange={(e) => setIntroMessage(e.target.value)}
                maxLength={300}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleConnect}
                  disabled={sending}
                  className="flex-1 btn-primary disabled:opacity-60"
                >
                  {sending ? "Küldés..." : "Küldés"}
                </button>
                <button onClick={() => setShowIntro(false)} className="btn-secondary">
                  Mégse
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!conn && !profile.accepts_friend_requests && (
        <p className="text-sm text-gray-400 text-center">Ez a felhasználó nem fogad jelöléseket.</p>
      )}

      {/* Függőben lévő kérés (én küldtem) */}
      {conn?.status === "pending" && isRequester && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Kapcsolódási kérés elküldve — várakozás a válaszra.
        </div>
      )}

      {/* Bejövő kérés (másik fél küldött) */}
      {conn?.status === "pending" && isReceiver && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-sni-text">Bejövő kapcsolódási kérés</p>
          {conn.intro_message && (
            <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700 italic">
              &ldquo;{conn.intro_message}&rdquo;
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => handleRespond("accepted")}
              disabled={sending}
              className="flex-1 btn-primary disabled:opacity-60"
            >
              Elfogadom
            </button>
            <button
              onClick={() => handleRespond("declined")}
              disabled={sending}
              className="flex-1 btn-secondary disabled:opacity-60"
            >
              Elutasítom
            </button>
          </div>
        </div>
      )}

      {/* Elfogadott kapcsolat */}
      {conn?.status === "accepted" && (
        <div className="flex gap-2">
          <a
            href="/kozosseg/uzenetek"
            className="flex-1 rounded-xl bg-sni-brand-teal py-2.5 text-center font-semibold text-white hover:bg-sni-brand-blue transition text-sm"
          >
            Üzenet küldése
          </a>
          <span className="flex items-center rounded-xl border border-green-200 bg-green-50 px-4 text-sm text-green-700 font-medium">
            ✓ Kapcsolat
          </span>
        </div>
      )}

      {msg && (
        <p className="rounded-xl bg-blue-50 px-4 py-2.5 text-sm text-blue-700">{msg}</p>
      )}

      {reportSent && (
        <p className="rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-700">
          Bejelentés elküldve. Köszönjük!
        </p>
      )}

      {/* Tiltás + Bejelentés */}
      <div className="flex gap-3 border-t pt-4">
        <button onClick={handleBlock} className="text-xs text-gray-400 hover:text-red-500 transition">
          Tiltás
        </button>
        <button onClick={() => setShowReport((v) => !v)} className="text-xs text-gray-400 hover:text-orange-500 transition">
          Bejelentés
        </button>
      </div>

      {showReport && (
        <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-sni-text">Bejelentés</p>
          <select className="input-field text-sm" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
            {REPORT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <textarea className="input-field text-sm min-h-[60px] resize-y" placeholder="Részletek (opcionális)..." value={reportDesc} onChange={(e) => setReportDesc(e.target.value)} maxLength={500} />
          <div className="flex gap-2">
            <button onClick={handleReport} className="btn-primary text-sm">Elküldés</button>
            <button onClick={() => setShowReport(false)} className="btn-secondary text-sm">Mégse</button>
          </div>
        </div>
      )}
    </div>
  );
}
