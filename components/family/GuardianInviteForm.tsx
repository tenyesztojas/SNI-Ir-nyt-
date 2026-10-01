"use client";

import { useFormState, useFormStatus } from "react-dom";
import { inviteGuardianAction, FamilyActionState } from "@/lib/actions/family";

function InviteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-secondary mt-3 w-fit min-h-[44px]"
    >
      {pending ? "Meghívás küldése..." : "Gondviselő meghívása"}
    </button>
  );
}

export default function GuardianInviteForm({ familyId }: { familyId: string }) {
  const [state, formAction] = useFormState<FamilyActionState, FormData>(
    inviteGuardianAction,
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
          Gondviselő e-mail-címe *
        </label>
        <input
          name="email"
          type="email"
          required
          maxLength={200}
          className="input-field mt-1.5"
          placeholder="pl. nagyszulo@example.com"
        />
      </div>
      {state && "error" in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state && "success" in state && state.success && (
        <p className="text-sm text-green-700">Meghívás elküldve.</p>
      )}
      <InviteButton />
    </form>
  );
}
