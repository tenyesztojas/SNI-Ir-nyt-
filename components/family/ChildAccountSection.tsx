"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createChildAccountInvitationAction,
  revokeChildAccountInvitationAction,
  revokeChildAccountAction,
  FamilyActionState,
} from "@/lib/actions/family";
import type { ChildAccountStatusView } from "@/lib/family/data";

// Owner-only "Gyermekfiók" szekció — egy adott gyermekhez tartozó
// child_accounts/child_account_invitations állapot megjelenítése és
// kezelése (lásd a feladat 2. szekcióját). KIZÁRÓLAG a meglévő
// create_child_account_invitation / revoke_child_account_invitation /
// revoke_child_account RPC-ket hívja (lib/actions/family.ts) — nincs
// új account-linkelési infrastruktúra.
//
// FONTOS, DOKUMENTÁLT ELTÉRÉS a feladat szövegétől: a
// child_account_invitations tábla NEM tartalmaz e-mail-cím mezőt — a
// meghívó egy egyszer-használatos, hash-elt TOKEN (lásd
// supabase/migrations/20260927_child_account_foundation.sql), nem egy
// konkrét e-mail-címhez szóló meghívás. Ezért itt NEM "e-mail-cím
// megadása" történik, hanem a create_child_account_invitation RPC
// válaszában EGYETLEN EGYSZER megjelenő plaintext tokenből a kliens
// összeállít egy linket, amit az ownernek KI KELL MÁSOLNIA és
// out-of-band (pl. személyesen, üzenetben) kell továbbadnia a
// gyermeknek — ugyanúgy, mint egy egyszer-használatos meghívó-link
// bármely más rendszerben. A "Meghívás elküldve: email@cím" szöveg
// ezért nem jeleníthető meg (nincs eltárolt e-mail), csak "Meghívás
// elküldve".
function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary min-h-[40px] text-sm"
    >
      {pending ? "Létrehozás..." : "Gyermekfiók létrehozása"}
    </button>
  );
}

function RevokeInvitationButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-secondary min-h-[40px] text-sm"
    >
      {pending ? "Visszavonás..." : "Meghívás visszavonása"}
    </button>
  );
}

function DisconnectButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-secondary min-h-[40px] text-sm"
    >
      {pending ? "Leválasztás..." : "Gyermekfiók leválasztása"}
    </button>
  );
}

export default function ChildAccountSection({
  childId,
  childFirstName,
  accountStatus,
}: {
  childId: string;
  childFirstName: string;
  accountStatus: ChildAccountStatusView;
}) {
  const [createState, createAction] = useFormState<FamilyActionState, FormData>(
    createChildAccountInvitationAction,
    null
  );
  const [revokeInvitationState, revokeInvitationAction] = useFormState<
    FamilyActionState,
    FormData
  >(revokeChildAccountInvitationAction, null);
  const [disconnectState, disconnectAction] = useFormState<
    FamilyActionState,
    FormData
  >(revokeChildAccountAction, null);

  // A plaintext token KIZÁRÓLAG a sikeres createAction válaszában
  // jelenik meg, EGYETLEN EGYSZER (lásd createChildAccountInvitationAction)
  // — ezt a renderelt linket a felhasználónak most kell kimásolnia,
  // újratöltés/revalidálás után már csak a "pending_invitation" állapot
  // látszik, a token NEM kérhető le újra.
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  useEffect(() => {
    if (
      createState &&
      "success" in createState &&
      createState.success &&
      createState.childAccountInvitationToken
    ) {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      setInviteLink(
        `${origin}/gyermek-meghivo?token=${createState.childAccountInvitationToken}`
      );
    }
  }, [createState]);

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3">
      <h4 className="text-sm font-semibold text-gray-700">Gyermekfiók</h4>

      {accountStatus.kind === "none" && !inviteLink && (
        <div className="mt-2">
          <p className="text-sm text-gray-500">
            {childFirstName} még nem rendelkezik saját gyermekfiókkal.
          </p>
          <form action={createAction} className="mt-2">
            <input type="hidden" name="childId" value={childId} />
            <CreateButton />
          </form>
          {createState && "error" in createState && (
            <p className="mt-2 text-sm text-red-600">{createState.error}</p>
          )}
        </div>
      )}

      {inviteLink && (
        <div className="mt-2">
          <p className="text-sm text-gray-700">
            Meghívás elküldve. Másold ki és add tovább {childFirstName}
            -nak ezt a linket (csak most jelenik meg, később nem lesz
            újra elérhető):
          </p>
          <input
            type="text"
            readOnly
            value={inviteLink}
            onFocus={(event) => event.target.select()}
            className="input-field mt-2 text-xs"
          />
        </div>
      )}

      {accountStatus.kind === "pending_invitation" && !inviteLink && (
        <div className="mt-2">
          <p className="text-sm text-gray-700">Meghívás elküldve.</p>
          <form action={revokeInvitationAction} className="mt-2">
            <input
              type="hidden"
              name="invitationId"
              value={accountStatus.invitationId}
            />
            <RevokeInvitationButton />
          </form>
          {revokeInvitationState && "error" in revokeInvitationState && (
            <p className="mt-2 text-sm text-red-600">
              {revokeInvitationState.error}
            </p>
          )}
        </div>
      )}

      {accountStatus.kind === "active" && (
        <div className="mt-2">
          <p className="text-sm text-gray-700">
            Gyermekfiók aktív — {childFirstName} fiókja csatlakoztatva.
          </p>
          <form action={disconnectAction} className="mt-2">
            <input type="hidden" name="childId" value={childId} />
            <DisconnectButton />
          </form>
          <p className="mt-1 text-xs text-gray-500">
            A leválasztás végleges, nem vonható vissza.
          </p>
          {disconnectState && "error" in disconnectState && (
            <p className="mt-2 text-sm text-red-600">{disconnectState.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
