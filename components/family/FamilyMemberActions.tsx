"use client";

// Családtag eltávolítása (owner) és önkéntes kilépés (gondviselő) —
// megerősítő párbeszéddel. A gomb megjelenítése csak kényelmi szűrés; a
// jogosultságot a szerveroldali RPC ellenőrzi (lásd lib/actions/family.ts).

import { useEffect, useId, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  leaveFamilyAction,
  removeFamilyMemberAction,
  type FamilyActionState,
} from "@/lib/actions/family";

type Props =
  | { mode: "remove"; familyId: string; memberUserId: string; memberName: string }
  | { mode: "leave"; familyId: string; familyName: string };

function ConfirmButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="min-h-[44px] rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export default function FamilyMemberActions(props: Props) {
  const [state, formAction] = useFormState<FamilyActionState, FormData>(
    props.mode === "remove" ? removeFamilyMemberAction : leaveFamilyAction,
    null
  );
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    // a fókusz visszakerül az indító gombra
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const isRemove = props.mode === "remove";
  const triggerLabel = isRemove ? "Eltávolítás" : "Kilépés a családból";
  const title = isRemove
    ? `Biztosan eltávolítod ${props.memberName} családtagot?`
    : "Biztosan kilépsz a családból?";
  const description = isRemove
    ? "A családtag nem fogja látni a család adatait, és minden gyermekre vonatkozó jogosultsága megszűnik. A gyermekprofilok, a napirend és az utazási előzmények megmaradnak. Később újra meghívhatod."
    : `Kilépés után nem látod tovább a(z) ${props.familyName} család adatait, és a gyermekekre vonatkozó jogosultságaid megszűnnek. Visszalépni csak új meghívóval lehet.`;
  const error = state && "error" in state ? state.error : null;

  return (
    <div className={isRemove ? "flex flex-col items-end" : "flex flex-col"}>
      {!open && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="btn-secondary min-h-[44px] text-sm text-red-600"
        >
          {isRemove ? (
            <>
              {triggerLabel}
              <span className="sr-only">: {props.memberName}</span>
            </>
          ) : (
            triggerLabel
          )}
        </button>
      )}

      {open && (
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
          className="mt-2 w-full rounded-xl border border-red-100 bg-red-50 p-4 text-left text-sm"
        >
          <p id={titleId} className="font-semibold text-gray-900">
            {title}
          </p>
          <p id={descId} className="mt-1 text-gray-700">
            {description}
          </p>
          <form action={formAction} className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <input type="hidden" name="familyId" value={props.familyId} />
            {isRemove && <input type="hidden" name="userId" value={props.memberUserId} />}
            <button ref={cancelRef} type="button" onClick={close} className="btn-secondary min-h-[44px] text-sm">
              Mégse
            </button>
            <ConfirmButton
              label={isRemove ? "Igen, eltávolítom" : "Igen, kilépek"}
              pendingLabel={isRemove ? "Eltávolítás..." : "Kilépés..."}
            />
          </form>
        </div>
      )}

      <div aria-live="polite" className="w-full">
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
