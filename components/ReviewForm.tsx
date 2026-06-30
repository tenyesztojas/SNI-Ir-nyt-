"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { reviewSchema, ReviewInput } from "@/lib/schemas";
import RatingInput from "@/components/RatingInput";
import { submitReview } from "@/lib/actions/reviews";

export default function ReviewForm({ placeId, placeName }: { placeId: string; placeName: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReviewInput>({ resolver: zodResolver(reviewSchema) });

  async function onSubmit(data: ReviewInput) {
    setServerError(null);
    const result = await submitReview(placeId, data);
    if (result?.error) {
      setServerError(result.error);
      return;
    }
    setSubmitted(true);
    reset();
  }

  if (submitted) {
    return (
      <div className="card text-center">
        <CheckCircle2 className="mx-auto text-sni-greendark" size={40} />
        <h2 className="mt-3 text-xl font-semibold text-sni-text">Köszönjük az értékelést!</h2>
        <p className="mt-2 text-gray-600">
          Moderálás után válik publikussá ({placeName}).
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {serverError && (
        <p className="rounded-xl2 bg-sni-warn/10 px-4 py-3 text-sm text-sni-warn">{serverError}</p>
      )}

      <div>
        <label className="block text-sm font-medium text-sni-text">Cím*</label>
        <input
          {...register("title")}
          className="input-field mt-1.5"
          placeholder={`Pl. "Csendes délelőtti időpontban nagyon jó volt"`}
        />
        {errors.title && <p className="mt-1 text-sm text-sni-warn">{errors.title.message}</p>}
      </div>

      <div className="rounded-xl2 border border-gray-200 p-4">
        <h2 className="font-semibold text-sni-text">Értékelés (1–5)</h2>
        <div className="mt-4 flex flex-col gap-4">
          <Controller control={control} name="overallRating" render={({ field }) => (
            <RatingInput label="Összbenyomás" value={field.value} onChange={field.onChange} error={errors.overallRating?.message} />
          )} />
          <Controller control={control} name="noiseRating" render={({ field }) => (
            <RatingInput label="Zajszint kezelhetősége" value={field.value} onChange={field.onChange} error={errors.noiseRating?.message} />
          )} />
          <Controller control={control} name="crowdRating" render={({ field }) => (
            <RatingInput label="Zsúfoltság kezelhetősége" value={field.value} onChange={field.onChange} error={errors.crowdRating?.message} />
          )} />
          <Controller control={control} name="staffRating" render={({ field }) => (
            <RatingInput label="Személyzet empátiája" value={field.value} onChange={field.onChange} error={errors.staffRating?.message} />
          )} />
          <Controller control={control} name="safetyRating" render={({ field }) => (
            <RatingInput label="Biztonságosság" value={field.value} onChange={field.onChange} error={errors.safetyRating?.message} />
          )} />
          <Controller control={control} name="quietSpaceRating" render={({ field }) => (
            <RatingInput label="Elvonulási lehetőség" value={field.value} onChange={field.onChange} error={errors.quietSpaceRating?.message} />
          )} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-sni-text">Mi volt jó?*</label>
        <textarea {...register("positiveText")} rows={3} className="input-field mt-1.5" />
        {errors.positiveText && <p className="mt-1 text-sm text-sni-warn">{errors.positiveText.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-sni-text">Mire figyeljen más család?</label>
        <textarea {...register("warningText")} rows={3} className="input-field mt-1.5" />
      </div>

      <div>
        <label className="block text-sm font-medium text-sni-text">Visszamennétek?*</label>
        <div className="mt-1.5 flex gap-4">
          <label className="flex items-center gap-2 text-sm text-sni-text">
            <input type="radio" value="igen" {...register("wouldReturn")} /> Igen
          </label>
          <label className="flex items-center gap-2 text-sm text-sni-text">
            <input type="radio" value="nem" {...register("wouldReturn")} /> Nem
          </label>
        </div>
        {errors.wouldReturn && <p className="mt-1 text-sm text-sni-warn">{errors.wouldReturn.message}</p>}
      </div>

      <button type="submit" disabled={isSubmitting} className="btn-primary mt-2 w-fit">
        Értékelés beküldése
      </button>
    </form>
  );
}
