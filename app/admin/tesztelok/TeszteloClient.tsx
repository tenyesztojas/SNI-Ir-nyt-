"use client";

import { useState, useTransition } from "react";
import { searchUserByEmail, setPilotAccess, PILOT_MODULES } from "./actions";

type UserResult = {
  id: string;
  email: string;
  displayName: string;
  pilotAccess: string[];
};

export default function TeszteloClient() {
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<UserResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setNotFound(false);
    setUser(null);
    startTransition(async () => {
      const result = await searchUserByEmail(email);
      if (result) {
        setUser(result);
      } else {
        setNotFound(true);
      }
    });
  }

  function handleToggle(module: string, currentlyEnabled: boolean) {
    if (!user) return;
    startTransition(async () => {
      await setPilotAccess(user.id, module, !currentlyEnabled);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              pilotAccess: !currentlyEnabled
                ? [...prev.pilotAccess, module]
                : prev.pilotAccess.filter((m) => m !== module),
            }
          : null
      );
    });
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Keresés */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="email"
          required
          placeholder="Felhasználó e-mail cime"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-sni-brand-teal"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-sni-brand-navy px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isPending ? "Keresés..." : "Keresés"}
        </button>
      </form>

      {notFound && (
        <p className="text-sm text-red-500">Nem található felhasználó ezzel az e-mail címmel.</p>
      )}

      {/* Találat */}
      {user && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="mb-4 border-b border-gray-50 pb-3">
            <p className="font-bold text-sni-brand-navy">{user.displayName}</p>
            <p className="text-sm text-gray-400">{user.email}</p>
          </div>

          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Pilot modulok hozzáférése
          </p>

          <div className="space-y-3">
            {PILOT_MODULES.map(({ key, label }) => {
              const enabled = user.pilotAccess.includes(key);
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3"
                >
                  <span className="text-sm font-semibold text-gray-700">{label}</span>
                  <button
                    onClick={() => handleToggle(key, enabled)}
                    disabled={isPending}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                      enabled
                        ? "bg-sni-brand-teal text-sni-brand-navy"
                        : "border border-gray-200 text-gray-500 hover:border-sni-brand-teal hover:text-sni-brand-teal"
                    }`}
                  >
                    {enabled ? "Hozzáférés van" : "Nincs hozzáférés"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
