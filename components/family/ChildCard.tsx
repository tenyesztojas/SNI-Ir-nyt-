"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateChildAction, FamilyActionState } from "@/lib/actions/family";
import type { FamilyChildView } from "@/lib/family/data";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary min-h-[44px] text-sm"
    >
      {pending ? "Mentés..." : "Mentés"}
    </button>
  );
}

export default function ChildCard({
  child,
  canEdit,
}: {
  child: FamilyChildView;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useFormState<FamilyActionState, FormData>(
    updateChildAction,
    null
  );

  useEffect(() => {
    if (state && "success" in state && state.success) {
      setEditing(false);
    }
  }, [state]);

  if (editing) {
    return (
      <form action={formAction} className="rounded-xl border border-gray-200 p-3">
        <input type="hidden" name="childId" value={child.id} />
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Keresztnév *
          </label>
          <input
            name="firstName"
            required
            maxLength={60}
            defaultValue={child.firstName}
            className="input-field mt-1"
          />
        </div>
        <div className="mt-2">
          <label className="block text-xs font-medium text-gray-700">
            Születési év
          </label>
          <input
            name="birthYear"
            type="number"
            inputMode="numeric"
            min={1900}
            max={new Date().getFullYear()}
            defaultValue={child.birthYear ?? ""}
            className="input-field mt-1"
          />
        </div>
        {state && "error" in state && (
          <p className="mt-2 text-sm text-red-600">{state.error}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <SaveButton />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="btn-secondary min-h-[44px] text-sm"
          >
            Mégse
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
      <div>
        <p className="font-medium text-gray-900">{child.firstName}</p>
        {child.birthYear ? (
          <p className="text-sm text-gray-500">{child.birthYear}</p>
        ) : null}
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn-secondary min-h-[44px] text-sm"
        >
          Szerkesztés
        </button>
      )}
    </div>
  );
}
