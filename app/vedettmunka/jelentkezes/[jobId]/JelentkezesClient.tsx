"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { Upload, FileText, CheckCircle2 } from "lucide-react";

interface Props {
  jobId: string;
  jobTitle: string;
  applicationEmail: string;
  defaultName: string;
  defaultEmail: string;
  userId: string;
  employerId: string;
}

export default function JelentkezesClient({
  jobId, jobTitle, applicationEmail, defaultName, defaultEmail, userId, employerId,
}: Props) {
  const [step, setStep] = useState<"cv" | "details" | "done">("cv");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [useCvBuilder, setUseCvBuilder] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("A fájl mérete legfeljebb 5 MB lehet.");
      return;
    }
    setCvFile(file);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (cvFile) fd.set("cv_file", cvFile);
    fd.set("job_id", jobId);
    fd.set("employer_id", employerId);
    fd.set("user_id", userId);

    startTransition(async () => {
      try {
        const res = await fetch("/api/vedettmunka/jelentkezes", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const { error: e } = await res.json().catch(() => ({ error: "Ismeretlen hiba." }));
          throw new Error(e ?? "Ismeretlen hiba.");
        }
        setStep("done");
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  if (step === "done") {
    return (
      <div className="py-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 text-sni-brand-teal" size={48} />
        <p className="text-lg font-bold text-sni-brand-navy">Jelentkezésedet továbbítottuk!</p>
        <p className="mt-2 text-sm text-gray-600">
          A munkáltató e-mailben kapott értesítést a jelentkezésedről. Hamarosan felveszi veled a kapcsolatot.
        </p>
        <Link
          href="/vedettmunka/allasok"
          className="mt-5 inline-block rounded-full bg-sni-brand-navy px-7 py-3 font-bold text-white transition hover:bg-sni-brand-blue"
        >
          Vissza az állásokhoz
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Lépés 1: CV */}
      <div>
        <h2 className="font-bold text-sni-brand-navy">1. Önéletrajz</h2>
        <p className="mt-1 text-sm text-gray-500">Van már önéletrajzod?</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => { setUseCvBuilder(false); fileRef.current?.click(); }}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${!useCvBuilder && cvFile ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-teal" : "border-gray-200 hover:border-sni-brand-teal"}`}
          >
            <Upload size={16} />
            {cvFile ? `✓ ${cvFile.name}` : "Igen, feltöltöm"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileChange}
            className="hidden"
          />
          <Link
            href={`/vedettmunka/oneletrajz?visszater=/vedettmunka/jelentkezes/${jobId}`}
            className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold hover:border-sni-brand-teal"
          >
            <FileText size={16} />
            Nincs, készítek egyet
          </Link>
        </div>
        {cvFile && (
          <p className="mt-2 text-xs text-gray-400">
            A CV-t csak a munkáltatónak küldjük el és nem tároljuk tartósan.
          </p>
        )}
      </div>

      {/* Lépés 2: Személyes adatok */}
      <div>
        <h2 className="font-bold text-sni-brand-navy">2. Kapcsolati adatok</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500">Teljes neve *</span>
            <input
              name="applicant_name"
              required
              defaultValue={defaultName}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500">E-mail *</span>
            <input
              name="applicant_email"
              type="email"
              required
              defaultValue={defaultEmail}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
            />
          </label>
        </div>
      </div>

      {/* Üzenet */}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-gray-700">3. Rövid üzenet a munkáltatónak (opcionális)</span>
        <textarea
          name="message"
          rows={4}
          placeholder="Miért érdekli ez az állás? Van valami, amit fontosnak tartasz megemlíteni?"
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        />
      </label>

      {/* Adatkezelési beleegyezés */}
      <div className="rounded-xl bg-gray-50 p-4 text-xs text-gray-600">
        <p className="font-semibold text-gray-700 mb-1">4. Adatkezelési tájékoztató</p>
        <p>
          A jelentkezés elküldésével elfogadod, hogy a megadott adataidat és csatolt önéletrajzodat
          továbbítjuk az adott munkáltatónak (<strong>{applicationEmail}</strong>).
          A Védett Munka nem tárolja tartósan az önéletrajzodat.
          A munkáltató a jelentkezési adatokat a saját kiválasztási folyamatában kezeli.
        </p>
        <label className="mt-3 flex items-start gap-2">
          <input type="checkbox" required className="mt-0.5 rounded" />
          <span>Megértettem és elfogadom. <span className="text-red-500">*</span></span>
        </label>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-full bg-sni-brand-teal px-8 py-3 font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white disabled:opacity-60"
      >
        {isPending ? "Küldés..." : "Jelentkezés elküldése"}
      </button>
    </form>
  );
}
