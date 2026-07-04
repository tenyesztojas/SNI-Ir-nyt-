"use client";

import { useFormState, useFormStatus } from "react-dom";
import { KeyRound, CheckCircle } from "lucide-react";
import { changePasswordAction, AuthActionState } from "@/lib/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary mt-2"
    >
      <KeyRound size={16} />
      {pending ? "Mentés..." : "Jelszó megváltoztatása"}
    </button>
  );
}

export default function PasswordChangeForm() {
  const [state, formAction] = useFormState<AuthActionState, FormData>(
    changePasswordAction,
    null
  );

  return (
    <div className="mt-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
      <h2 className="text-lg font-bold text-gray-900">Jelszóváltoztatás</h2>
      <p className="mt-1 text-sm text-gray-500">
        Add meg a jelenlegi jelszavad, majd az újat kétszer.
      </p>

      {state?.info ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle size={16} />
          {state.info}
        </div>
      ) : (
        <form action={formAction} className="mt-4 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Jelenlegi jelszó
            </label>
            <input
              type="password"
              name="currentPassword"
              className="input-field mt-1.5"
              required
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Új jelszó
            </label>
            <input
              type="password"
              name="newPassword"
              className="input-field mt-1.5"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Új jelszó megerősítése
            </label>
            <input
              type="password"
              name="confirmPassword"
              className="input-field mt-1.5"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          <SubmitButton />
        </form>
      )}
    </div>
  );
}
