"use client";

import { useState } from "react";

interface Question {
  id: string;
  question: string;
  hint?: string;
  options: { label: string; value: string; filterKey?: string; filterValue?: string }[];
  multi?: boolean;
}

const QUESTIONS: Question[] = [
  {
    id: "when",
    question: "Mikor tudnál dolgozni?",
    hint: "Válaszd azt, ami a legjobban illik a mindennapjaidhoz.",
    multi: true,
    options: [
      { label: "Reggeltől kora délutánig", value: "morning" },
      { label: "Rugalmasan, magam osztom be", value: "flexible", filterKey: "work_type", filterValue: "rugalmas_munkaido" },
      { label: "Részmunkaidőben (kevesebb órában)", value: "parttime", filterKey: "work_type", filterValue: "reszmunkaido" },
      { label: "Hétvégén nem szeretnék dolgozni", value: "noweekend", filterKey: "work_type", filterValue: "hetvegi_munka_nincs" },
    ],
  },
  {
    id: "where",
    question: "Hol tudnál dolgozni?",
    options: [
      { label: "Otthonról", value: "home", filterKey: "location_type", filterValue: "otthon" },
      { label: "Munkahelyen (irodában, üzletben, gyárban)", value: "onsite", filterKey: "location_type", filterValue: "helyszinen" },
      { label: "Mindkettő jó lenne", value: "hybrid", filterKey: "location_type", filterValue: "helyszin_es_otthon" },
      { label: "Nem tudom még", value: "unknown" },
    ],
  },
  {
    id: "env",
    question: "Milyen munkakörnyezetben éreznéd jól magad?",
    hint: "Nem kell mindent tudni – válaszd, ami leginkább igaz rád.",
    multi: true,
    options: [
      { label: "Csendesebb helyen", value: "quiet", filterKey: "attribute", filterValue: "csendes_kornyezet" },
      { label: "Ahol kevés kolléga van", value: "small_team", filterKey: "attribute", filterValue: "kis_csapat" },
      { label: "Ahol kiszámítható a napirend", value: "predictable", filterKey: "attribute", filterValue: "kiszamithato_munkarend" },
      { label: "Ahol egyértelmű feladatokat kapok", value: "clear_tasks", filterKey: "attribute", filterValue: "egyertelmu_feladatok" },
    ],
  },
  {
    id: "communication",
    question: "Mennyi kommunikáció illik hozzád?",
    options: [
      { label: "Inkább kevesebb (főleg írásban)", value: "low", filterKey: "attribute", filterValue: "keves_beszelgetes" },
      { label: "Közepes (van megbeszélés, de nem sok)", value: "medium" },
      { label: "Sok kapcsolattartás is belefér", value: "high", filterKey: "attribute", filterValue: "sok_kommunikacio" },
      { label: "Mindegy", value: "any" },
    ],
  },
  {
    id: "task_type",
    question: "Milyen feladatok illenek hozzád?",
    multi: true,
    options: [
      { label: "Ismétlődő, kiszámítható feladatok", value: "repetitive", filterKey: "attribute", filterValue: "ismetlodo_feladatok" },
      { label: "Változatos, sokféle feladat", value: "varied", filterKey: "attribute", filterValue: "valtozatos_feladatok" },
      { label: "Önállóan végzett munka", value: "independent", filterKey: "attribute", filterValue: "onallo_munkavegzes" },
      { label: "Csapatban végzett munka", value: "team", filterKey: "attribute", filterValue: "csapatmunka" },
    ],
  },
  {
    id: "support",
    question: "Miben lenne szükséged segítségre az elején?",
    hint: "Ez segít szűrni, milyen munkahely illik hozzád.",
    multi: true,
    options: [
      { label: "Kijelölt segítő, aki megmutatja a dolgokat", value: "mentor", filterKey: "attribute", filterValue: "kijelolt_segito" },
      { label: "Fokozatos betanítás (nem kell azonnal mindent tudni)", value: "training", filterKey: "attribute", filterValue: "fokozatos_betanitas" },
      { label: "Írásos feladatleírás, amit vissza lehet nézni", value: "written", filterKey: "attribute", filterValue: "irasos_feladatok" },
      { label: "Nem kell különleges segítség", value: "none" },
    ],
  },
  {
    id: "apply_how",
    question: "Hogyan szeretnél jelentkezni?",
    multi: true,
    options: [
      { label: "E-mailben", value: "email", filterKey: "attribute", filterValue: "emailes_jelentkezes" },
      { label: "Telefonon", value: "phone", filterKey: "attribute", filterValue: "telefonos_jelentkezes" },
      { label: "Önéletrajzzal / bemutatkozó lappal", value: "cv", filterKey: "attribute", filterValue: "jelentkezes_oneletrajzzal" },
      { label: "Mindegy, ahogy a munkáltató kéri", value: "any" },
    ],
  },
  {
    id: "importance",
    question: "Mi a legfontosabb számodra egy munkánál?",
    hint: "Csak egyet válassz.",
    options: [
      { label: "Kiszámítható időbeosztás", value: "schedule" },
      { label: "Otthonról végezhető", value: "home" },
      { label: "Kevés stressz, kiszámítható feladatok", value: "calm" },
      { label: "Jó fizetés / megbízható bevétel", value: "income" },
    ],
  },
  {
    id: "transport",
    question: "Hogyan tudnál eljutni a munkahelyre (ha nem otthonról dolgoznál)?",
    options: [
      { label: "Tömegközlekedéssel", value: "public", filterKey: "attribute", filterValue: "tomegkozlekedessel_elerheto" },
      { label: "Autóval, parkolóval", value: "car", filterKey: "attribute", filterValue: "parkolas" },
      { label: "Munkahelyi busszal", value: "company_bus", filterKey: "attribute", filterValue: "ceges_busz" },
      { label: "Nem tudom / nem releváns", value: "any" },
    ],
  },
];

type Answers = Record<string, string[]>;

function buildFilters(answers: Answers): { label: string; slug: string }[] {
  const seen = new Set<string>();
  const filters: { label: string; slug: string }[] = [];

  for (const [qid, vals] of Object.entries(answers)) {
    const q = QUESTIONS.find((x) => x.id === qid);
    if (!q) continue;
    for (const v of vals) {
      const opt = q.options.find((o) => o.value === v);
      if (opt?.filterKey && opt?.filterValue && !seen.has(opt.filterValue)) {
        seen.add(opt.filterValue);
        filters.push({ label: opt.label, slug: opt.filterValue });
      }
    }
  }
  return filters;
}

export default function KarrieriranytClient() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [done, setDone] = useState(false);

  const q = QUESTIONS[step];
  const currentVals = answers[q?.id] ?? [];

  function toggle(value: string) {
    if (!q) return;
    const prev = answers[q.id] ?? [];
    if (q.multi) {
      setAnswers((a) => ({
        ...a,
        [q.id]: prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
      }));
    } else {
      setAnswers((a) => ({ ...a, [q.id]: [value] }));
    }
  }

  function next() {
    if (step < QUESTIONS.length - 1) setStep((s) => s + 1);
    else setDone(true);
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  if (done) {
    const filters = buildFilters(answers);
    const params = new URLSearchParams();
    // Szűrők összegyűjtése az URL-hez (első találatokat adjuk hozzá)
    const attrs: string[] = [];
    const locType: string[] = [];
    const workType: string[] = [];
    for (const [qid, vals] of Object.entries(answers)) {
      const q = QUESTIONS.find((x) => x.id === qid);
      if (!q) continue;
      for (const v of vals) {
        const opt = q.options.find((o) => o.value === v);
        if (!opt?.filterKey) continue;
        if (opt.filterKey === "attribute") attrs.push(opt.filterValue!);
        if (opt.filterKey === "location_type") locType.push(opt.filterValue!);
        if (opt.filterKey === "work_type") workType.push(opt.filterValue!);
      }
    }
    if (attrs.length) params.set("attr", attrs.join(","));
    if (locType.length) params.set("loc", locType[0]);
    if (workType.length) params.set("wt", workType[0]);

    const searchUrl = `/vedettmunka/allasok${params.toString() ? "?" + params.toString() : ""}`;

    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2 text-sni-brand-teal font-bold text-lg">
          <span aria-hidden>🧭</span> Ezek illenek a válaszaidhoz
        </div>
        <p className="text-sm text-gray-600">
          A Karrieriránytű alapján a következő szempontokat érdemes keresned a lehetőségeknél:
        </p>
        {filters.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <span
                key={f.slug}
                className="rounded-full border border-sni-brand-teal/30 bg-sni-brand-teal/5 px-3 py-1 text-sm font-semibold text-sni-brand-navy"
              >
                {f.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Még nem derült ki konkrét szűrő — böngéssz szabadon!</p>
        )}
        <div className="mt-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-800">
          Ez nem diagnózis és nem alkalmassági értékelés. A Karrieriránytű segít átgondolni, mire érdemes figyelni
          egy lehetőség keresésekor. A döntés mindig a tiéd.
        </div>
        <div className="flex flex-wrap gap-3 mt-2">
          <a
            href={searchUrl}
            className="rounded-full bg-sni-brand-teal px-6 py-3 font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white"
          >
            Lehetőségek böngészése
          </a>
          <button
            onClick={() => { setDone(false); setStep(0); setAnswers({}); }}
            className="rounded-full border border-gray-200 px-6 py-3 font-semibold text-gray-600 hover:border-sni-brand-teal"
          >
            Újrakezdem
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Haladás */}
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-full bg-gray-100 h-1.5 overflow-hidden">
          <div
            className="bg-sni-brand-teal h-1.5 rounded-full transition-all"
            style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 shrink-0">{step + 1} / {QUESTIONS.length}</span>
      </div>

      {/* Kérdés */}
      <div>
        <p className="text-base font-bold text-sni-brand-navy">{q.question}</p>
        {q.hint && <p className="mt-0.5 text-xs text-gray-400">{q.hint}</p>}
        {q.multi && (
          <p className="mt-0.5 text-xs text-sni-brand-teal font-semibold">Többet is választhatsz.</p>
        )}
      </div>

      {/* Válaszok */}
      <div className="flex flex-col gap-2">
        {q.options.map((opt) => {
          const selected = currentVals.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                selected
                  ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-navy"
                  : "border-gray-200 text-gray-700 hover:border-sni-brand-teal"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Navigáció */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="rounded-full border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-500 hover:border-gray-400 disabled:opacity-30"
        >
          ← Vissza
        </button>
        <button
          type="button"
          onClick={next}
          className="rounded-full bg-sni-brand-navy px-6 py-2 text-sm font-bold text-white transition hover:bg-sni-brand-blue"
        >
          {step === QUESTIONS.length - 1 ? "Eredmény megtekintése →" : "Tovább →"}
        </button>
      </div>
    </div>
  );
}
