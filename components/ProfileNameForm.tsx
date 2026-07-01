"use client";

import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";
import { updateProfileAction, ProfileActionState } from "@/lib/actions/auth";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary mt-2 w-fit">
      {pending ? "Mentés..." : "Mentés"}
    </button>
  );
}

export default function ProfileNameForm({
  displayName,
  firstName,
  showFirstName,
  newsletterSubscribed,
}: {
  displayName: string;
  firstName: string;
  showFirstName: boolean;
  newsletterSubscribed: boolean;
}) {
  const [state, formAction] = useFormState<ProfileActionState, FormData>(
    updateProfileAction,
    null
  );

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      {/* Álnév */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Álnév (nyilvánosan látható, ha a keresztnevet nem kapcsolod be)
        </label>
        <input
          name="displayName"
          defaultValue={displayName}
          className="input-field mt-1.5"
          minLength={2}
          maxLength={40}
        />
      </div>

      {/* Keresztnév */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Keresztnév (opcionális)
        </label>
        <input
          name="firstName"
          defaultValue={firstName}
          className="input-field mt-1.5"
          maxLength={40}
          placeholder="Pl. Anna"
        />
      </div>

      {/* Keresztnév toggle */}
      <label className="flex cursor-pointer items-center gap-3">
        <div className="relative">
          <input type="checkbox" name="showFirstName" defaultChecked={showFirstName} className="sr-only peer" />
          <div className="h-6 w-11 rounded-full bg-gray-200 transition-colors peer-checked:bg-sni-brand-teal" />
          <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </div>
        <span className="text-sm font-medium text-gray-700">Keresztnevet mutasd az értékeléseken</span>
      </label>

      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-semibold text-gray-700 mb-2">Hírlevél</p>
        <label className="flex cursor-pointer items-center gap-3">
          <div className="relative">
            <input type="checkbox" name="newsletterSubscribed" defaultChecked={newsletterSubscribed} className="sr-only peer" />
            <div className="h-6 w-11 rounded-full bg-gray-200 transition-colors peer-checked:bg-sni-brand-teal" />
            <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
          </div>
          <span className="text-sm font-medium text-gray-700">Feliratkozva a VédettSarok hírlevélre</span>
        </label>
        <p className="mt-1.5 text-xs text-gray-400 pl-14">A kapcsoló kikapcsolásával bármikor leiratkozhatsz.</p>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> Sikeresen mentve!
        </p>
      )}

      <SaveButton />
    </form>
  );
}
