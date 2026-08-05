"use client";

import { useState, useTransition } from "react";
import { Reply, ShieldOff, Loader2 } from "lucide-react";
import { Message } from "@/lib/types";
import { replyToMessage, markMessageRead, blockPlace } from "@/lib/actions/messages";

interface Props {
  messages: Message[];
  currentUserId: string;
  placeById: Map<string, { id: string; name: string; slug: string }>;
}

export default function MessageThread({ messages, currentUserId, placeById }: Props) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      {messages.map((m) => {
        const isIncoming = m.recipientUserId === currentUserId;
        const place = placeById.get(m.placeId);

        return (
          <div
            key={m.id}
            className={`rounded-xl border p-4 ${
              isIncoming && !m.readAt
                ? "border-sni-brand-teal/40 bg-teal-50/30"
                : "border-gray-100 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-gray-500">
                  {place?.name ?? m.placeId}
                  {isIncoming ? " → Hozzád" : " · Elküldve"}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(m.createdAt).toLocaleString("hu-HU")}
                </p>
              </div>
              {isIncoming && !m.readAt && (
                <span className="rounded-full bg-sni-brand-teal/20 px-2 py-0.5 text-xs font-bold text-sni-brand-teal">
                  Új
                </span>
              )}
            </div>

            <p className="mt-2 text-sm text-gray-800 leading-relaxed">{m.text}</p>

            {isIncoming && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setReplyingTo(m.id);
                    startTransition(async () => { await markMessageRead(m.id); });
                  }}
                  className="inline-flex items-center gap-1 text-xs text-sni-brand-blue hover:underline"
                >
                  <Reply size={13} /> Válasz
                </button>
                {m.reviewId && (
                  <button
                    onClick={() => {
                      if (!confirm("Letiltod ezt a helyet? Ezután nem küldhet neked üzenetet.")) return;
                      startTransition(async () => { await blockPlace(m.placeId, m.reviewId!); });
                    }}
                    className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
                  >
                    <ShieldOff size={13} /> Hely tiltása
                  </button>
                )}
              </div>
            )}

            {replyingTo === m.id && (
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  maxLength={1000}
                  placeholder="Írd ide a választ..."
                  className="input-field resize-none text-sm"
                />
                {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    disabled={isPending || replyText.trim().length < 2}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const res = await replyToMessage(m.id, replyText);
                        if (res.error) { setError(res.error); return; }
                        setReplyingTo(null);
                        setReplyText("");
                      });
                    }}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {isPending ? <Loader2 size={13} className="animate-spin" /> : null}
                    Küldés
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="btn-secondary text-sm"
                  >
                    Mégse
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
