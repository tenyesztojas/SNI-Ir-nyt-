"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Trash2, CheckCircle, Clock, XCircle } from "lucide-react";
import { Place, Category } from "@/lib/types";
import { adminDeletePlace } from "@/lib/actions/places";

const statusLabel: Record<string, string> = {
  approved: "Jóváhagyva",
  pending: "Függőben",
  rejected: "Elutasítva",
  archived: "Archivált",
};

const StatusIcon = ({ status }: { status: string }) => {
  if (status === "approved") return <CheckCircle size={14} className="text-emerald-500" />;
  if (status === "pending") return <Clock size={14} className="text-amber-500" />;
  return <XCircle size={14} className="text-red-400" />;
};

export default function AdminAllPlaces({
  initial,
  categories,
}: {
  initial: Place[];
  categories: Category[];
}) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const catBySlug = new Map(categories.map((c) => [c.slug, c.name]));

  function handleDelete(id: string, name: string) {
    if (!confirm(`Biztosan törlöd ezt a helyet: "${name}"? A folyamat visszafordíthatatlan.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await adminDeletePlace(id);
      if (result?.error) { setError(result.error); return; }
      setItems((prev) => prev.filter((p) => p.id !== id));
    });
  }

  const filtered = items.filter((p) => {
    const matchSearch =
      search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.city.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      {/* Szűrők */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Keresés név, város..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field flex-1 min-w-[180px]"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">Minden státusz</option>
          <option value="approved">Jóváhagyva</option>
          <option value="pending">Függőben</option>
          <option value="rejected">Elutasítva</option>
          <option value="archived">Archivált</option>
        </select>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {filtered.length === 0 ? (
        <p className="text-gray-500">Nincs találat.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Név</th>
                <th className="px-4 py-3">Város</th>
                <th className="px-4 py-3">Kategória</th>
                <th className="px-4 py-3">Státusz</th>
                <th className="px-4 py-3 text-right">Műveletek</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.city}</td>
                  <td className="px-4 py-3 text-gray-600">{catBySlug.get(p.category) ?? p.category}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <StatusIcon status={p.status} />
                      {statusLabel[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/helyek/${p.id}/szerkesztes`}
                        className="inline-flex items-center gap-1 rounded-lg bg-sni-brand-blue/10 px-3 py-1.5 text-xs font-semibold text-sni-brand-blue hover:bg-sni-brand-blue/20 transition-colors"
                      >
                        <Pencil size={13} /> Szerkesztés
                      </Link>
                      <button
                        disabled={isPending}
                        onClick={() => handleDelete(p.id, p.name)}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={13} /> Törlés
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
