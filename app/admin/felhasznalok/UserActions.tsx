"use client";

import { useState } from "react";
import { Trash2, ShieldCheck, ShieldOff, KeyRound, Check, X } from "lucide-react";
import { deleteUser, changeUserRole, adminResetUserPassword } from "@/lib/actions/users";

type Props = {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  isSelf: boolean;
};

export default function UserActions({ userId, displayName, email, role, isSelf }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Biztosan törlöd a következő felhasználót?\n\n${displayName} (${email})\n\nEz a művelet nem vonható vissza.`)) return;
    setLoading(true);
    setError("");
    const res = await deleteUser(userId);
    if (res.error) { setError(res.error); setLoading(false); }
  }

  async function handleRoleToggle() {
    const newRole = role === "admin" ? "member" : "admin";
    const label = newRole === "admin" ? "adminná teszed" : "visszaváltod taggá";
    if (!window.confirm(`Biztosan ${label}?\n\n${displayName} (${email})`)) return;
    setLoading(true);
    setError("");
    const res = await changeUserRole(userId, newRole);
    if (res.error) { setError(res.error); setLoading(false); }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await adminResetUserPassword(userId, newPassword);
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setPwSuccess(true);
      setNewPassword("");
      setTimeout(() => { setPwSuccess(false); setShowPwForm(false); }, 2000);
    }
  }

  if (isSelf) return <span className="text-xs text-gray-400 italic">te vagy</span>;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-500">{error}</span>}

        {/* Jelszó beállítása */}
        <button
          onClick={() => { setShowPwForm((v) => !v); setError(""); setPwSuccess(false); }}
          disabled={loading}
          title="Jelszó beállítása"
          className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-sni-brand-blue hover:text-sni-brand-blue disabled:opacity-40 transition-colors"
        >
          <KeyRound size={15} />
        </button>

        {/* Szerep váltás */}
        <button
          onClick={handleRoleToggle}
          disabled={loading}
          title={role === "admin" ? "Admin jog elvétele" : "Admin jogkör adása"}
          className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-sni-brand-teal hover:text-sni-brand-teal disabled:opacity-40 transition-colors"
        >
          {role === "admin" ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
        </button>

        {/* Törlés */}
        <button
          onClick={handleDelete}
          disabled={loading}
          title="Felhasználó törlése"
          className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-red-400 hover:text-red-500 disabled:opacity-40 transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Jelszó-reset inline form */}
      {showPwForm && (
        <form onSubmit={handlePasswordReset} className="flex items-center gap-1.5 mt-0.5">
          {pwSuccess ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <Check size={13} /> Jelszó beállítva!
            </span>
          ) : (
            <>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Új jelszó (min. 8 kar.)"
                minLength={8}
                required
                className="w-44 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-sni-brand-blue focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                title="Mentés"
                className="rounded-lg border border-sni-brand-teal p-1 text-sni-brand-teal hover:bg-sni-brand-teal hover:text-white disabled:opacity-40 transition-colors"
              >
                <Check size={13} />
              </button>
              <button
                type="button"
                onClick={() => { setShowPwForm(false); setNewPassword(""); setError(""); }}
                title="Mégsem"
                className="rounded-lg border border-gray-200 p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={13} />
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
