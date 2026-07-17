"use client";

import { useState } from "react";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { adminCreateUser } from "@/lib/actions/users";

export default function AdminCreateUserForm() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await adminCreateUser({ displayName, email, password });
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setDisplayName("");
      setEmail("");
      setPassword("");
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto text-emerald-500" size={36} />
        <p className="mt-3 font-semibold text-emerald-800">Felhasználó sikeresen létrehozva!</p>
        <p className="mt-1 text-sm text-emerald-700">
          A felhasználó azonnal be tud lépni az általad megadott email-cím és jelszó kombinációval.
        </p>
        <button
          onClick={() => setSuccess(false)}
          className="btn-secondary mt-5"
        >
          Még egy felhasználó felvitele
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <div>
        <label className="block text-sm font-medium text-sni-text">
          Megjelenítési név*
        </label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="input-field mt-1.5"
          placeholder="Pl. Kovács Anna"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-sni-text">
          Email-cím*
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-field mt-1.5"
          placeholder="pelda@email.com"
          required
        />
        <p className="mt-1 text-xs text-gray-400">
          Ezzel tud majd bejelentkezni. Email-megerősítést átugorjuk — azonnal aktív a fiók.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-sni-text">
          Ideiglenes jelszó* (min. 8 karakter)
        </label>
        <div className="relative mt-1.5">
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field pr-10"
            placeholder="••••••••"
            required
            minLength={8}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Add meg szóban vagy papíron. A felhasználó a profilján bármikor megváltoztathatja.
        </p>
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-fit">
        {loading ? "Létrehozás..." : "Felhasználó létrehozása"}
      </button>
    </form>
  );
}
