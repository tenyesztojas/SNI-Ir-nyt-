"use client";

import { useState, useEffect, FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { KeyRound, LogIn, RefreshCw } from "lucide-react";

type PageState =
  | "checking"   // session ellenőrzés folyamatban
  | "ready"      // van érvényes recovery session → jelszó megadható
  | "invalid"    // lejárt / hibás link
  | "loading"    // jelszóváltás folyamatban
  | "success";   // jelszóváltás sikeres

export default function UjJelszoPage() {
  const [pageState, setPageState] = useState<PageState>("checking");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // A Supabase browser client automatikusan felismeri a visszaállító linket
    // (PKCE code-csere vagy hash alapú token) az URL-ből.
    // Az onAuthStateChange tüzeli a PASSWORD_RECOVERY eseményt,
    // ha a link érvényes és a csere sikeres volt.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY" && session) {
          setPageState("ready");
        } else if (event === "SIGNED_IN" && session) {
          // Néhány Supabase verzió SIGNED_IN-t küld PASSWORD_RECOVERY helyett
          setPageState("ready");
        }
      }
    );

    // Azonnali ellenőrzés: hátha már van aktív recovery session
    // (pl. oldal-frissítés esetén, ha a session még él)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setPageState("ready");
      }
    });

    // Ha 6 másodpercen belül nem érkezett érvényes session,
    // a link lejárt vagy hibás.
    const timeout = setTimeout(() => {
      setPageState((prev) => (prev === "checking" ? "invalid" : prev));
    }, 6_000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  function validate(): boolean {
    if (!password) {
      setFieldError("Kérjük, add meg az új jelszót.");
      return false;
    }
    if (password.length < 8) {
      setFieldError("A jelszó legyen legalább 8 karakter hosszú.");
      return false;
    }
    if (password !== passwordConfirm) {
      setFieldError("A két jelszó nem egyezik.");
      return false;
    }
    setFieldError(null);
    return true;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    setPageState("loading");
    setSubmitError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setSubmitError(
          "Nem sikerült megváltoztatni a jelszót. Kérjük, kérj új visszaállító linket."
        );
        setPageState("ready");
      } else {
        setPageState("success");
      }
    } catch {
      setSubmitError("Váratlan hiba történt. Kérjük, próbáld újra.");
      setPageState("ready");
    }
  }

  // ─── Ellenőrzés ───────────────────────────────────────────────────────────
  if (pageState === "checking") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6 text-center">
        <p className="text-sm text-gray-500 animate-pulse">Link ellenőrzése…</p>
      </div>
    );
  }

  // ─── Lejárt / hibás link ──────────────────────────────────────────────────
  if (pageState === "invalid") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-extrabold text-gray-900">Új jelszó megadása</h1>

        <div
          className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5"
          role="alert"
        >
          <p className="text-sm font-medium text-red-800">
            A jelszó-visszaállító link lejárt vagy érvénytelen.
          </p>
          <p className="mt-1 text-sm text-red-700">
            Kérjük, kérj új linket.
          </p>
        </div>

        <a
          href="/elfelejtett-jelszo"
          className="btn-primary mt-6 inline-flex items-center gap-2"
        >
          <RefreshCw size={16} />
          Új link kérése
        </a>
      </div>
    );
  }

  // ─── Sikeres jelszóváltás ─────────────────────────────────────────────────
  if (pageState === "success") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-extrabold text-gray-900">Új jelszó megadása</h1>

        <div
          className="mt-6 rounded-xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800"
          role="status"
          aria-live="polite"
        >
          A jelszavad sikeresen megváltozott. Most már beléphetsz az új jelszóval.
        </div>

        <a
          href="/belepes"
          className="btn-primary mt-6 inline-flex items-center gap-2"
        >
          <LogIn size={16} />
          Belépés
        </a>
      </div>
    );
  }

  // ─── Jelszó megadása űrlap (ready | loading) ──────────────────────────────
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-extrabold text-gray-900">Új jelszó megadása</h1>
      <p className="mt-1.5 text-sm text-gray-500">
        Add meg az új jelszavadat. Ezután ezzel tudsz majd belépni.
      </p>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-soft">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Új jelszó
            </label>
            <input
              id="password"
              type="password"
              name="password"
              autoComplete="new-password"
              className="input-field mt-1.5"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldError(null);
              }}
              required
              minLength={8}
              disabled={pageState === "loading"}
              aria-required="true"
              aria-describedby={fieldError ? "pw-error" : undefined}
            />
          </div>

          <div>
            <label
              htmlFor="passwordConfirm"
              className="block text-sm font-medium text-gray-700"
            >
              Új jelszó még egyszer
            </label>
            <input
              id="passwordConfirm"
              type="password"
              name="passwordConfirm"
              autoComplete="new-password"
              className="input-field mt-1.5"
              value={passwordConfirm}
              onChange={(e) => {
                setPasswordConfirm(e.target.value);
                setFieldError(null);
              }}
              required
              minLength={8}
              disabled={pageState === "loading"}
              aria-required="true"
            />
          </div>

          {fieldError && (
            <p id="pw-error" className="text-sm text-red-600" role="alert">
              {fieldError}
            </p>
          )}

          {submitError && (
            <p className="text-sm text-red-600" role="alert">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={pageState === "loading"}
            className="btn-primary mt-1 flex items-center justify-center gap-2"
          >
            <KeyRound size={16} />
            {pageState === "loading" ? "Mentés folyamatban…" : "Jelszó módosítása"}
          </button>
        </form>
      </div>
    </div>
  );
}
