"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { submitProviderRegistration } from "@/lib/actions/provider";

interface Place {
  id: string;
  name: string;
  city: string;
}

interface Props {
  places: Place[];
}

export default function ProviderRegistrationForm({ places }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    bookingType: "appointment" as "appointment" | "accommodation" | "both",
    placeId: "",
    description: "",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await submitProviderRegistration(form);
      if (res.error) { setError(res.error); return; }
      setSuccess(true);
    });
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="font-semibold text-emerald-900">Regisztrációd beérkezett!</p>
        <p className="mt-1 text-sm text-emerald-700">
          1–2 munkanapon belül e-mailben értesítünk az elbírálásról.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Cégnév / vállalkozásnév *</label>
        <input
          name="companyName"
          value={form.companyName}
          onChange={handleChange}
          required
          maxLength={200}
          className="input-field"
          placeholder="pl. Egészség Bt."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Kapcsolattartó neve *</label>
          <input
            name="contactName"
            value={form.contactName}
            onChange={handleChange}
            required
            maxLength={150}
            className="input-field"
            placeholder="Teljes neve"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Kapcsolattartó e-mail *</label>
          <input
            name="contactEmail"
            type="email"
            value={form.contactEmail}
            onChange={handleChange}
            required
            maxLength={200}
            className="input-field"
            placeholder="pelda@email.hu"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Telefonszám (opcionális)</label>
        <input
          name="contactPhone"
          value={form.contactPhone}
          onChange={handleChange}
          maxLength={30}
          className="input-field"
          placeholder="+36 30 123 4567"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Foglalás típusa *</label>
        <select
          name="bookingType"
          value={form.bookingType}
          onChange={handleChange}
          className="input-field"
          required
        >
          <option value="appointment">Időpontfoglalás (pl. tanácsadás, terápia)</option>
          <option value="accommodation">Szállásfoglalás (pl. táborhely, apartman)</option>
          <option value="both">Mindkettő</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Melyik helyhez tartozik? *</label>
        <select
          name="placeId"
          value={form.placeId}
          onChange={handleChange}
          required
          className="input-field"
        >
          <option value="">– Válassz helyet –</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.city})
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-400">
          Ha a helyed nem szerepel a listában, előbb küldd be a helyet az oldalra.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Szolgáltatás leírása *</label>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          required
          rows={4}
          maxLength={1000}
          className="input-field resize-none"
          placeholder="Röviden írd le, milyen szolgáltatást nyújtasz, milyen különleges figyelmet fordítasz az autizmus/ADHD spektrumú vendégekre."
        />
        <p className="mt-1 text-xs text-gray-400">{form.description.length}/1000</p>
      </div>

      <p className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
        Az adataidat kizárólag a regisztráció elbírálásához és a kapcsolattartáshoz használjuk.
        A GDPR alapján bármikor kérheted adataid törlését.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="btn-primary w-full disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Regisztráció beküldése
      </button>
    </form>
  );
}
