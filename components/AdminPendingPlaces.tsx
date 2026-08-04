"use client";

import { useState, useTransition } from "react";
import { Trash2, Pencil, Check, ChevronDown, ChevronUp, UserCircle, Mail, Flag } from "lucide-react";
import { Place, Category } from "@/lib/types";
import CategoryBadge from "./CategoryBadge";
import { removePlace, adminEditAndApprovePlace } from "@/lib/actions/places";

type Item = Place & { removed?: boolean };

export default function AdminPendingPlaces({
  initial,
  categories,
}: {
  initial: Place[];
  categories: Category[];
}) {
  const [items, setItems] = useState<Item[]>(initial.map((p) => ({ ...p, removed: false })));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    name: string; description: string; whyFriendly: string; ownExperience: string;
  }>({ name: "", description: "", whyFriendly: "", ownExperience: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  function startEdit(p: Item) {
    setEditingId(p.id);
    setEditValues({
      name: p.name,
      description: p.description,
      whyFriendly: p.whyFriendly,
      ownExperience: p.ownExperience ?? "",
    });
    setExpandedId(p.id);
  }

  function cancelEdit() { setEditingId(null); }

  function handleRemove(id: string) {
    if (!confirm("Biztosan eltávolítod ezt a helyet? Ez visszafordíthatatlan.")) return;
    setError(null);
    startTransition(async () => {
      const result = await removePlace(id, null, "Admin manuálisan eltávolította");
      if (result?.error) { setError(result.error); return; }
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, removed: true } : p)));
      setTimeout(() => setItems((prev) => prev.filter((p) => p.id !== id)), 800);
    });
  }

  function saveEdit(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await adminEditAndApprovePlace(id, {
        name: editValues.name,
        description: editValues.description,
        whyFriendly: editValues.whyFriendly,
        ownExperience: editValues.ownExperience,
      });
      if (result?.error) { setError(result.error); return; }
      setItems((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, name: editValues.name, description: editValues.description,
                whyFriendly: editValues.whyFriendly, ownExperience: editValues.ownExperience }
            : p
        )
      );
      setEditingId(null);
    });
  }

  if (items.length === 0) {
    return <p className="text-gray-500">Nincs felhasználó által beküldött hely.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.map((p) => {
        const isEditing = editingId === p.id;
        const isExpanded = expandedId === p.id;

        return (
          <div
            key={p.id}
            className={`card transition-opacity ${p.removed ? "opacity-30" : ""}`}
          >
            {/* Fejléc */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-sni-text">{p.name}</h3>
                <p className="text-sm text-gray-500">{p.city} · {p.address}</p>
                {p.flaggedForReview && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                    <Flag size={11} /> Automatikus szűrő megjelölte – ellenőrizd
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <CategoryBadge category={categoryBySlug.get(p.category)} />
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>

            {/* Beküldő */}
            {p.submitter && (
              <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800">
                <span className="flex items-center gap-1.5 font-medium">
                  <UserCircle size={13} />
                  {p.submitter.displayName}
                </span>
                {p.submitter.email.includes("@") ? (
                  <a
                    href={`mailto:${p.submitter.email}`}
                    className="flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <Mail size={12} />
                    {p.submitter.email}
                  </a>
                ) : (
                  <span className="flex items-center gap-1 text-blue-400 italic">
                    <Mail size={12} />
                    {p.submitter.email}
                  </span>
                )}
              </div>
            )}

            {/* Tartalom */}
            {isExpanded && !isEditing && (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-gray-600">{p.description}</p>
                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-gray-700">
                  <span className="font-medium">Miért barát: </span>{p.whyFriendly}
                </div>
                {p.ownExperience && (
                  <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    <span className="font-medium">Saját tapasztalat: </span>{p.ownExperience}
                  </div>
                )}
                {p.images && p.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {p.images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt="" className="h-20 w-20 rounded-lg object-cover border border-gray-200" />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Szerkesztő mód */}
            {isEditing && (
              <div className="mt-3 space-y-3 rounded-xl border border-sni-brand-teal/30 bg-teal-50/30 p-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Név</label>
                  <input className="input-field text-sm" value={editValues.name}
                    onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Leírás</label>
                  <textarea rows={3} className="input-field text-sm resize-none" value={editValues.description}
                    onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Miért autizmus/ADHD-barát?</label>
                  <textarea rows={3} className="input-field text-sm resize-none" value={editValues.whyFriendly}
                    onChange={(e) => setEditValues((v) => ({ ...v, whyFriendly: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Saját tapasztalat</label>
                  <textarea rows={2} className="input-field text-sm resize-none" value={editValues.ownExperience}
                    onChange={(e) => setEditValues((v) => ({ ...v, ownExperience: e.target.value }))} />
                </div>
              </div>
            )}

            {/* Gombok */}
            <div className="mt-3 flex flex-wrap gap-2">
              {!isEditing ? (
                <>
                  <button
                    disabled={isPending || !!p.removed}
                    onClick={() => startEdit(p)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Pencil size={14} /> Adatminőség szerkesztés
                  </button>
                  <button
                    disabled={isPending || !!p.removed}
                    onClick={() => handleRemove(p.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={14} /> Eltávolítás
                  </button>
                </>
              ) : (
                <>
                  <button
                    disabled={isPending}
                    onClick={() => saveEdit(p.id)}
                    className="btn-primary text-sm"
                  >
                    <Check size={15} /> {isPending ? "Mentés..." : "Mentés"}
                  </button>
                  <button type="button" onClick={cancelEdit} className="btn-secondary text-sm">
                    Mégse
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
