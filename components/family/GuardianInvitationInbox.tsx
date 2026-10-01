"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  acceptGuardianInvitationAction,
  declineGuardianInvitationAction,
  FamilyActionState,
} from "@/lib/actions/family";
import type { RecipientGuardianInvitationView } from "@/lib/family/data";

function AcceptButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary min-h-[44px]">
      {pending ? "Elfogadás..." : "Elfogadás"}
    </button>
  );
}

function DeclineButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-secondary min-h-[44px]">
      {pending ? "Elutasítás..." : "Elutasítás"}
    </button>
  );
}

// Egy darab, recipiens-oldali függő meghívás sora. Elfogadás/elutasítás
// KIZÁRÓLAG a MEGLÉVŐ accept_family_guardian_invitation /
// decline_family_guardian_invitation RPC-ket hívja (lásd
// lib/actions/family.ts) — nincs új meghívás-infrastruktúra. Sikeres
// válasz után a hívó oldali revalidatePath("/csalad") miatt a teljes
// /csalad oldal újratöltődik: a meghívás eltűnik a listából, elfogadás
// esetén a user mostantól aktív family_members sorral rendelkezik (lásd
// app/csalad/page.tsx hozzáférés-logikáját).
function GuardianInvitationRow({
  invitation,
}: {
  invitation: RecipientGuardianInvitationView;
}) {
  const [acceptState, acceptAction] = useFormState<FamilyActionState, FormData>(
    acceptGuardianInvitationAction,
    null
  );
  const [declineState, declineAction] = useFormState<FamilyActionState, FormData>(
    declineGuardianInvitationAction,
    null
  );

  const familyLabel = invitation.familyName?.trim()
    ? invitation.familyName
    : "Elnevezés nélküli család";

  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
      <h3 className="text-lg font-bold text-gray-900">Családi meghívás</h3>
      <p className="mt-2 text-gray-700">
        Meghívták Önt a(z) {familyLabel} családhoz gondviselőként.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <form action={acceptAction}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <AcceptButton />
        </form>
        <form action={declineAction}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <DeclineButton />
        </form>
      </div>

      {acceptState && "error" in acceptState && (
        <p className="mt-2 text-sm text-red-600">{acceptState.error}</p>
      )}
      {declineState && "error" in declineState && (
        <p className="mt-2 text-sm text-red-600">{declineState.error}</p>
      )}
    </li>
  );
}

export default function GuardianInvitationInbox({
  invitations,
}: {
  invitations: RecipientGuardianInvitationView[];
}) {
  if (invitations.length === 0) return null;

  return (
    <ul className="mt-6 flex flex-col gap-4">
      {invitations.map((invitation) => (
        <GuardianInvitationRow key={invitation.id} invitation={invitation} />
      ))}
    </ul>
  );
}
