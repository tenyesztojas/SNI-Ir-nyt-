"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { AvailabilitySlot, ServicePackage, SlotType } from "@/lib/types";
import { upsertAvailabilitySlot, deleteAvailabilitySlot } from "@/lib/actions/provider";

const DAYS = ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat", "Vasárnap"];

interface Props {
  slots: AvailabilitySlot[];
  packages: ServicePackage[];
}

export default function AvailabilityManager({ slots: initial, packages }: Props) {
  const [slots, setSlots] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    slotType: SlotType; dayOfWeek: string; startTime: string; endTime: string;
    specificDate: string; dateFrom: string; dateTo: string; capacity: string; packageId: string;
  }>({ slotType: "recurring", dayOfWeek: "0", startTime: "09:00", endTime: "17:00", specificDate: "", dateFrom: "", dateTo: "", capacity: "1", packageId: "" });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const r = await upsertAvailabilitySlot({
        slotType: form.slotType,
        dayOfWeek: form.slotType === "recurring" ? Number(form.dayOfWeek) : undefined,
        startTime: (form.slotType === "recurring" || form.slotType === "specific") ? form.startTime : undefined,
        endTime: (form.slotType === "recurring" || form.slotType === "specific") ? form.endTime : undefined,
        specificDate: form.slotType === "specific" ? form.specificDate : undefined,
        dateFrom: form.slotType === "blocked" ? form.dateFrom : undefined,
        dateTo: form.slotType === "blocked" ? form.dateTo : undefined,
        capacity: Number(form.capacity) || 1,
        packageId: form.packageId || undefined,
      });
      if (r.error) { setError(r.error); return; }
      setSlots((prev) => [...prev, {
        id: crypto.randomUUID(),
        providerId: "", packageId: form.packageId || null, slotType: form.slotType,
        dayOfWeek: form.slotType === "recurring" ? Number(form.dayOfWeek) : null,
        startTime: form.startTime || null, endTime: form.endTime || null,
        specificDate: form.specificDate || null, dateFrom: form.dateFrom || null, dateTo: form.dateTo || null,
        capacity: Number(form.capacity) || 1, createdAt: new Date().toISOString(),
      }]);
      setShowForm(false);
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Biztosan törlöd?")) return;
    startTransition(async () => {
      await deleteAvailabilitySlot(id);
      setSlots((prev) => prev.filter((s) => s.id !== id));
    });
  }

  function slotLabel(s: AvailabilitySlot) {
    if (s.slotType === "recurring") return `${DAYS[s.dayOfWeek ?? 0]} ${s.startTime ?? ""}–${s.endTime ?? ""}`;
    if (s.slotType === "specific") return `${s.specificDate} ${s.startTime ?? ""}–${s.endTime ?? ""}`;
    return `Blokkolt: ${s.dateFrom ?? ""} → ${s.dateTo ?? ""}`;
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
          <Plus size={15} /> Elérhetőség hozzáadása
        </button>
      </div>

      {showForm && (
        <div className="mb-5 rounded-2xl border border-sni-brand-teal/30 bg-teal-50/20 p-5">
          <h3 className="font-semibold text-sm mb-4">Új elérhetőség</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Típus</label>
              <select className="input-field text-sm" value={form.slotType} onChange={(e) => setForm((f) => ({ ...f, slotType: e.target.value as SlotType }))}>
                <option value="recurring">Ismétlődő (heti)</option>
                <option value="specific">Egyszeri dátum</option>
                <option value="blocked">Blokkolt időszak (nem elérhető)</option>
              </select>
            </div>
            {form.slotType === "recurring" && (
              <div>
                <label className="block text-xs font-medium mb-1">Nap</label>
                <select className="input-field text-sm" value={form.dayOfWeek} onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: e.target.value }))}>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {(form.slotType === "recurring" || form.slotType === "specific") && (
              <>
                {form.slotType === "specific" && (
                  <div>
                    <label className="block text-xs font-medium mb-1">Dátum</label>
                    <input type="date" className="input-field text-sm" value={form.specificDate} onChange={(e) => setForm((f) => ({ ...f, specificDate: e.target.value }))} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium mb-1">Kezdés</label>
                  <input type="time" className="input-field text-sm" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Befejezés</label>
                  <input type="time" className="input-field text-sm" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
                </div>
              </>
            )}
            {form.slotType === "blocked" && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1">Ettől</label>
                  <input type="date" className="input-field text-sm" value={form.dateFrom} onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Eddig</label>
                  <input type="date" className="input-field text-sm" value={form.dateTo} onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value }))} />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium mb-1">Kapacitás</label>
              <input type="number" min="1" className="input-field text-sm" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
            </div>
            {packages.length > 0 && (
              <div>
                <label className="block text-xs font-medium mb-1">Csomag (opcionális)</label>
                <select className="input-field text-sm" value={form.packageId} onChange={(e) => setForm((f) => ({ ...f, packageId: e.target.value }))}>
                  <option value="">— Minden csomag —</option>
                  {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button disabled={isPending} onClick={handleAdd} className="btn-primary text-sm disabled:opacity-50">
              {isPending ? <Loader2 size={14} className="animate-spin" /> : null} Mentés
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">Mégse</button>
          </div>
        </div>
      )}

      {slots.length === 0 ? (
        <p className="text-center text-gray-500 py-8">Még nincs beállított elérhetőség.</p>
      ) : (
        <div className="space-y-2">
          {slots.map((s) => (
            <div key={s.id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${s.slotType === "blocked" ? "border-red-200 bg-red-50" : "border-gray-100 bg-white"}`}>
              <div>
                <p className="text-sm font-medium text-gray-900">{slotLabel(s)}</p>
                <p className="text-xs text-gray-400">Kapacitás: {s.capacity}</p>
              </div>
              <button onClick={() => handleDelete(s.id)} disabled={isPending}
                className="rounded p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-50">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
