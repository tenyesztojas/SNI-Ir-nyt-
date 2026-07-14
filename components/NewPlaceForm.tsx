"use client";

import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Heart, Copy, Check } from "lucide-react";
import { newPlaceSchema, NewPlaceInput } from "@/lib/schemas";
import { Category } from "@/lib/types";
import RatingInput from "@/components/RatingInput";
import Disclaimer from "@/components/Disclaimer";
import { submitPlace } from "@/lib/actions/places";
import ImageUpload, { ImageUploadRef } from "@/components/ImageUpload";

const SHARE_URL = "https://vedettsarok.hu/uj-hely";
const SHARE_TEXT = "Ajánlj te is egy autizmus- és SNI-barát helyet a VédettSarok közösségnek! 🏠";

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.514c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  );
}

function ThankYouModal({ onClose }: { onClose: () => void }) {
  const [igCopied, setIgCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  function shareFacebook() {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}&quote=${encodeURIComponent(SHARE_TEXT)}`;
    window.open(url, "_blank", "width=600,height=400,noopener,noreferrer");
  }

  async function shareInstagram() {
    await navigator.clipboard.writeText(SHARE_URL);
    setIgCopied(true);
    setTimeout(() => setIgCopied(false), 3000);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${SHARE_TEXT}\n${SHARE_URL}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <Heart className="text-emerald-500" size={32} fill="currentColor" />
        </div>

        <h2 className="mt-5 text-xl font-extrabold text-gray-900">
          Köszönjük! Egy helyet ajánlottál.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Lehet, hogy ezzel egy másik családnak segítettél elindulni.
        </p>

        <div className="mt-5 rounded-2xl bg-sni-brand-navy/5 px-5 py-4">
          <p className="text-sm font-semibold text-sni-brand-navy">
            Meghívsz még 3 embert, hogy ők is ajánljanak egy helyet?
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          {/* Facebook */}
          <button
            onClick={shareFacebook}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl px-4 py-3 font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#1877F2" }}
          >
            <FacebookIcon />
            Megosztom Facebookon
          </button>

          {/* Instagram */}
          <button
            onClick={shareInstagram}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl px-4 py-3 font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)" }}
          >
            <InstagramIcon />
            {igCopied ? "Link másolva – illeszd be!" : "Megosztom Instagramon"}
          </button>

          {/* Link copy */}
          <button
            onClick={copyLink}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            {linkCopied
              ? <span className="flex items-center gap-2"><Check size={16} /> Másolva!</span>
              : <span className="flex items-center gap-2"><Copy size={16} /> Link másolása</span>
            }
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-3 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-gray-400 transition-colors hover:text-gray-600"
        >
          Bezárás
        </button>
      </div>
    </div>
  );
}

export default function NewPlaceForm({ categories }: { categories: Category[] }) {
  const [submitted, setSubmitted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const imgRef = useRef<ImageUploadRef>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewPlaceInput>({ resolver: zodResolver(newPlaceSchema) });

  async function onSubmit(data: NewPlaceInput) {
    setServerError(null);
    const images = imgRef.current ? await imgRef.current.uploadAll() : [];
    const result = await submitPlace(data, images);
    if (result?.error) {
      setServerError(result.error);
      return;
    }
    reset();
    setSubmitted(true);
    setShowModal(true);
  }

  if (submitted) {
    return (
      <>
        {showModal && <ThankYouModal onClose={() => setShowModal(false)} />}
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
      </>
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
          <ImageUpload ref={imgRef} folder="places" />
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
