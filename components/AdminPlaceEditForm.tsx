"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, CheckCircle } from "lucide-react";
import { Place, Category } from "@/lib/types";
import { adminUpdatePlace } from "@/lib/actions/places";

export default function AdminPlaceEditForm({
  place,
  categories,
}: {
  place: Place;
  categories: Category[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [values, setValues] = useState({
    name: place.name,
    category: place.category,
    city: place.city,
    address: place.address,
    phone: place.phone ?? "",
    website: place.website ?? "",
    description: place.description,
    whyFriendly: place.whyFriendly,
    ownExperience: place.ownExperience ?? "",
    status: place.status,
  });

  function set(field: string, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setSuccess(false);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await adminUpdatePlace(place.id, values);
      if (result?.error) { setError(result.error); return; }
      setSuccess(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">Név</label>
          <input
            className="input-field mt-1.5"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Kategória</label>
          <select
            className="input-field mt-1.5"
            value={values.category}
            onChange={(e) => set("category", e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Város</label>
          <input
            className="input-field mt-1.5"
            value={values.city}
            onChange={(e) => set("city", e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Cím</label>
          <input
            className="input-field mt-1.5"
            value={values.address}
            onChange={(e) => set("address", e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Telefon</label>
          <input
            className="input-field mt-1.5"
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Weboldal</label>
          <input
            className="input-field mt-1.5"
            value={values.website}
            onChange={(e) => set("website", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Státusz</label>
          <select
            className="input-field mt-1.5"
            value={values.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="approved">Jóváhagyva</option>
            <option value="pending">Függőben</option>
            <option value="rejected">Elutasítva</option>
            <option value="archived">Archivált</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Leírás</label>
        <textarea
          className="input-field mt-1.5 h-24 resize-none"
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Miért befogadó?</label>
        <textarea
          className="input-field mt-1.5 h-24 resize-none"
          value={values.whyFriendly}
          onChange={(e) => set("whyFriendly", e.target.value)}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Saját tapasztalat (opcionális)</label>
        <textarea
          className="input-field mt-1.5 h-20 resize-none"
          value={values.ownExperience}
          onChange={(e) => set("ownExperience", e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle size={16} /> Mentve!
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={isPending} className="btn-primary">
          <Save size={16} /> {isPending ? "Mentés..." : "Mentés"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/helyek/osszes")}
          className="btn-secondary"
        >
          Vissza
        </button>
      </div>
    </form>
  );
}
