"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { newPlaceSchema, NewPlaceInput } from "@/lib/schemas";
import { Category } from "@/lib/types";
import RatingInput from "@/components/RatingInput";
import Disclaimer from "@/components/Disclaimer";
import { submitPlace } from "@/lib/actions/places";

export default function NewPlaceForm({ categories }: { categories: Category[] }) {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewPlaceInput>({ resolver: zodResolver(newPlaceSchema) });

  async function onSubmit(data: NewPlaceInput) {
    setServerError(null);
    const result = await submitPlace(data);
    if (result?.error) {
      setServerError(result.error);
      return;
    }
    setSubmitted(true);
    reset();
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <CheckCircle2 className="mx-auto text-sni-greendark" size={48} />
        <h1 className="mt-4 text-2xl font-bold text-sni-text">Köszönjük a beküldést!</h1>
        <p className="mt-2 text-gray-600">
          A hely admin jóváhagyás után válik publikussá.
        </p>
        <button onClick={() => setSubmitted(false)} className="btn-primary mt-6">
          Még egy hely beküldése
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-sni-text">Új hely beküldése</h1>
      <p className="mt-2 text-gray-600">
        Köszönjük, hogy megosztod a tapasztalatodat! A *-gal jelölt mezők kötelezők. Ne adj meg
        gyermekkel kapcsolatos nevet, diagnózist vagy egészségügyi adatot.
      </p>
      <div className="mt-4">
        <Disclaimer />
      </div>

      {serverError && (
        <p className="mt-4 rounded-xl2 bg-sni-warn/10 px-4 py-3 text-sm text-sni-warn">{serverError}</p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-5">
        <div>
          <label className="block text-sm font-medium text-sni-text">Hely neve*</label>
          <input {...register("name")} className="input-field mt-1.5" placeholder="Pl. Csodaszarvas Játszóház" />
          {errors.name && <p className="mt-1 text-sm text-sni-warn">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-sni-text">Kategória*</label>
          <select {...register("category")} className="input-field mt-1.5" defaultValue="">
            <option value="" disabled>
              Válassz kategóriát...
            </option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          {errors.category && <p className="mt-1 text-sm text-sni-warn">{errors.category.message}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-sni-text">Cím*</label>
            <input {...register("address")} className="input-field mt-1.5" placeholder="Utca, házszám" />
            {errors.address && <p className="mt-1 text-sm text-sni-warn">{errors.address.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-sni-text">Település*</label>
            <input {...register("city")} className="input-field mt-1.5" placeholder="Pl. Szeged" />
            {errors.city && <p className="mt-1 text-sm text-sni-warn">{errors.city.message}</p>}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-sni-text">Weboldal</label>
            <input {...register("website")} className="input-field mt-1.5" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-sni-text">Telefonszám</label>
            <input {...register("phone")} className="input-field mt-1.5" placeholder="+36..." />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-sni-text">Rövid leírás*</label>
          <textarea {...register("description")} rows={3} className="input-field mt-1.5" />
          {errors.description && <p className="mt-1 text-sm text-sni-warn">{errors.description.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-sni-text">
            Miért tartod autizmus/SNI-barátnak?*
          </label>
          <textarea {...register("whyFriendly")} rows={3} className="input-field mt-1.5" />
          {errors.whyFriendly && <p className="mt-1 text-sm text-sni-warn">{errors.whyFriendly.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-sni-text">Saját tapasztalatod leírása*</label>
          <textarea {...register("ownExperience")} rows={3} className="input-field mt-1.5" />
          {errors.ownExperience && <p className="mt-1 text-sm text-sni-warn">{errors.ownExperience.message}</p>}
        </div>

        <div className="rounded-xl2 border border-gray-200 p-4">
          <h2 className="font-semibold text-sni-text">Szenzoros és gyakorlati szempontok (1–5)</h2>
          <div className="mt-4 flex flex-col gap-4">
            <Controller
              control={control}
              name="noiseRating"
              render={({ field }) => (
                <RatingInput label="Zajszint kezelhetősége" value={field.value} onChange={field.onChange} error={errors.noiseRating?.message} />
              )}
            />
            <Controller
              control={control}
              name="crowdRating"
              render={({ field }) => (
                <RatingInput label="Zsúfoltság kezelhetősége" value={field.value} onChange={field.onChange} error={errors.crowdRating?.message} />
              )}
            />
            <Controller
              control={control}
              name="staffRating"
              render={({ field }) => (
                <RatingInput label="Személyzet hozzáállása" value={field.value} onChange={field.onChange} error={errors.staffRating?.message} />
              )}
            />
            <Controller
              control={control}
              name="safetyRating"
              render={({ field }) => (
                <RatingInput label="Biztonságosság" value={field.value} onChange={field.onChange} error={errors.safetyRating?.message} />
              )}
            />
            <Controller
              control={control}
              name="quietSpaceRating"
              render={({ field }) => (
                <RatingInput label="Elvonulási lehetőség" value={field.value} onChange={field.onChange} error={errors.quietSpaceRating?.message} />
              )}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-sni-text">Ajánlanád más családnak?*</label>
          <div className="mt-1.5 flex gap-4">
            <label className="flex items-center gap-2 text-sm text-sni-text">
              <input type="radio" value="igen" {...register("wouldRecommend")} /> Igen
            </label>
            <label className="flex items-center gap-2 text-sm text-sni-text">
              <input type="radio" value="nem" {...register("wouldRecommend")} /> Nem
            </label>
          </div>
          {errors.wouldRecommend && <p className="mt-1 text-sm text-sni-warn">{errors.wouldRecommend.message}</p>}
        </div>

        <button type="submit" disabled={isSubmitting} className="btn-primary mt-2 w-fit">
          Hely beküldése
        </button>
      </form>
    </div>
  );
}
