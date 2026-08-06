"use client";
import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";
import { ServicePackage, PriceUnit } from "@/lib/types";
import { createServicePackage, updateServicePackage } from "@/lib/actions/provider";

const PRICE_UNITS: PriceUnit[] = ["alkalom", "éjszaka", "fő", "fő/éjszaka", "óra"];

interface Props {
  packages: ServicePackage[];
  bookingType: "appointment" | "accommodation" | "both";
}

export default function ServicePackagesManager({ packages: initial, bookingType }: Props) {
  const [packages, setPackages] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", packageType: "appointment" as "appointment" | "accommodation", durationMinutes: "", unitName: "", maxGuests: "", priceAmount: "", priceUnit: "alkalom" as PriceUnit });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setForm({ name: "", description: "", packageType: "appointment", durationMinutes: "", unitName: "", maxGuests: "", priceAmount: "", priceUnit: "alkalom" });
    setEditingId(null);
    setShowForm(false);
  }

  function handleSubmit() {
    if (!form.name.trim()) { setError("Csomag neve kötelező."); return; }
    if (!form.priceAmount || isNaN(Number(form.priceAmount))) { setError("Érvényes árat adj meg."); return; }
    setError(null);
    startTransition(async () => {
      if (editingId) {
        const r = await updateServicePackage(editingId, {
          name: form.name, description: form.description,
          priceAmount: Number(form.priceAmount), priceUnit: form.priceUnit,
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
          unitName: form.unitName || undefined, maxGuests: form.maxGuests ? Number(form.maxGuests) : undefined,
        });
        if (r.error) { setError(r.error); return; }
        setPackages((prev) => prev.map((p) => p.id === editingId ? { ...p, name: form.name, description: form.description, priceAmount: Number(form.priceAmount), priceUnit: form.priceUnit } : p));
      } else {
        const r = await createServicePackage({
          name: form.name, description: form.description,
          packageType: form.packageType,
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
          unitName: form.unitName || undefined, maxGuests: form.maxGuests ? Number(form.maxGuests) : undefined,
          priceAmount: Number(form.priceAmount), priceUnit: form.priceUnit,
        });
        if (r.error) { setError(r.error); return; }
        if (r.id) setPackages((prev) => [...prev, { ...form, id: r.id!, providerId: "", placeId: "", priceAmount: Number(form.priceAmount), priceCurrency: "HUF", active: true, sortOrder: prev.length, createdAt: new Date().toISOString(), durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null, unitName: form.unitName || null, maxGuests: form.maxGuests ? Number(form.maxGuests) : null }]);
      }
      resetForm();
    });
  }

  async function toggleActive(pkg: ServicePackage) {
    startTransition(async () => {
      await updateServicePackage(pkg.id, { active: !pkg.active });
      setPackages((prev) => prev.map((p) => p.id === pkg.id ? { ...p, active: !p.active } : p));
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-600">{packages.length} csomag</p>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
          <Plus size={15} /> Új csomag
        </button>
      </div>

      {(showForm || editingId) && (
        <div className="mb-5 rounded-2xl border border-sni-brand-teal/30 bg-teal-50/20 p-5">
          <h3 className="font-semibold text-sm mb-4">{editingId ? "Csomag szerkesztése" : "Új csomag"}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Csomag neve *</label>
              <input className="input-field text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="pl. 50 perces szenzoros játék" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Leírás</label>
              <textarea rows={3} className="input-field text-sm resize-none" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Mi van benne?" />
            </div>
            {!editingId && (bookingType === "both") && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Típus</label>
                <select className="input-field text-sm" value={form.packageType} onChange={(e) => setForm((f) => ({ ...f, packageType: e.target.value as "appointment" | "accommodation" }))}>
                  <option value="appointment">Időpontos</option>
                  <option value="accommodation">Szállásos</option>
                </select>
              </div>
            )}
            {form.packageType === "appointment" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Időtartam (perc)</label>
                <input type="number" className="input-field text-sm" value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} placeholder="60" />
              </div>
            )}
            {form.packageType === "accommodation" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Egység neve</label>
                  <input className="input-field text-sm" value={form.unitName} onChange={(e) => setForm((f) => ({ ...f, unitName: e.target.value }))} placeholder="Szoba, Apartman..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max. vendég</label>
                  <input type="number" className="input-field text-sm" value={form.maxGuests} onChange={(e) => setForm((f) => ({ ...f, maxGuests: e.target.value }))} placeholder="4" />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ár (Ft) *</label>
              <input type="number" className="input-field text-sm" value={form.priceAmount} onChange={(e) => setForm((f) => ({ ...f, priceAmount: e.target.value }))} placeholder="15000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ár/egység *</label>
              <select className="input-field text-sm" value={form.priceUnit} onChange={(e) => setForm((f) => ({ ...f, priceUnit: e.target.value as PriceUnit }))}>
                {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button disabled={isPending} onClick={handleSubmit} className="btn-primary text-sm disabled:opacity-50">
              {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              {editingId ? "Mentés" : "Csomag létrehozása"}
            </button>
            <button type="button" onClick={resetForm} className="btn-secondary text-sm">Mégse</button>
          </div>
        </div>
      )}

      {packages.length === 0 ? (
        <p className="text-center text-gray-500 py-8">Még nincs csomag. Hozz létre egyet!</p>
      ) : (
        <div className="space-y-3">
          {packages.map((pkg) => (
            <div key={pkg.id} className={`card flex items-start justify-between gap-3 ${!pkg.active ? "opacity-50" : ""}`}>
              <div>
                <p className="font-semibold text-sm text-gray-900">{pkg.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  <span className="font-bold text-sni-brand-teal">{pkg.priceAmount.toLocaleString("hu-HU")} Ft</span>
                  {" / "}{pkg.priceUnit}
                  {pkg.durationMinutes && ` · ${pkg.durationMinutes} perc`}
                  {pkg.unitName && ` · ${pkg.unitName}`}
                </p>
                {pkg.description && <p className="text-xs text-gray-400 mt-1">{pkg.description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggleActive(pkg)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100" title={pkg.active ? "Inaktiválás" : "Aktiválás"}>
                  {pkg.active ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button onClick={() => { setEditingId(pkg.id); setForm({ name: pkg.name, description: pkg.description ?? "", packageType: pkg.packageType, durationMinutes: pkg.durationMinutes?.toString() ?? "", unitName: pkg.unitName ?? "", maxGuests: pkg.maxGuests?.toString() ?? "", priceAmount: pkg.priceAmount.toString(), priceUnit: pkg.priceUnit }); setShowForm(false); }}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
                  <Pencil size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
