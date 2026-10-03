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
// Kliensoldali, LOKÁLIS QR-generálás (nincs harmadik fél QR-API hívás,
// nincs hálózati kérés) — a QRCodeSVG a value propból tisztán a
// böngészőben rendereli az SVG-t. Lásd a feladat "Do NOT use an
// external QR-generation web service" követelményét.
import { QRCodeSVG } from "qrcode.react";

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
  // Kizárólag UI-visszajelzés a "Meghívólink másolása" gombhoz — SOSE
  // ismétli meg a vágólapra másolt tartalmat, SOSE naplózza a
  // tokent/URL-t.
  const [linkCopied, setLinkCopied] = useState(false);
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

  // mailto: link — KIZÁRÓLAG a kliens oldalon, kézi URL-encoding-gal
  // összeállítva, nincs szerveroldali e-mail-küldés, nincs tárolt
  // gyermek-email (a child_account_invitations táblában sincs ilyen
  // mező, lásd a komponens fejléc-kommentjét). A felhasználó saját
  // levelezőklienst nyitja meg, és Ő választja ki a címzettet.
  const mailtoSubject = encodeURIComponent("VédettSarok – Gyermekfiók meghívás");
  const mailtoBody = inviteLink
    ? encodeURIComponent(
        `Meghívást kaptál ${childFirstName} VédettSarok Gyermekfiókjának használatához.\n\n` +
          `A meghívó megnyitásához használd ezt a linket:\n\n${inviteLink}\n\n` +
          `A meghívás egyszer használható és 72 óráig érvényes.`
      )
    : "";
  const mailtoHref = `mailto:?subject=${mailtoSubject}&body=${mailtoBody}`;

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
          <p className="text-sm font-medium text-gray-900">
            Meghívás elkészült
          </p>
          <p className="mt-1 text-sm text-gray-700">
            Add át {childFirstName} számára a meghívót az alábbi
            lehetőségek egyikével.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                // Clipboard API — KIZÁRÓLAG explicit kattintásra, és
                // KIZÁRÓLAG a már létező meghívó-URL-t másolja, nem
                // generál újat (lásd createChildAccountInvitationAction —
                // ez a gomb nem hívja azt újra).
                navigator.clipboard
                  .writeText(inviteLink)
                  .then(() => {
                    setLinkCopied(true);
                    window.setTimeout(() => setLinkCopied(false), 2000);
                  })
                  .catch(() => {
                    // Clipboard API nem elérhető (pl. engedély hiánya) —
                    // a lenti "Link megjelenítése szövegként" mezőből a
                    // felhasználó kézzel is kimásolhatja.
                  });
              }}
              className="btn-secondary min-h-[40px] text-sm"
            >
              {linkCopied ? "Link másolva" : "Meghívólink másolása"}
            </button>
            <a href={mailtoHref} className="btn-secondary inline-flex min-h-[40px] items-center text-sm">
              Meghívó küldése e-mailben
            </a>
          </div>

          <div className="mt-4">
            <p className="text-xs text-gray-500">vagy</p>
            <div className="mt-2 inline-block rounded-lg border border-gray-200 bg-white p-2">
              <QRCodeSVG value={inviteLink} size={160} marginSize={2} />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Olvasd be a QR-kódot a meghívott telefonjával.
            </p>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            A meghívás egyszer használható és 72 óráig érvényes.
          </p>

          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-gray-500 underline">
              Link megjelenítése szövegként
            </summary>
            <input
              type="text"
              readOnly
              value={inviteLink}
              onFocus={(event) => event.target.select()}
              className="input-field mt-2 text-xs"
            />
          </details>
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
