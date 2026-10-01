"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  updateGuardianChildScheduleAccessAction,
  FamilyActionState,
} from "@/lib/actions/family";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-secondary min-h-[36px] px-3 text-xs"
    >
      {pending ? "Mentés..." : "Mentés"}
    </button>
  );
}

// Egy (guardian, child) pár Napirend-hozzáférésének szerkesztő sora.
// KIZÁRÓLAG a két Napirend-releváns jogosultságot (can_view_schedule /
// can_manage_schedule) jeleníti meg és módosítja — a belső permission
// neveket sosem mutatja a felhasználónak (lásd a feladat 2-3.
// szekcióját). A "Napirend kezelése" <-> "Napirend megtekintése" függő
// viszonyt (manage implikálja a view-t; view kikapcsolása kikapcsolja a
// manage-et is) itt, a mentés ELŐTT, kliensoldali state-ben kényszerítjük
// ki — a szerveroldali action (lib/actions/family.ts
// updateGuardianChildScheduleAccessAction) ugyanezt a szabályt
// FÜGGETLENÜL is kikényszeríti, tehát ez nem az egyetlen védelmi vonal.
export default function GuardianChildScheduleAccessRow({
  guardianUserId,
  childId,
  childFirstName,
  initialCanViewSchedule,
  initialCanManageSchedule,
}: {
  guardianUserId: string;
  childId: string;
  childFirstName: string;
  initialCanViewSchedule: boolean;
  initialCanManageSchedule: boolean;
}) {
  const [canViewSchedule, setCanViewSchedule] = useState(initialCanViewSchedule);
  const [canManageSchedule, setCanManageSchedule] = useState(
    initialCanManageSchedule
  );
  const [state, formAction] = useFormState<FamilyActionState, FormData>(
    updateGuardianChildScheduleAccessAction,
    null
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="guardianUserId" value={guardianUserId} />
      <input type="hidden" name="canViewSchedule" value={String(canViewSchedule)} />
      <input
        type="hidden"
        name="canManageSchedule"
        value={String(canManageSchedule)}
      />

      <span className="text-sm font-medium text-gray-700">{childFirstName}</span>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={canViewSchedule}
            onChange={(event) => {
              const checked = event.target.checked;
              setCanViewSchedule(checked);
              // View kikapcsolása MINDIG kikapcsolja a manage-et is —
              // soha nem maradhat can_manage_schedule=true
              // can_view_schedule=false mellett (lásd a feladat 3.
              // szekcióját).
              if (!checked) {
                setCanManageSchedule(false);
              }
            }}
          />
          Napirend megtekintése
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={canManageSchedule}
            onChange={(event) => {
              const checked = event.target.checked;
              setCanManageSchedule(checked);
              // Manage bekapcsolása MINDIG bekapcsolja a view-t is — a
              // kezelés feltételezi a megtekintést.
              if (checked) {
                setCanViewSchedule(true);
              }
            }}
          />
          Napirend kezelése
        </label>

        <SaveButton />
      </div>

      {state && "error" in state && (
        <p className="w-full text-xs text-red-600 sm:w-auto">{state.error}</p>
      )}
      {state && "success" in state && state.success && (
        <p className="w-full text-xs text-green-700 sm:w-auto">Mentve.</p>
      )}
    </form>
  );
}
