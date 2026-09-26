"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addChildAction, FamilyActionState } from "@/lib/actions/family";

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-secondary mt-3 w-fit min-h-[44px]"
    >
      {pending ? "Hozzáadás..." : "Gyermek hozzáadása"}
    </button>
  );
}

export default function AddChildForm({ familyId }: { familyId: string }) {
  const [state, formAction] = useFormState<FamilyActionState, FormData>(
    addChildAction,
    null
  );

  return (
    <form
      action={formAction}
      className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4"
    >
      <input type="hidden" name="familyId" value={familyId} />
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Keresztnév *
        </label>
        <input
          name="firstName"
          required
          maxLength={60}
          className="input-field mt-1.5"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Születési év (opcionális)
        </label>
        <input
          name="birthYear"
          type="number"
          inputMode="numeric"
          min={1900}
          max={new Date().getFullYear()}
          className="input-field mt-1.5"
        />
      </div>
      {state && "error" in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <AddButton />
    </form>
  );
}
