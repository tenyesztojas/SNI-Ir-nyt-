"use client";
import { useState, useTransition } from "react";
import { Save, Loader2 } from "lucide-react";
import { updateProviderDescription } from "@/lib/actions/provider";

export default function ProviderDescriptionEditor({ initialValue }: { initialValue: string }) {
  const [text, setText] = useState(initialValue);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div>
      <textarea rows={5} value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }}
        maxLength={2000} placeholder="Foglalással kapcsolatos hasznos tudnivalók..."
        className="input-field resize-none text-sm w-full" />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-gray-400">{text.length}/2000</p>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-emerald-600">Mentve!</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button disabled={isPending}
            onClick={() => {
              setError(null); setSaved(false);
              startTransition(async () => {
                const r = await updateProviderDescription(text);
                if (r.error) { setError(r.error); return; }
                setSaved(true);
              });
            }}
            className="btn-primary text-sm disabled:opacity-50">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Mentés
          </button>
        </div>
      </div>
    </div>
  );
}
