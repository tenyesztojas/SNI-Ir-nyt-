"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Category } from "@/lib/types";
import { adminCreatePlace, AdminCreatePlaceInput } from "@/lib/actions/places";
import ImageUpload, { ImageUploadRef } from "@/components/ImageUpload";

export default function AdminNewPlaceForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const imgRef = useRef<ImageUploadRef>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const input: AdminCreatePlaceInput = {
      name: fd.get("name") as string,
      category: fd.get("category") as string,
      city: fd.get("city") as string,
      address: fd.get("address") as string,
      phone: fd.get("phone") as string,
      website: fd.get("website") as string,
      description: fd.get("description") as string,
      whyFriendly: fd.get("whyFriendly") as string,
      ownExperience: fd.get("ownExperience") as string,
    };

    const images = imgRef.current ? await imgRef.current.uploadAll() : [];
    const result = await adminCreatePlace(input, images);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSuccess(result.slug ?? "");
  }

  if (success !== null) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-10 text-center">
        <CheckCircle2 className="mx-auto text-emerald-500" size={44} />
        <h2 className="mt-4 text-xl font-bold text-gray-900">Hely sikeresen létrehozva!</h2>
        <p className="mt-1 text-sm text-gray-600">Azonnal elérhető a nyilvános listában.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href={`/helyek/${success}`}
            target="_blank"
            className="btn-primary"
          >
            Hely megtekintése
          </a>
          <button
            onClick={() => { setSuccess(null); setError(null); }}
            className="btn-secondary"
          >
            Új hely felvitele
          </button>
          <button
            onClick={() => router.push("/admin/helyek/osszes")}
            className="btn-secondary"
          >
            Összes hely
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Hely neve *</label>
          <input name="name" required minLength={2} className="input-field mt-1.5" placeholder="Pl. Csodaszarvas Játszóház" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Kategória *</label>
          <select name="category" required defaultValue="" className="input-field mt-1.5">
            <option value="" disabled>Válassz kategóriát...</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Település *</label>
          <input name="city" required minLength={2} className="input-field mt-1.5" placeholder="Pl. Budapest" />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Cím *</label>
          <input name="address" required minLength={3} className="input-field mt-1.5" placeholder="Utca, házszám" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Weboldal vagy e-mail</label>
          <input name="website" type="text" className="input-field mt-1.5" placeholder="https://... vagy pelda@gmail.com" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Telefonszám</label>
          <input name="phone" className="input-field mt-1.5" placeholder="+36..." />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Rövid leírás *</label>
          <textarea name="description" required minLength={5} rows={3} className="input-field mt-1.5" placeholder="Miről szól ez a hely?" />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Miért autizmus/SNI-barát? *</label>
          <textarea name="whyFriendly" required minLength={5} rows={3} className="input-field mt-1.5" placeholder="Pl. csendes környezet, inkluzív személyzet..." />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Saját tapasztalat</label>
          <textarea name="ownExperience" rows={2} className="input-field mt-1.5" placeholder="Opcionális megjegyzés..." />
        </div>
      </div>

      <div>
        <ImageUpload ref={imgRef} folder="places" />
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary inline-flex items-center gap-2"
        >
          {submitting ? <><Loader2 size={16} className="animate-spin" /> Mentés...</> : "Hely közzététele"}
        </button>
        <p className="text-xs text-gray-400">Azonnal megjelenik a nyilvános listában.</p>
      </div>
    </form>
  );
}
