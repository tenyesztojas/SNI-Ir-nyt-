"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { LogIn, Mail, ChevronDown } from "lucide-react";
import { signInAction, signUpAction, AuthActionState } from "@/lib/actions/auth";
import GitHubLoginButton from "@/components/auth/GitHubLoginButton";
import GoogleLoginButton from "@/components/auth/GoogleLoginButton";


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
  const [showEmail, setShowEmail] = useState(false);
  const [signInState, signInFormAction] = useFormState<AuthActionState, FormData>(signInAction, null);
  const [signUpState, signUpFormAction] = useFormState<AuthActionState, FormData>(signUpAction, null);

  const state = mode === "belepes" ? signInState : signUpState;

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-extrabold text-gray-900">Üdv a VédettSaroknál</h1>
      <p className="mt-1.5 text-sm text-gray-500">
        Belépéshez közösségi fiókot ajánlunk — nem tároljuk a valódi nevedet.
      </p>

      {/* Social OAuth gombok */}
      <div className="mt-6 flex flex-col gap-3">
        <GitHubLoginButton />
        <GoogleLoginButton />
      </div>

      <div className="mt-5 flex items-center gap-3 text-xs text-gray-400">
        <div className="h-px flex-1 bg-gray-200" />
        vagy
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {/* E-mailes belépés – kinyitható panel */}
      <div className="mt-4">
        <button
          onClick={() => setShowEmail((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-soft hover:border-sni-brand-teal/40"
        >
          <span className="flex items-center gap-2">
            <Mail size={17} className="text-gray-400" />
            Belépés e-maillel
          </span>
          <ChevronDown
            size={17}
            className={`text-gray-400 transition-transform duration-200 ${showEmail ? "rotate-180" : ""}`}
          />
        </button>

        {showEmail && (
          <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-soft">
            <div className="mb-4 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
              <button
                onClick={() => setMode("belepes")}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
                  mode === "belepes" ? "bg-white shadow-sm text-sni-brand-navy" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Belépés
              </button>
              <button
                onClick={() => setMode("regisztracio")}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
                  mode === "regisztracio" ? "bg-white shadow-sm text-sni-brand-navy" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Regisztráció
              </button>
            </div>

            {state?.info ? (
              <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{state.info}</p>
            ) : mode === "belepes" ? (
              <form action={signInFormAction} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input type="email" name="email" className="input-field mt-1.5" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Jelszó</label>
                  <input type="password" name="password" className="input-field mt-1.5" required minLength={6} />
                </div>
                {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
                <SubmitButton label="Belépés" />
              </form>
            ) : (
              <form action={signUpFormAction} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Becenév</label>
                  <input name="displayName" className="input-field mt-1.5" placeholder="Pl. Anna" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input type="email" name="email" className="input-field mt-1.5" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Jelszó</label>
                  <input type="password" name="password" className="input-field mt-1.5" required minLength={6} />
                </div>

                {/* Hírlevél opt-out */}
                <div className="rounded-xl bg-blue-50 px-4 py-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="noNewsletter"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-sni-brand-teal"
                    />
                    <span className="text-sm text-gray-700">
                      Nem kérek hírlevelet
                    </span>
                  </label>
                  <p className="mt-1.5 text-xs text-gray-500 pl-7">
                    Alapértelmezésként feliratkozol a VédettSarok hírlevélre.
                    A hírlevélről bármikor leiratkozhatsz a profilodban.
                  </p>
                </div>

                {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
                <SubmitButton label="Regisztráció" />
              </form>
            )}
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        Közösségi belépéskor nem tároljuk a valódi nevedet, e-mail-címedet
        vagy profilképedet. Véletlenszerű álnevet kapsz. A hírlevélről bármikor leiratkozhatsz.
      </p>
    </div>
  );
}
