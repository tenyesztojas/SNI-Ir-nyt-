"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createFamilyAction, FamilyActionState } from "@/lib/actions/family";

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary mt-4 w-fit">
      {pending ? "Létrehozás..." : "Család létrehozása"}
    </button>
  );
}

export default function FamilyOnboarding() {
  const [state, formAction] = useFormState<FamilyActionState, FormData>(
    createFamilyAction,
    null
  );

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Családnév (opcionális)
        </label>
        <input
          name="name"
          maxLength={80}
          className="input-field mt-1.5"
          placeholder="pl. Kovács család"
        />
      </div>
      {state && "error" in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <CreateButton />
    </form>
  );
}
