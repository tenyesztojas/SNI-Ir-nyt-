"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import {
  acceptChildAccountInvitationAction,
  FamilyActionState,
} from "@/lib/actions/family";

function AcceptButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="btn-primary min-h-[44px] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Elfogadás..." : "Elfogadás"}
    </button>
  );
}

// MEGHÍVOTT (token-birtokló), BEJELENTKEZETT oldali elfogadás-form —
// a child neve és a teljes tájékoztató szöveg a szülő
// (app/gyermek-meghivo/page.tsx) Server Component-ben jelenik meg,
// EZ a komponens KIZÁRÓLAG a kötelező visszaigazoló checkboxot és az
// "Elfogadás" gombot rendereli, a feladat 4. szekciója szerint: a
// gomb addig nem használható, amíg a checkbox nincs bejelölve.
//
// FONTOS, DOKUMENTÁLT KORLÁTOZÁS: ez a checkbox KIZÁRÓLAG a fent
// megjelenő tájékoztató szöveg elolvasásának/megértésének
// visszaigazolása — NEM GDPR-adatkezelési hozzájárulás, NEM
// helyettesíti a szülői/gondviselői jogi felhatalmazás kérdését
// (lásd a feladat 13. szekcióját). Ezért a szövege SOSEM
// "hozzájárulok"/"hozzájárulás", és a kód/komment sem állítja, hogy
// ez jogi hozzájárulást létesítene.
export default function AcceptChildAccountInvitationForm({
  token,
}: {
  token: string;
}) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, formAction] = useFormState<FamilyActionState, FormData>(
    acceptChildAccountInvitationAction,
    null
  );

  useEffect(() => {
    if (state && "success" in state && state.success) {
      router.push("/csalad");
    }
  }, [state, router]);

  return (
    <form action={formAction} className="mt-6 text-left">
      <input type="hidden" name="token" value={token} />

      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        <span>
          Elolvastam és megértettem a Gyermekfiók működéséről szóló
          tájékoztatást.
        </span>
      </label>

      <div className="mt-4">
        <AcceptButton disabled={!acknowledged} />
      </div>

      {state && "error" in state && (
        <p className="mt-3 text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
