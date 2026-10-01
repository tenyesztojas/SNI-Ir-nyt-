"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  deleteChildScheduleItemAction,
  FamilyActionState,
} from "@/lib/actions/family";

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        // Explicit megerősítés törlés előtt (lásd a feladat kérését) —
        // natív window.confirm, nincs külön modal-komponens ehhez a
        // v1-hez.
        if (!window.confirm("Biztosan törlöd ezt a napirendi elemet?")) {
          e.preventDefault();
        }
      }}
      className="btn-secondary min-h-[44px] text-sm text-red-600"
    >
      {pending ? "Törlés..." : "Törlés"}
    </button>
  );
}

export default function DeleteScheduleItemButton({
  itemId,
}: {
  itemId: string;
}) {
  const [state, formAction] = useFormState<FamilyActionState, FormData>(
    deleteChildScheduleItemAction,
    null
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <DeleteButton />
      {state && "error" in state && (
        <p className="mt-1 text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}
