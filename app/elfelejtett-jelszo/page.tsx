"use client";

import { useState, FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, ArrowLeft, Send } from "lucide-react";

export default function ElfelejtettJelszoPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus("loading");

    try {
      const supabase = createClient();
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== "undefined" ? window.location.origin : "");

      // A hibát szándékosan nem árulják el (nem létező email esetén is
      // ugyanaz a semleges üzenet jelenik meg – biztonsági elvárás).
      await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${siteUrl}/uj-jelszo`,
      });

      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <a
        href="/belepes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-sni-brand-teal transition-colors focus:outline-none focus:ring-2 focus:ring-sni-brand-teal rounded"
        aria-label="Vissza a belépési oldalra"
      >
        <ArrowLeft size={15} />
        Vissza a belépéshez
      </a>

      <h1 className="text-2xl font-extrabold text-gray-900">Elfelejtett jelszó</h1>
      <p className="mt-1.5 text-sm text-gray-500">
        Add meg azt az e-mail-címet, amellyel regisztráltál. Küldünk egy linket,
        ahol új jelszót adhatsz meg.
      </p>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-soft">
        {status === "sent" ? (
          <div
            className="rounded-xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800"
            role="status"
            aria-live="polite"
          >
            Ha ehhez az e-mail-címhez tartozik fiók, elküldtük a jelszó-visszaállító
            linket. Kérjük, nézd meg a postafiókodat (és a spam mappát is).
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                E-mail-cím
              </label>
              <input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="pelda@email.hu"
                className="input-field mt-1.5"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={status === "loading"}
                aria-required="true"
              />
            </div>

            {status === "error" && (
              <p className="text-sm text-red-600" role="alert">
                Most nem sikerült elküldeni a jelszó-visszaállító linket. Kérjük,
                próbáld újra később.
              </p>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="btn-primary mt-1 flex items-center justify-center gap-2"
            >
              <Send size={16} />
              {status === "loading" ? "Küldés folyamatban…" : "Jelszó-visszaállító link küldése"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
