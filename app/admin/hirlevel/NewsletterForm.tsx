"use client";

import { useState } from "react";
import { Send, Loader2 } from "lucide-react";

export default function NewsletterForm({ subscriberCount }: { subscriberCount: number }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      setStatus("err");
      setMessage("Töltsd ki a tárgyat és a szöveget.");
      return;
    }
    const confirmed = window.confirm(
      `Biztosan elkülded ${subscriberCount} feliratkozónak?`
    );
    if (!confirmed) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/hirlevel/kuldes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const json = await res.json();
      if (res.ok) {
        setStatus("ok");
        setMessage(json.message);
        setSubject("");
        setBody("");
      } else {
        setStatus("err");
        setMessage(json.error ?? "Ismeretlen hiba");
      }
    } catch {
      setStatus("err");
      setMessage("Hálózati hiba");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-gray-700">Tárgy</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="input-field mt-1.5"
          placeholder="Pl. VédettSarok – júliusi újdonságok"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700">Szövegtörzs</label>
        <p className="mb-1.5 text-xs text-gray-400">
          Minden üres sort új bekezdésként kezel a rendszer.
        </p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="input-field mt-0 w-full resize-y font-mono text-sm"
          placeholder="Ide írd a hírlevél szövegét..."
        />
      </div>

      {status === "ok" && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          ✓ {message}
        </p>
      )}
      {status === "err" && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          ✗ {message}
        </p>
      )}

      <button
        onClick={handleSend}
        disabled={status === "loading" || subscriberCount === 0}
        className="inline-flex items-center gap-2 rounded-full bg-sni-brand-teal px-6 py-3 font-bold text-white transition hover:bg-sni-brand-blue disabled:opacity-50"
      >
        {status === "loading" ? (
          <><Loader2 size={18} className="animate-spin" /> Küldés folyamatban...</>
        ) : (
          <><Send size={18} /> Küldés {subscriberCount} feliratkozónak</>
        )}
      </button>
    </div>
  );
}
