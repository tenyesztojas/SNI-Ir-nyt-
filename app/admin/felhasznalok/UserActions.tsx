"use client";

import { useState } from "react";
import { Trash2, ShieldCheck, ShieldOff } from "lucide-react";
import { deleteUser, changeUserRole } from "@/lib/actions/users";

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

  async function handleDelete() {
    if (!window.confirm(`Biztosan törlöd a következő felhasználót?

${displayName} (${email})

Ez a művelet nem vonható vissza.`)) return;
    setLoading(true);
    setError("");
    const res = await deleteUser(userId);
    if (res.error) { setError(res.error); setLoading(false); }
  }

  async function handleRoleToggle() {
    const newRole = role === "admin" ? "member" : "admin";
    const label = newRole === "admin" ? "adminná teszed" : "visszaváltod taggá";
    if (!window.confirm(`Biztosan ${label}?

${displayName} (${email})`)) return;
    setLoading(true);
    setError("");
    const res = await changeUserRole(userId, newRole);
    if (res.error) { setError(res.error); setLoading(false); }
  }

  if (isSelf) return <span className="text-xs text-gray-400 italic">te vagy</span>;

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-500">{error}</span>}
      <button
        onClick={handleRoleToggle}
        disabled={loading}
        title={role === "admin" ? "Admin jog elvétele" : "Admin jogkör adása"}
        className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-sni-brand-teal hover:text-sni-brand-teal disabled:opacity-40 transition-colors"
      >
        {role === "admin" ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
      </button>
      <button
        onClick={handleDelete}
        disabled={loading}
        title="Felhasználó törlése"
        className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-red-400 hover:text-red-500 disabled:opacity-40 transition-colors"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
