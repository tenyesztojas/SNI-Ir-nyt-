"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  revokeGuardianInvitationAction,
  FamilyActionState,
} from "@/lib/actions/family";

function RevokeButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-secondary min-h-[44px] text-sm"
    >
      {pending ? "Visszavonás..." : "Visszavonás"}
    </button>
  );
}

export default function RevokeGuardianInvitationButton({
  invitationId,
}: {
  invitationId: string;
}) {
  const [state, formAction] = useFormState<FamilyActionState, FormData>(
    revokeGuardianInvitationAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="invitationId" value={invitationId} />
      <RevokeButton />
      {state && "error" in state && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}
