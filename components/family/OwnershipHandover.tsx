"use client";

// Tulajdonjog átadása — gondviselő kiválasztása és megerősítő párbeszéd.
// A megjelenítés csak kényelmi szűrés (owner + van aktív gondviselő); a
// jogosultságot a szerveroldali RPC ellenőrzi (lib/actions/family.ts).

import { useEffect, useId, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { handOverFamilyOwnershipAction, type FamilyActionState } from "@/lib/actions/family";

type Candidate = { userId: string; displayName: string };

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="min-h-[44px] rounded-xl bg-sni-brand-blue px-4 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-blue focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Átadás..." : "Igen, átadom"}
    </button>
  );
}

export default function OwnershipHandover({ familyId, candidates }: { familyId: string; candidates: Candidate[] }) {
  const [state, formAction] = useFormState<FamilyActionState, FormData>(handOverFamilyOwnershipAction, null);
  const [selected, setSelected] = useState("");
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const selectId = useId();
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (candidates.length === 0) return null;
  const chosen = candidates.find((c) => c.userId === selected) ?? null;
  const error = hint ?? (state && "error" in state ? state.error : null);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div className="rounded-xl border border-gray-100 p-4">
      <h4 className="text-sm font-semibold text-gray-700">Tulajdonjog átadása</h4>
      <label htmlFor={selectId} className="mt-2 block text-sm text-gray-700">
        Új tulajdonos (aktív gondviselő)
      </label>
      <select
        id={selectId}
        value={selected}
        disabled={open}
        onChange={(e) => {
          setSelected(e.target.value);
          setHint(null);
        }}
        className="input-field mt-1 min-h-[44px] w-full"
      >
        <option value="">Válassz gondviselőt…</option>
        {candidates.map((c) => (
          <option key={c.userId} value={c.userId}>
            {c.displayName}
          </option>
        ))}
      </select>

      {!open && (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            if (!chosen) {
              setHint("Válaszd ki, kinek adod át a tulajdonjogot.");
              return;
            }
            setOpen(true);
          }}
          className="btn-secondary mt-3 min-h-[44px] w-full text-sm sm:w-auto"
        >
          Tulajdonjog átadása
        </button>
      )}

      {open && chosen && (
        <div
          role="alertdialog"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
        >
          <p id={titleId} className="font-semibold text-gray-900">
            Biztosan átadod a tulajdonjogot {chosen.displayName} részére?
          </p>
          <div id={descId} className="mt-1 text-gray-700">
            <ul className="list-disc pl-5">
              <li>{chosen.displayName} lesz a család tulajdonosa, minden tulajdonosi joggal.</li>
              <li>Te aktív gondviselő maradsz, de elveszíted a tulajdonosi jogokat (tagkezelés, gyermekek és napirend kezelése).</li>
              <li>A gyermekek adatait csak akkor látod, ha az új tulajdonos jogot ad hozzá.</li>
              <li>Ezután ki is léphetsz a családból. Visszakapni a tulajdonjogot csak az új tulajdonostól lehet.</li>
              <li>A gyermekprofilok, gyermekfiókok, napirendek, utazási előzmények és az előfizetés változatlanok maradnak.</li>
            </ul>
          </div>
          <form action={formAction} className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <input type="hidden" name="familyId" value={familyId} />
            <input type="hidden" name="newOwnerUserId" value={chosen.userId} />
            <button ref={cancelRef} type="button" onClick={close} className="btn-secondary min-h-[44px] text-sm">
              Mégse
            </button>
            <ConfirmButton />
          </form>
        </div>
      )}

      <div aria-live="polite">
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
