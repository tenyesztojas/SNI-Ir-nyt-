"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerEmployer } from "@/app/vedettmunka/actions";

function Field({ label, name, type = "text", required = false, placeholder = "", as: As = "input", rows = 4 }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string;
  as?: "input" | "textarea"; rows?: number;
}) {
  const cls = "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-sni-brand-teal focus:ring-2 focus:ring-sni-brand-teal/20";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {As === "textarea" ? (
        <textarea name={name} required={required} placeholder={placeholder} rows={rows} className={cls} />
      ) : (
        <input name={name} type={type} required={required} placeholder={placeholder} className={cls} />
      )}
    </label>
  );
}

function Toggle({ name, label }: { name: string; label: string }) {
  const [val, setVal] = useState(true);
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input type="hidden" name={name} value={String(val)} />
      <button
        type="button"
        onClick={() => setVal(!val)}
        className={`relative h-6 w-11 rounded-full transition ${val ? "bg-sni-brand-teal" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${val ? "left-5" : "left-0.5"}`} />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

export default function MunkaltatoiRegForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await registerEmployer(fd);
        setSuccess(true);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  if (success) {
    return (
      <div className="py-8 text-center">
        <p className="text-lg font-bold text-sni-brand-teal">✓ Regisztrációd megérkezett!</p>
        <p className="mt-2 text-sm text-gray-600">
          Admin jóváhagyás után e-mailben értesítünk. Ez általában 1–2 munkanap.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field name="company_name" label="Cég / szervezet neve" required placeholder="Pl. Minta Kft." />
      <Field name="tax_number" label="Adószám" placeholder="Pl. 12345678-1-42" />
      <Field name="address" label="Székhely / telephely" required placeholder="Pl. 1051 Budapest, Minta utca 1." />
      <Field name="website" label="Weboldal" type="url" placeholder="https://..." />

      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-gray-700">
            Munkáltatói adatkezelési tájékoztató linkje <span className="text-red-500">*</span>
          </span>
          <span className="text-xs text-gray-400">
            A jelentkezőknek a jelentkezés elküldése előtt meg kell ismerniük a munkáltató saját adatkezelési tájékoztatóját. Kérjük, add meg a működő linket.
          </span>
          <input
            name="privacy_policy_url"
            type="url"
            required
            placeholder="https://ceg.hu/adatkezeles"
            pattern="https?://.+"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-sni-brand-teal focus:ring-2 focus:ring-sni-brand-teal/20"
          />
        </label>
        <p className="text-xs text-blue-600">Javasolt: https:// protokoll. Csak nyilvánosan elérhető link fogadható el.</p>
      </div>

      <hr className="my-1" />
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Kapcsolattartó</p>
      <Field name="contact_name" label="Kapcsolattartó neve" required placeholder="Pl. Kovács Anna" />
      <Field name="contact_email" label="E-mail" type="email" required placeholder="hr@ceg.hu" />
      <Field name="contact_phone" label="Telefonszám" placeholder="+36 20 123 4567" />

      <hr className="my-1" />
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Rövid bemutatkozás</p>
      <Field name="description" label="Rövid bemutatkozás" required as="textarea" rows={4}
        placeholder="Kik vagytok? Milyen területen dolgoznak? Mi a cég értékrendje?" />
      <Field name="job_types_description" label="Milyen típusú munkákat hirdetne?" required as="textarea" rows={3}
        placeholder="Pl. Irodai adminisztrációs munkák, raktáros pozíciók..." />

      <hr className="my-1" />
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Befogadói nyilatkozat</p>
      <Toggle name="open_to_neurodivergent" label="Nyitott neurodivergens jelölőkre" />
      <Toggle name="open_to_disabled" label="Nyitott megváltozott munkaképességű / fogyatékossággal élő jelölőkre" />
      <Toggle name="open_to_parents" label="Nyitott érintett gyermeket nevelő szülőkre" />

      <hr className="my-1" />
      <label className="flex items-start gap-3">
        <input type="checkbox" name="accepts_vm_terms" value="true" required className="mt-0.5 rounded" />
        <span className="text-sm text-gray-700">
          Elfogadom a{" "}
          <a
            href="/vedettmunka/munkaltatok"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-sni-brand-blue underline hover:text-sni-brand-teal"
          >
            VédettKarrier karrierpartneri feltételeit
          </a>{" "}
          és vállalom a méltányos, diszkriminációmentes kiválasztást. <span className="text-red-500">*</span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input type="checkbox" name="accepts_no_diagnosis_req" value="true" required className="mt-0.5 rounded" />
        <span className="text-sm text-gray-700">
          Elfogadom, hogy <strong>nem kérek diagnózist, egészségügyi dokumentumot vagy fogyatékossági igazolást</strong> a jelentkezési folyamat első szakaszában. <span className="text-red-500">*</span>
        </span>
      </label>

      <div className="rounded-xl bg-blue-50 px-4 py-3 text-xs text-blue-700">
        A VédettKarrier speciális lehetőségközvetítő felület. A hirdető karrierpartner tudomásul veszi, hogy a platformon neurodivergens, megváltozott munkaképességű, fogyatékossággal élő, illetve érintett gyermeket nevelő álláskeresők is megjelennek.
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-full bg-sni-brand-navy px-7 py-3 font-bold text-white transition hover:bg-sni-brand-blue disabled:opacity-60"
      >
        {isPending ? "Küldés..." : "Regisztrálok"}
      </button>
    </form>
  );
}
