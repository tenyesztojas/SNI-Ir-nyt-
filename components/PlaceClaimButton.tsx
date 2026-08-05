"use client";

import { useState, useTransition } from "react";
import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import { submitClaim } from "@/lib/actions/claims";

interface Props {
  placeId: string;
  isClaimed: boolean; // már van verified claim (bárki által)
  isOwner: boolean;   // a bejelentkezett user verified tulajdonos
}

export default function PlaceClaimButton({ placeId, isClaimed, isOwner }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ error?: string; autoVerified?: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (isOwner) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
        <CheckCircle2 size={16} /> Ellenőrzött tulajdonos
      </div>
    );
  }

  if (isClaimed) return null; // más már igényelte, ne mutasd a gombot

  if (result?.autoVerified) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
        <CheckCircle2 size={16} /> Igénylés sikeresen megerősítve — te vagy az ellenőrzött tulajdonos.
      </div>
    );
  }

  if (result && !result.error) {
    return (
      <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Visszaigazoló e-mail elküldve. Ellenőrizd a postaládádat, majd kattints a linkre!
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Building2 size={15} /> Ez az én helyem
        </button>
      ) : (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="mb-3 text-sm font-semibold text-blue-900">Hely igénylése</p>
          <p className="mb-3 text-xs text-blue-700">
            Add meg a hely hivatalos e-mail-jét (pl. info@vendeghaz.hu). Ha a domain egyezik a hely
            weboldalával, azonnal megerősítjük. Egyébként visszaigazoló levelet küldünk.
          </p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="info@vendeghaz.hu"
            className="input-field mb-3 text-sm"
          />
          {result?.error && (
            <p className="mb-2 text-xs text-red-600">{result.error}</p>
          )}
          <div className="flex gap-2">
            <button
              disabled={isPending || !email.includes("@")}
              onClick={() => {
                setResult(null);
                startTransition(async () => {
                  const r = await submitClaim(placeId, email);
                  setResult(r);
                });
              }}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Igénylés beküldése
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-secondary text-sm"
            >
              Mégse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
