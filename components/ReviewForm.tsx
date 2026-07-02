"use client";

import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { reviewSchema, ReviewInput } from "@/lib/schemas";
import RatingInput from "@/components/RatingInput";
import { submitReview } from "@/lib/actions/reviews";
import { checkReviewForSensitiveContent } from "@/lib/reviews/validation";
import ImageUpload, { ImageUploadRef } from "@/components/ImageUpload";

export default function ReviewForm({ placeId, placeName }: { placeId: string; placeName: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showSensitiveWarning, setShowSensitiveWarning] = useState(false);
  const [pendingData, setPendingData] = useState<ReviewInput | null>(null);
  const imgRef = useRef<ImageUploadRef>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReviewInput>({ resolver: zodResolver(reviewSchema) });

  async function sendReview(data: ReviewInput) {
    setServerError(null);
    const images = imgRef.current ? await imgRef.current.uploadAll() : [];
    const result = await submitReview(placeId, data, images);
    if (result?.error) {
      setServerError(result.error);
      return;
    }
    setSubmitted(true);
    reset();
  }

  async function onSubmit(data: ReviewInput) {
    const hasSensitive = checkReviewForSensitiveContent({
      title: data.title,
      positiveText: data.positiveText,
      warningText: data.warningText ?? "",
    });

    if (hasSensitive) {
      setPendingData(data);
      setShowSensitiveWarning(true);
      return;
    }

    await sendReview(data);
  }

  async function confirmSensitiveAndSubmit() {
    if (!pendingData) return;
    setShowSensitiveWarning(false);
    await sendReview(pendingData);
    setPendingData(null);
  }

  if (submitted) {
    return (
      <div className="card text-center">
        <CheckCircle2 className="mx-auto text-emerald-500" size={40} />
        <h2 className="mt-3 text-xl font-semibold text-gray-900">Köszönjük az értékelést!</h2>
        <p className="mt-2 text-gray-600">
          Moderálás után válik nyilvánossá ({placeName}).
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Érzékeny tartalom megerősítő párbeszéd */}
      {showSensitiveWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <button
              onClick={() => setShowSensitiveWarning(false)}
              className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={18} />
            </button>
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={22} />
              <div>
                <h3 className="font-bold text-gray-900">Figyelemfelhívás a tartalomról</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Az értékelésed érzékeny, személyes egészségügyi adatokra utaló
                  szavakat tartalmazhat (pl. diagnózis, fogyatékosság, terápia).
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  Az értékelés <strong>nyilvánosan megjelenik</strong> a weboldalon.
                  Kérjük, csak akkor küldd el, ha tudatosan osztod meg ezeket az
                  információkat.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowSensitiveWarning(false)}
                className="flex-1 rounded-full border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Visszamegyek, átírom
              </button>
              <button
                onClick={confirmSensitiveAndSubmit}
                className="flex-1 rounded-full bg-sni-brand-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-sni-brand-blue"
              >
                Elfogadom, elküldöm
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {serverError && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">Cím*</label>
          <input
            {...register("title")}
            className="input-field mt-1.5"
            placeholder='Pl. "Csendes délelőtti időpontban nagyon jó volt"'
          />
          {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
          <h2 className="font-semibold text-gray-800">Értékelés (1–5)</h2>
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
          <label className="block text-sm font-medium text-gray-700">Mi volt jó?*</label>
          <textarea {...register("positiveText")} rows={3} className="input-field mt-1.5" />
          {errors.positiveText && <p className="mt-1 text-sm text-red-600">{errors.positiveText.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Mire figyeljen más család?</label>
          <textarea {...register("warningText")} rows={3} className="input-field mt-1.5" />
        </div>

        <div>
          <ImageUpload ref={imgRef} folder="reviews" onUploadComplete={() => {}} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Visszamennétek?*</label>
          <div className="mt-1.5 flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" value="igen" {...register("wouldReturn")} /> Igen
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" value="nem" {...register("wouldReturn")} /> Nem
            </label>
          </div>
          {errors.wouldReturn && <p className="mt-1 text-sm text-red-600">{errors.wouldReturn.message}</p>}
        </div>

        {/* GDPR / adatvédelmi megjegyzés */}
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-xs text-blue-700">
          Az értékelésed álneveden jelenik meg — valódi nevedet és GitHub-adataidat
          nem tesszük közzé. A beküldéssel hozzájárulsz a tartalom moderált
          publikálásához.
        </p>

        <button type="submit" disabled={isSubmitting} className="btn-primary mt-2 w-fit">
          {isSubmitting ? "Beküldés..." : "Értékelés beküldése"}
        </button>
      </form>
    </>
  );
}
