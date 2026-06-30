"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { LogIn } from "lucide-react";
import { signInAction, signUpAction, AuthActionState } from "@/lib/actions/auth";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary mt-2">
      <LogIn size={18} /> {pending ? "Folyamatban..." : label}
    </button>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<"belepes" | "regisztracio">("belepes");
  const [signInState, signInFormAction] = useFormState<AuthActionState, FormData>(signInAction, null);
  const [signUpState, signUpFormAction] = useFormState<AuthActionState, FormData>(signUpAction, null);

  const state = mode === "belepes" ? signInState : signUpState;

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="mb-6 inline-flex rounded-xl2 border border-gray-300 bg-white p-1 shadow-soft">
        <button
          onClick={() => setMode("belepes")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
            mode === "belepes"
              ? "bg-gradient-to-br from-sni-brand-teal to-sni-brand-navy text-white shadow-soft"
              : "text-sni-text hover:bg-sni-brand-teal/10"
          }`}
        >
          Belépés
        </button>
        <button
          onClick={() => setMode("regisztracio")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
            mode === "regisztracio"
              ? "bg-gradient-to-br from-sni-brand-teal to-sni-brand-navy text-white shadow-soft"
              : "text-sni-text hover:bg-sni-brand-teal/10"
          }`}
        >
          Regisztráció
        </button>
      </div>

      <h1 className="text-2xl font-bold text-sni-text">
        {mode === "belepes" ? "Belépés" : "Regisztráció"}
      </h1>

      {state?.info ? (
        <p className="mt-4 rounded-xl2 bg-sni-green/40 px-4 py-3 text-sni-text">{state.info}</p>
      ) : mode === "belepes" ? (
        <form action={signInFormAction} className="mt-5 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-sni-text">Email</label>
            <input type="email" name="email" className="input-field mt-1.5" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-sni-text">Jelszó</label>
            <input type="password" name="password" className="input-field mt-1.5" required minLength={6} />
          </div>
          {state?.error && <p className="text-sm text-sni-warn">{state.error}</p>}
          <SubmitButton label="Belépés" />
        </form>
      ) : (
        <form action={signUpFormAction} className="mt-5 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-sni-text">Becenév</label>
            <input name="displayName" className="input-field mt-1.5" placeholder="Pl. Anna" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-sni-text">Email</label>
            <input type="email" name="email" className="input-field mt-1.5" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-sni-text">Jelszó</label>
            <input type="password" name="password" className="input-field mt-1.5" required minLength={6} />
          </div>
          {state?.error && <p className="text-sm text-sni-warn">{state.error}</p>}
          <SubmitButton label="Regisztráció" />
        </form>
      )}
    </div>
  );
}
