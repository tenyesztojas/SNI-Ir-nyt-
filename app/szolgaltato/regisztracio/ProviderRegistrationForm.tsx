"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, Loader2, CheckCircle2 } from "lucide-react";
import { submitProviderRegistration } from "@/lib/actions/provider";

const BOOKING_TYPES = [
  { value: "appointment", label: "Időpontos (pl. terápia, tanácsadás, tábor)" },
  { value: "accommodation", label: "Szállásfoglalás (éjszakás, check-in/check-out)" },
  { value: "both", label: "Mindkettő" },
] as const;

interface Props {
  places: { id: string; name: string; city: string }[];
}

export default function ProviderRegistrationForm({ places }: Props) {
  const [form, setForm] = useState({
    placeId: "",
    companyName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    taxNumber: "",
    bookingType: "appointment" as "appointment" | "accommodation" | "both",
    customDescription: "",
  });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    if (!form.placeId) { setError("Válaszd ki a helyedet."); return; }
    if (!form.companyName.trim()) { setError("Add meg a cég/szervezet nevét."); return; }
    if (!form.contactName.trim()) { setError("Add meg a kapcsolattartó nevét."); return; }
    if (!form.contactEmail.includes("@")) { setError("Érvényes e-mail szükséges."); return; }
    setError(null);
    startTransition(async () => {
      const res = await submitProviderRegistration(form);
      if (res.error) { setError(res.error); return; }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 size={48} className="mx-auto text-emerald-600 mb-4" />
        <h2 className="text-xl font-bold text-emerald-900">Regisztrációd beérkezett!</h2>
        <p className="mt-2 text-emerald-700">
          Az admin csapat 1–2 munkanapon belül elbírálja. E-mailben értesítünk.
        </p>
        <Link href="/" className="btn-secondary mt-6 inline-block">Vissza a főoldalra</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hely kiválasztása */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Melyik hely a tiéd? <span className="text-red-500">*</span>
        </label>
        <select
          className="input-field text-sm"
          value={form.placeId}
          onChange={(e) => set("placeId", e.target.value)}
        >
          <option value="">— Kérem válasszon —</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.city})</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Ha a helyed nem szerepel a listában,{" "}
          <Link href="/helyek/bekuldes" className="text-sni-brand-blue hover:underline">
            add hozzá itt
          </Link>{" "}
          előbb.
        </p>
      </div>

      {/* Cég/szervezet */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Cég / szervezet neve <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="input-field text-sm"
          value={form.companyName}
          onChange={(e) => set("companyName", e.target.value)}
          placeholder="pl. Napfény Vendégház Kft."
        />
      </div>

      {/* Kapcsolattartó */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Kapcsolattartó neve <span className="text-red-500">*</span>
          </label>
          <input type="text" className="input-field text-sm" value={form.contactName}
            onChange={(e) => set("contactName", e.target.value)} placeholder="Kovács Mária" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Kapcsolattartó e-mail <span className="text-red-500">*</span>
          </label>
          <input type="email" className="input-field text-sm" value={form.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)} placeholder="info@napfeny.hu" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Telefon</label>
          <input type="tel" className="input-field text-sm" value={form.contactPhone}
            onChange={(e) => set("contactPhone", e.target.value)} placeholder="+36 30 123 4567" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Adószám</label>
          <input type="text" className="input-field text-sm" value={form.taxNumber}
            onChange={(e) => set("taxNumber", e.target.value)} placeholder="12345678-2-42" />
        </div>
      </div>

      {/* Foglalás típusa */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Milyen foglalást szeretnél kezelni? <span className="text-red-500">*</span>
        </label>
        <div className="space-y-2">
          {BOOKING_TYPES.map((t) => (
            <label key={t.value} className="flex items-center gap-3 cursor-pointer">
              <input type="radio" name="bookingType" value={t.value}
                checked={form.bookingType === t.value}
                onChange={() => set("bookingType", t.value)}
                className="accent-sni-brand-teal" />
              <span className="text-sm text-gray-700">{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Leírás pontosítása */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Leírás pontosítása (opcionális)
        </label>
        <textarea rows={4} className="input-field text-sm resize-none" value={form.customDescription}
          onChange={(e) => set("customDescription", e.target.value)}
          maxLength={2000}
          placeholder="Ha szeretnéd kiegészíteni a helyed leírását a foglalási szempontból fontos információkkal..." />
        <p className="mt-1 text-right text-xs text-gray-400">{form.customDescription.length}/2000</p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        Az adataidat az Adatkezelési Tájékoztató 2.4. pontja alapján kezeljük.
        A regisztrációs adatok kizárólag a foglalási szolgáltatás biztosításához szükségesek.
      </div>

      <button
        disabled={isPending}
        onClick={handleSubmit}
        className="btn-primary w-full disabled:opacity-50"
      >
        {isPending ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
        Regisztrációs kérelem benyújtása
      </button>
    </div>
  );
}
