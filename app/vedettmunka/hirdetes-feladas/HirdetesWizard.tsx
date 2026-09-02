"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { submitJobPostWizard } from "@/app/vedettmunka/actions";
import { SZELLEMI_KATEGORIAK, FIZIKAI_KATEGORIAK, HUNGARIAN_COUNTIES } from "@/lib/vedettmunka/categories";
import { WIZARD_STEP_ATTRIBUTES, ATTRIBUTE_LABELS } from "@/lib/vedettmunka/attributes";
import VmIcon from "@/components/vedettmunka/VmIcon";

// ─── Típusok ────────────────────────────────────────────────────
type WizardData = Record<string, string | boolean | string[]>;

const STEPS = [
  "Alapadatok",
  "Mit kell csinálni?",
  "Munkaidő",
  "Munkakörnyezet",
  "Betanítás és segítség",
  "Jelentkezés",
  "Átnézés",
] as const;

// ─── Helpers ────────────────────────────────────────────────────
function Field({ label, hint, required = false, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
      {children}
    </label>
  );
}

const cls = "rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sni-brand-teal focus:ring-2 focus:ring-sni-brand-teal/20";

function Input({ name, value, onChange, placeholder = "", type = "text", required = false }: {
  name: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className={cls}
    />
  );
}

function Textarea({ name, value, onChange, placeholder = "", rows = 4 }: {
  name: string; value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`${cls} resize-none`}
    />
  );
}

function Select({ name, value, onChange, options }: {
  name: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Attribútum választó ─────────────────────────────────────
function AttributePicker({
  slugGroup,
  selected,
  onToggle,
}: {
  slugGroup: string[];
  selected: Set<string>;
  onToggle: (slug: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {slugGroup.map((slug) => {
        const info = ATTRIBUTE_LABELS[slug];
        const active = selected.has(slug);
        return (
          <button
            key={slug}
            type="button"
            onClick={() => onToggle(slug)}
            className={`flex items-start gap-3 rounded-xl border p-3 text-left transition
              ${active
                ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-navy shadow-sm"
                : "border-gray-100 bg-gray-50 text-gray-600 hover:border-sni-brand-teal/40"
              }`}
          >
            <div className={`mt-0.5 shrink-0 ${active ? "text-sni-brand-teal" : "text-gray-400"}`}>
              <VmIcon name={slug} size={44} />
            </div>
            <div>
              <p className="text-xs font-bold leading-snug">{info?.title ?? slug}</p>
              {info?.desc && (
                <p className="mt-0.5 text-xs leading-snug opacity-60">{info.desc}</p>
              )}
            </div>
            {active && (
              <span className="ml-auto shrink-0 h-4 w-4 rounded-full bg-sni-brand-teal flex items-center justify-center text-white text-xs">✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Fő wizard komponens ─────────────────────────────────────
export default function HirdetesWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>({
    title: "", city: "", county: "", workplace_address: "",
    work_type: "szellemi", job_category: "", work_location_type: "munkahelyen",
    daily_hours: "", working_days: "", working_hours_from: "", working_hours_to: "",
    break_description: "", schedule_type: "allando", salary_range: "",
    tasks_description: "", requirements_description: "",
    application_deadline: "", expected_start_date: "",
    training_description: "", mentor_available: "meg_egyeztetes_alatt",
    support_description: "",
    application_email: "", contact_name: "", contact_email: "",
    required_documents: "", interview_process: "", notes: "",
    part_time_available: "", start_end_flexibility: "",
    noise_level: "", verbal_interaction_level: "",
    open_to_neurodivergent: true, open_to_disabled: true, open_to_parents: true,
  });
  const [selectedAttrs, setSelectedAttrs] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const set = useCallback((key: string, val: string | boolean | string[]) => {
    setData((d) => ({ ...d, [key]: val }));
  }, []);

  const toggleAttr = useCallback((slug: string) => {
    setSelectedAttrs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const kategoriak = data.work_type === "szellemi" ? SZELLEMI_KATEGORIAK : FIZIKAI_KATEGORIAK;

  // ─── Step validáció ────────────────────────────────────────
  function canProceed(): boolean {
    if (step === 0) return !!(data.title && data.city && data.work_type);
    if (step === 1) return !!(data.tasks_description);
    if (step === 2) return !!(data.daily_hours && data.salary_range);
    if (step === 5) return !!(data.application_email);
    return true;
  }

  // ─── Submit ───────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");
    const res = await submitJobPostWizard(data, [...selectedAttrs]);
    setSubmitting(false);
    if (res.ok) {
      router.push("/vedettmunka/hirdetes-feladas/koszonjuk");
    } else {
      setSubmitError(res.error ?? "Ismeretlen hiba");
    }
  }

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Fejléc + progress */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-sni-brand-teal mb-1">
          {step + 1} / {STEPS.length} lépés
        </p>
        <h1 className="text-2xl font-extrabold text-sni-brand-navy">{STEPS[step]}</h1>
        {/* Progress bar */}
        <div className="mt-3 h-2 rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-sni-brand-teal transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="mt-1.5 flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full transition-colors ${
                i <= step ? "bg-sni-brand-teal" : "bg-gray-100"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Tartalom */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">

        {/* STEP 0 – Alapadatok */}
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <Field label="Az állás megnevezése" required>
              <Input name="title" value={data.title as string} onChange={(v) => set("title", v)} placeholder="pl. Pénztáros, Ügyfélszolgálatos..." required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Település" required>
                <Input name="city" value={data.city as string} onChange={(v) => set("city", v)} placeholder="Budapest" required />
              </Field>
              <Field label="Megye">
                <Select name="county" value={data.county as string} onChange={(v) => set("county", v)}
                  options={[{ value: "", label: "Válassz..." }, ...HUNGARIAN_COUNTIES.map((c) => ({ value: c, label: c }))]}
                />
              </Field>
            </div>
            <Field label="Pontos munkavégzési cím" hint="Opcionális">
              <Input name="workplace_address" value={data.workplace_address as string} onChange={(v) => set("workplace_address", v)} placeholder="Kossuth tér 1." />
            </Field>
            <Field label="Munka típusa" required>
              <div className="flex gap-2">
                {["szellemi", "fizikai"].map((t) => (
                  <button key={t} type="button"
                    onClick={() => { set("work_type", t); set("job_category", ""); }}
                    className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition
                      ${data.work_type === t
                        ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-navy"
                        : "border-gray-200 text-gray-500 hover:border-sni-brand-teal/40"}`}
                  >
                    {t === "szellemi" ? "Szellemi" : "Fizikai"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Kategória">
              <Select name="job_category" value={data.job_category as string} onChange={(v) => set("job_category", v)}
                options={[{ value: "", label: "Válassz..." }, ...kategoriak.map((k) => ({ value: k.value, label: k.label }))]}
              />
            </Field>
            <Field label="Munkavégzés helye" required>
              <div className="flex gap-2">
                {[
                  { v: "munkahelyen", l: "Munkahelyen" },
                  { v: "otthonrol",   l: "Otthon" },
                  { v: "hibrid",      l: "Munkahelyen és otthon" },
                ].map(({ v, l }) => (
                  <button key={v} type="button" onClick={() => set("work_location_type", v)}
                    className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition
                      ${data.work_location_type === v
                        ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-navy"
                        : "border-gray-200 text-gray-500 hover:border-sni-brand-teal/40"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* STEP 1 – Mit kell csinálni? */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
              Írj egyszerűen és érthetően. Kerüld a HR-zsargont.<br />
              Pl. ne &bdquo;Dinamikus munkakör&rdquo;, hanem &bdquo;A feladataid naponta változhatnak.&rdquo;
            </div>
            <Field label="Mik lesznek a feladataid?" required>
              <Textarea name="tasks_description" value={data.tasks_description as string}
                onChange={(v) => set("tasks_description", v)}
                placeholder="Leírás: mit kell elvégezni, milyen sorrendben, mennyi önállósággal..." rows={5} />
            </Field>
            <Field label="Mit várunk tőled?" hint="Tapasztalat, képzettség, készségek">
              <Textarea name="requirements_description" value={data.requirements_description as string}
                onChange={(v) => set("requirements_description", v)}
                placeholder="pl. Nem szükséges tapasztalat. Vagy: Számítógépes alapismeret szükséges." rows={3} />
            </Field>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-gray-700">Nyitott jelölttípusok</span>
              {[
                { key: "open_to_neurodivergent", label: "Neurodivergens jelöltekre is nyitottak vagyunk" },
                { key: "open_to_disabled",       label: "Megváltozott munkaképességű személyekre is nyitottak vagyunk" },
                { key: "open_to_parents",         label: "Érintett gyermeket nevelő szülőkre is nyitottak vagyunk" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!data[key]} onChange={(e) => set(key, e.target.checked)}
                    className="h-4 w-4 rounded accent-sni-brand-teal" />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2 – Munkaidő */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <Field label="Napi munkaidő" required hint="pl. 8 óra, 6 óra, 4–6 óra">
              <Input name="daily_hours" value={data.daily_hours as string} onChange={(v) => set("daily_hours", v)} placeholder="8 óra" required />
            </Field>
            <Field label="Munkaszervezés" hint="pl. Hétfő–Péntek, Kedd–Szombat">
              <Input name="working_days" value={data.working_days as string} onChange={(v) => set("working_days", v)} placeholder="Hétfő–Péntek" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kezdés időpontja">
                <Input name="working_hours_from" value={data.working_hours_from as string} onChange={(v) => set("working_hours_from", v)} placeholder="08:00" />
              </Field>
              <Field label="Befejezés időpontja">
                <Input name="working_hours_to" value={data.working_hours_to as string} onChange={(v) => set("working_hours_to", v)} placeholder="16:00" />
              </Field>
            </div>
            <Field label="Munkarend típusa">
              <Select name="schedule_type" value={data.schedule_type as string} onChange={(v) => set("schedule_type", v)}
                options={[
                  { value: "allando", label: "Állandó" },
                  { value: "elore_tervezheto", label: "Előre tervezhető" },
                  { value: "valtozo", label: "Változó" },
                  { value: "muszakos", label: "Műszakos" },
                ]}
              />
            </Field>
            <Field label="Részmunkaidő lehetséges?">
              <Select name="part_time_available" value={data.part_time_available as string} onChange={(v) => set("part_time_available", v)}
                options={[
                  { value: "", label: "Nem ismert" },
                  { value: "igen", label: "Igen" },
                  { value: "egyeztetes", label: "Egyeztetés alapján" },
                  { value: "nem", label: "Nem" },
                ]}
              />
            </Field>
            <Field label="Bér / juttatás" required hint="pl. 350 000 Ft/hó, 2 500 Ft/óra">
              <Input name="salary_range" value={data.salary_range as string} onChange={(v) => set("salary_range", v)} placeholder="350 000 Ft/hó" required />
            </Field>
            <Field label="Szünet leírása" hint="Mikor, mennyi szünet van?">
              <Input name="break_description" value={data.break_description as string} onChange={(v) => set("break_description", v)} placeholder="30 perces ebédszünet" />
            </Field>
          </div>
        )}

        {/* STEP 3 – Munkakörnyezet (piktogramok) */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Jelöld meg, ami igaz ennél az állásnál. Ezek jelennek meg piktogramként az álláshirdetésen.
            </p>
            <div>
              <p className="text-xs font-bold uppercase text-gray-400 mb-2">Kiszámíthatóság</p>
              <AttributePicker slugGroup={WIZARD_STEP_ATTRIBUTES.kiszamithatosag} selected={selectedAttrs} onToggle={toggleAttr} />
            </div>
            <div className="mt-2">
              <p className="text-xs font-bold uppercase text-gray-400 mb-2">Munkakörnyezet</p>
              <AttributePicker slugGroup={WIZARD_STEP_ATTRIBUTES.munkakornyzet} selected={selectedAttrs} onToggle={toggleAttr} />
            </div>
            <div className="mt-2">
              <p className="text-xs font-bold uppercase text-gray-400 mb-2">Munka jellege</p>
              <AttributePicker slugGroup={WIZARD_STEP_ATTRIBUTES.munka_jellege} selected={selectedAttrs} onToggle={toggleAttr} />
            </div>
            <div className="mt-2">
              <p className="text-xs font-bold uppercase text-gray-400 mb-2">Munkavégzés helye</p>
              <AttributePicker slugGroup={WIZARD_STEP_ATTRIBUTES.helyszin} selected={selectedAttrs} onToggle={toggleAttr} />
            </div>
            <div className="mt-2">
              <p className="text-xs font-bold uppercase text-gray-400 mb-2">Szünetek</p>
              <AttributePicker slugGroup={WIZARD_STEP_ATTRIBUTES.szunet} selected={selectedAttrs} onToggle={toggleAttr} />
            </div>
            <div className="mt-2">
              <p className="text-xs font-bold uppercase text-gray-400 mb-2">Megközelíthetőség</p>
              <AttributePicker slugGroup={WIZARD_STEP_ATTRIBUTES.megkozelites} selected={selectedAttrs} onToggle={toggleAttr} />
            </div>
            <div className="mt-2">
              <p className="text-xs font-bold uppercase text-gray-400 mb-2">Jelentkezési mód</p>
              <AttributePicker slugGroup={WIZARD_STEP_ATTRIBUTES.jelentkezes_mod} selected={selectedAttrs} onToggle={toggleAttr} />
            </div>
          </div>
        )}

        {/* STEP 4 – Betanítás és segítség */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-gray-400 mb-2">Betanítás és segítség</p>
              <AttributePicker slugGroup={WIZARD_STEP_ATTRIBUTES.betanitas} selected={selectedAttrs} onToggle={toggleAttr} />
            </div>
            <Field label="Hogyan történik a betanítás?" hint="Leírás – mi az első hetek menete?">
              <Textarea name="training_description" value={data.training_description as string}
                onChange={(v) => set("training_description", v)}
                placeholder="Az első héten minden feladatot egy betanítóval végzünk el együtt..." rows={4} />
            </Field>
            <Field label="Kijelölt mentor / betanító">
              <Select name="mentor_available" value={data.mentor_available as string} onChange={(v) => set("mentor_available", v)}
                options={[
                  { value: "van", label: "Van kijelölt betanító személy" },
                  { value: "meg_egyeztetes_alatt", label: "Egyeztetés alatt" },
                  { value: "nincs", label: "Nincs kijelölt személy" },
                ]}
              />
            </Field>
            <Field label="Kitől lehet segítséget kérni?" required hint="Ez a 'Kitől kérhetsz segítséget?' szekció tartalma az álláshirdetésen">
              <Textarea name="support_description" value={data.support_description as string}
                onChange={(v) => set("support_description", v)}
                placeholder="Kérdéssel a műszakvezetőhöz fordulhatsz. Minden nap van visszajelzés." rows={3} />
            </Field>
          </div>
        )}

        {/* STEP 5 – Jelentkezés és kiválasztás */}
        {step === 5 && (
          <div className="flex flex-col gap-4">
            <Field label="Jelentkezési e-mail" required>
              <Input name="application_email" type="email" value={data.application_email as string}
                onChange={(v) => set("application_email", v)} placeholder="hr@ceg.hu" required />
            </Field>
            <Field label="Szükséges dokumentumok" hint="pl. önéletrajz, motivációs levél">
              <Input name="required_documents" value={data.required_documents as string}
                onChange={(v) => set("required_documents", v)} placeholder="Önéletrajz" />
            </Field>
            <Field label="Kiválasztási folyamat" hint="Leírás: mi történik a jelentkezés után?">
              <Textarea name="interview_process" value={data.interview_process as string}
                onChange={(v) => set("interview_process", v)}
                placeholder="1. Önéletrajz átnézése&#10;2. Telefonos egyeztetés&#10;3. Személyes interjú&#10;4. Döntés" rows={4} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jelentkezési határidő">
                <Input name="application_deadline" type="date" value={data.application_deadline as string}
                  onChange={(v) => set("application_deadline", v)} />
              </Field>
              <Field label="Várható kezdés">
                <Input name="expected_start_date" value={data.expected_start_date as string}
                  onChange={(v) => set("expected_start_date", v)} placeholder="pl. 2026. október" />
              </Field>
            </div>
            <Field label="Kapcsolattartó neve" hint="Opcionális">
              <Input name="contact_name" value={data.contact_name as string} onChange={(v) => set("contact_name", v)} placeholder="Kovács Anna" />
            </Field>
            <Field label="Egyéb megjegyzés" hint="Opcionális">
              <Textarea name="notes" value={data.notes as string} onChange={(v) => set("notes", v)} rows={2} />
            </Field>
          </div>
        )}

        {/* STEP 6 – Átnézés */}
        {step === 6 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">Ellenőrizd az adatokat, majd küldd be jóváhagyásra.</p>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 flex flex-col gap-2 text-sm">
              <p><span className="font-semibold">Állás:</span> {data.title as string}</p>
              <p><span className="font-semibold">Helyszín:</span> {data.city as string}{data.county ? `, ${data.county}` : ""}</p>
              <p><span className="font-semibold">Munkatípus:</span> {data.work_type === "szellemi" ? "Szellemi" : "Fizikai"}</p>
              <p><span className="font-semibold">Munkaidő:</span> {data.daily_hours as string}</p>
              <p><span className="font-semibold">Bér:</span> {data.salary_range as string}</p>
              <p><span className="font-semibold">Jelentkezési e-mail:</span> {data.application_email as string}</p>
              {selectedAttrs.size > 0 && (
                <div>
                  <p className="font-semibold mb-1">Piktogramok ({selectedAttrs.size} db):</p>
                  <div className="flex flex-wrap gap-1">
                    {[...selectedAttrs].map((s) => (
                      <span key={s} className="rounded-full bg-sni-brand-teal/10 px-2 py-0.5 text-xs text-sni-brand-navy">
                        {ATTRIBUTE_LABELS[s]?.title ?? s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-700">
              A hirdetés beküldés után admin jóváhagyásra kerül, és csak ezután válik láthatóvá.
            </div>
            {submitError && (
              <p className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                {submitError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigáció */}
      <div className="mt-4 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="flex-1 rounded-full border border-gray-200 py-3 text-sm font-semibold text-gray-600 transition hover:border-gray-400"
          >
            ← Vissza
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed()}
            className="flex-1 rounded-full bg-sni-brand-navy py-3 text-sm font-bold text-white transition hover:bg-sni-brand-blue disabled:opacity-40"
          >
            Tovább →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !data.application_email}
            className="flex-1 rounded-full bg-sni-brand-teal py-3 text-sm font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white disabled:opacity-40"
          >
            {submitting ? "Küldés..." : "Hirdetés beküldése"}
          </button>
        )}
      </div>
    </div>
  );
}
