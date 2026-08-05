"use client";

import { useState, useTransition } from "react";
import { Send, Loader2, Trash2 } from "lucide-react";
import { PlaceResponse } from "@/lib/types";
import { submitPlaceResponse, deleteOwnResponse } from "@/lib/actions/responses";

interface Props {
  reviewId: string;
  placeId: string;
  existingResponse: PlaceResponse | null;
  isOwner: boolean; // bejelentkezett user verified tulajdonos
}

export default function PlaceResponseSection({
  reviewId,
  placeId,
  existingResponse,
  isOwner,
}: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [localResponse, setLocalResponse] = useState<PlaceResponse | null>(existingResponse);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Ha már van aktív válasz, csak megmutatjuk (+ tulajdonosnak törlési opció)
  if (localResponse && localResponse.status === "published") {
    return (
      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="mb-1 text-xs font-semibold text-blue-700">A hely válasza:</p>
        <p className="text-sm text-blue-900 leading-relaxed">{localResponse.text}</p>
        {isOwner && (
          <button
            onClick={() => {
              if (!confirm("Biztosan törlöd ezt a választ?")) return;
              startTransition(async () => {
                await deleteOwnResponse(localResponse.id, placeId);
                setLocalResponse(null);
              });
            }}
            className="mt-2 inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
          >
            <Trash2 size={12} /> Válasz törlése
          </button>
        )}
      </div>
    );
  }

  // Ha nem tulajdonos és nincs válasz — ne mutass semmit
  if (!isOwner) return null;

  return (
    <div className="mt-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-sni-brand-blue hover:underline"
        >
          + Nyilvános válasz írása erre az értékelésre
        </button>
      ) : (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <p className="mb-2 text-xs font-semibold text-blue-800">
            Nyilvános válasz — az értékelő és minden látogató látja
          </p>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder="Köszönjük a visszajelzést! ..."
            className="input-field resize-none text-sm"
          />
          <p className="mt-1 text-right text-xs text-gray-400">{text.length}/2000</p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button
              disabled={isPending || text.trim().length < 10}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await submitPlaceResponse(reviewId, placeId, text);
                  if (res.error) { setError(res.error); return; }
                  setLocalResponse({
                    id: crypto.randomUUID(),
                    reviewId,
                    placeId,
                    responderUserId: "",
                    text: text.trim(),
                    status: "published",
                    createdAt: new Date().toISOString(),
                  });
                  setOpen(false);
                  setText("");
                });
              }}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Közzétesz
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm">
              Mégse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
