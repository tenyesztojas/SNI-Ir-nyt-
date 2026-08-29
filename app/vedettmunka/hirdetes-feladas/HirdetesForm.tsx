"use client";

import { useState, useTransition } from "react";
import { submitJobPost } from "@/app/vedettmunka/actions";
import { SZELLEMI_KATEGORIAK, FIZIKAI_KATEGORIAK, HUNGARIAN_COUNTIES } from "@/lib/vedettmunka/categories";

function Field({ label, name, type = "text", required = false, placeholder = "", hint = "", as: As = "input", rows = 3 }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; hint?: string;
  as?: "input" | "textarea"; rows?: number;
}) {
  const cls = "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
      {As === "textarea" ? (
        <textarea name={name} required={required} placeholder={placeholder} rows={rows} className={cls} />
      ) : (
        <input name={name} type={type} required={required} placeholder={placeholder} className={cls} />
      )}
    </label>
  );
}

function RadioGroup({ label, name, options, required = false }: {
  label: string; name: string; options: { value: string; label: string }[]; required?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map(({ value, label }) => (
          <label key={value} className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name={name} value={value} required={required} className="accent-sni-brand-teal" />
            <span className="text-sm">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function HirdetesForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [workType, setWorkType] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await submitJobPost(fd);
        setSuccess(true);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  if (success) {
    return (
      <div className="py-8 text-center">
        <p className="text-lg font-bold text-sni-brand-teal">✓ Hirdetésedet beküldtük!</p>
        <p className="mt-2 text-sm text-gray-600">Admin jóváhagyás után jelenik meg. Általában 1–2 munkanap.</p>
      </div>
    );
  }

  const kategoriak = workType === "szellemi" ? SZELLEMI_KATEGORIAK : workType === "fizikai" ? FIZIKAI_KATEGORIAK : [...SZELLEMI_KATEGORIAK, ...FIZIKAI_KATEGORIAK];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Alapadatok</p>

      <Field name="title" label="Pozíció neve" required placeholder="pl. Irodai adminisztrátor" />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-gray-700">Munkatípus <span className="text-red-500">*</span></span>
        <div className="flex gap-4">
          {[{ value: "szellemi", label: "Szellemi munka" }, { value: "fizikai", label: "Fizikai munka" }].map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="work_type"
                value={value}
                required
                onChange={() => setWorkType(value)}
                className="accent-sni-brand-teal"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-gray-700">Kategória <span className="text-red-500">*</span></span>
        <select name="job_category" required className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal">
          <option value="">— Válassz kategóriát —</option>
          {kategoriak.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="city" label="Város" required placeholder="pl. Budapest" />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-gray-700">Vármegye <span className="text-red-500">*</span></span>
          <select name="county" required className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal">
            <option value="">— Válassz —</option>
            {HUNGARIAN_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      <Field name="workplace_address" label="Pontos munkahelyi cím (opcionális)" placeholder="pl. 1051 Budapest, Minta u. 1." />

      <RadioGroup name="work_location_type" label="Munkavégzés módja" required options={[
        { value: "munkahelyen", label: "Munkahelyen" },
        { value: "otthonrol", label: "Otthonról" },
        { value: "hibrid", label: "Hibrid" },
      ]} />

      <hr className="my-1" />
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Munkaidő</p>

      <Field name="daily_hours" label="Mikor kell dolgoznom? (napi óra / heti napok)" required placeholder="pl. napi 8 óra, hétfőtől péntekig" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="working_hours_from" label="Munkaidő kezdete" type="time" />
        <Field name="working_hours_to" label="Munkaidő vége" type="time" />
      </div>
      <Field name="break_description" label="Mikor van szünet?" placeholder="pl. 12:00–12:30" />

      <RadioGroup name="schedule_type" label="Munkarend" required options={[
        { value: "allando", label: "Állandó" },
        { value: "valtozo", label: "Változó" },
        { value: "muszakos", label: "Műszakos" },
        { value: "elore_tervezheto", label: "Előre tervezhető" },
      ]} />

      <hr className="my-1" />
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Munka tartalma</p>

      <Field name="salary_range" label="Mennyi pénzt fogok keresni? (fizetési sáv)" required
        placeholder="pl. 350 000 – 450 000 Ft / hó" hint="Fizetési sáv: bruttó vagy nettó összeg, havi." />

      <Field name="tasks_description" label="Mit kell csinálnom? (feladatok)" required as="textarea" rows={5}
        placeholder="Írd le egyszerű mondatokban, milyen feladatokat kell nap mint nap elvégezni." />

      <Field name="requirements_description" label="Mit kell tudnom? (elvárások)" required as="textarea" rows={4}
        placeholder="Pl. alapszintű számítógép-ismeret, B kategóriás jogosítvány..." />

      <Field name="application_deadline" label="Meddig jelentkezhetek? (határidő)" type="date" />
      <Field name="expected_start_date" label="Mikor kell elkezdenem dolgozni?" placeholder="pl. azonnal, 2026 szeptemberétől" />

      <hr className="my-1" />
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Betanítás és interjú</p>

      <Field name="training_description" label="Hogyan tanítják meg a munkát?" as="textarea" rows={3}
        placeholder="Kik fognak betanítani? Mennyi ideig tart a betanítás?" />

      <RadioGroup name="mentor_available" label="Lesz valaki, aki segít a munkában? (mentor)" options={[
        { value: "van", label: "Van kijelölt mentor" },
        { value: "nincs", label: "Nincs kijelölt személy" },
        { value: "meg_egyeztetes_alatt", label: "Egyeztetés alatt" },
      ]} />

      <Field name="interview_process" label="Hogyan zajlik az állásinterjú?" as="textarea" rows={3}
        placeholder="Pl. egy rövid online interjú, önéletrajz alapján döntünk..." />

      <hr className="my-1" />
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Kapcsolat és dokumentumok</p>

      <Field name="contact_name" label="Kitől kérdezhetek? (kapcsolattartó neve)" placeholder="pl. Kovács Anna, HR vezető" />
      <Field name="contact_email" label="Kapcsolattartó e-mail" type="email" />
      <Field name="application_email" label="Hova menjen a jelentkezés? (e-mail)" type="email" required />
      <Field name="required_documents" label="Milyen dokumentumokat kérünk a jelentkezéshez?" placeholder="pl. önéletrajz, motivációs levél" />
      <Field name="notes" label="Megjegyzés" as="textarea" rows={2} />

      <hr className="my-1" />
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 pt-1">
        Miben támogató vagy rugalmas ez a munkakörnyezet? <span className="text-red-500 normal-case font-normal">*</span>
      </p>
      <Field name="support_description" label="" required as="textarea" rows={4}
        placeholder="Ez a kötelező VédettMunka-mező. Írd le konkrétan, miben segít a munkakörnyezet: pl. van kijelölt mentor, a feladatokat írásban is megkapja, rugalmas a munkaidő, csendes irodai légkör, stb." />

      <hr className="my-1" />
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Milyen ez a munkahely? (VédettMunka kérdések)</p>

      <RadioGroup name="phone_required_level" label="Kell telefonálni a munka során?" options={[
        { value: "nem", label: "Nem" }, { value: "ritkan", label: "Ritkán" },
        { value: "naponta_nehanykor", label: "Naponta néhányszor" }, { value: "igen_gyakran", label: "Igen, gyakran" },
      ]} />

      <RadioGroup name="verbal_interaction_level" label="Emberekkel / vásárlókkal kell szóban beszélni?" options={[
        { value: "nem", label: "Nem" }, { value: "ritkan", label: "Ritkán" }, { value: "igen", label: "Igen" },
      ]} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-gray-700">Kikkel kell kommunikálni?</legend>
        <div className="flex flex-wrap gap-3">
          {[
            { value: "vezeto", label: "Vezetővel" },
            { value: "munkatarsak", label: "Munkatársakkal" },
            { value: "ugyfelek", label: "Ügyfelekkel / vásárlókkal" },
          ].map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2">
              <input type="checkbox" name="interaction_with" value={value} className="rounded" />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <RadioGroup name="noise_level" label="Milyen hangok vannak a munkahelyen?" options={[
        { value: "csendes", label: "Csendes" }, { value: "beszelgetes", label: "Emberek beszélgetnek" },
        { value: "gepek", label: "Gépek hangja" }, { value: "sok_hang", label: "Sok hang egyszerre" },
        { value: "nagyon_hangos", label: "Nagyon hangos" },
      ]} />

      <RadioGroup name="written_instructions_available" label="Kaphatom írásban is a feladatokat?" options={[
        { value: "igen", label: "Igen" }, { value: "reszben", label: "Részben" }, { value: "nem", label: "Nem" },
      ]} />

      <RadioGroup name="break_flexibility" label="Mennyire rugalmasak a szünetek?" options={[
        { value: "rugalmasak", label: "Rugalmasak" }, { value: "reszben", label: "Részben" },
        { value: "elore_meghat", label: "Előre meghatározottak" }, { value: "nem_rugalmasak", label: "Nem rugalmasak" },
      ]} />

      <RadioGroup name="start_end_flexibility" label="Rugalmas a munkakezdés és -befejezés?" options={[
        { value: "rugalmas", label: "Rugalmas" }, { value: "reszben", label: "Részben" }, { value: "nem_rugalmas", label: "Nem rugalmas" },
      ]} />

      <RadioGroup name="part_time_available" label="Van lehetőség részmunkaidőre?" options={[
        { value: "igen", label: "Igen" }, { value: "nem", label: "Nem" }, { value: "egyeztetes", label: "Egyeztetés alapján" },
      ]} />

      <RadioGroup name="open_to_parents" label="Nyitott érintett gyermeket nevelő szülőkre?" options={[
        { value: "true", label: "Igen" }, { value: "false", label: "Nem" },
      ]} />
      <RadioGroup name="open_to_neurodivergent" label="Nyitott neurodivergens jelölőkre?" options={[
        { value: "true", label: "Igen" }, { value: "false", label: "Nem" },
      ]} />
      <RadioGroup name="open_to_disabled" label="Nyitott megváltozott munkaképességű jelölőkre?" options={[
        { value: "true", label: "Igen" }, { value: "false", label: "Nem" },
      ]} />

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      <div className="rounded-xl bg-blue-50 px-4 py-3 text-xs text-blue-700">
        A hirdetés beküldés után admin ellenőrzésen esik át. Csak ezt követően jelenik meg az álláshirdetések között.
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-full bg-sni-brand-teal px-7 py-3 font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white disabled:opacity-60"
      >
        {isPending ? "Küldés..." : "Hirdetés beküldése"}
      </button>
    </form>
  );
}
