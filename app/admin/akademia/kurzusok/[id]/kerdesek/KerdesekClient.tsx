"use client";
import { useState, useTransition } from "react";
import { upsertQuestion } from "@/lib/academy/actions";
import type { AcademyQuestion } from "@/lib/academy/types";

interface Props {
  courseVersionId: string;
  initialQuestions: AcademyQuestion[];
}

const EMPTY_FORM = {
  id: undefined as string | undefined,
  questionText: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctAnswers: [] as string[],
  explanation: "",
  category: "",
  isCritical: false,
  isActive: true,
};

export default function KerdesekClient({ courseVersionId, initialQuestions }: Props) {
  const [questions, setQuestions] = useState<AcademyQuestion[]>(initialQuestions);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function editQuestion(q: AcademyQuestion) {
    setForm({
      id: q.id,
      questionText: q.question_text,
      optionA: q.option_a,
      optionB: q.option_b,
      optionC: q.option_c,
      optionD: q.option_d,
      correctAnswers: q.correct_answers,
      explanation: q.explanation,
      category: q.category,
      isCritical: q.is_critical,
      isActive: q.is_active,
    });
    setShowForm(true);
  }

  function toggleCorrect(opt: string) {
    setForm((f) => ({
      ...f,
      correctAnswers: f.correctAnswers.includes(opt)
        ? f.correctAnswers.filter((x) => x !== opt)
        : [...f.correctAnswers, opt],
    }));
  }

  function handleSave() {
    if (!form.questionText || !form.optionA || !form.optionB || !form.optionC || !form.optionD || form.correctAnswers.length === 0) {
      setError("Töltsd ki az összes kötelező mezőt, és jelölj meg legalább egy helyes választ.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await upsertQuestion({
        ...form,
        courseVersionId,
      });
      if (!res.ok) {
        setError(res.error ?? "Mentési hiba.");
        return;
      }
      // Reload page to get fresh data
      window.location.reload();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{questions.length} kérdés összesen</p>
        <button
          onClick={() => { setForm({ ...EMPTY_FORM }); setShowForm(true); setError(null); }}
          className="rounded-full bg-sni-brand-teal px-4 py-1.5 text-sm font-bold text-sni-brand-navy"
        >
          + Új kérdés
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-sni-brand-teal/30 bg-white shadow-soft p-6 mb-6">
          <h2 className="font-bold text-sni-text mb-4">{form.id ? "Kérdés szerkesztése" : "Új kérdés"}</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Kérdés szövege *</label>
              <textarea
                value={form.questionText}
                onChange={(e) => setForm((f) => ({ ...f, questionText: e.target.value }))}
                rows={2}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["A", "B", "C", "D"] as const).map((opt) => {
                const key = `option${opt}` as "optionA" | "optionB" | "optionC" | "optionD";
                const isCorrect = form.correctAnswers.includes(opt);
                return (
                  <div key={opt}>
                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1">
                      <input
                        type="checkbox"
                        checked={isCorrect}
                        onChange={() => toggleCorrect(opt)}
                        className="rounded"
                      />
                      {opt}) válasz {isCorrect && <span className="text-emerald-600">✓ helyes</span>}
                    </label>
                    <input
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-sm"
                      placeholder={`${opt} opció szövege`}
                    />
                  </div>
                );
              })}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Magyarázat (helyes válasz után megjelenik)</label>
              <textarea
                value={form.explanation}
                onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
                rows={2}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Kategória</label>
                <input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-sm"
                  placeholder="pl. adatvédelem"
                />
              </div>
              <div className="flex items-end gap-4 pb-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isCritical}
                    onChange={(e) => setForm((f) => ({ ...f, isCritical: e.target.checked }))}
                  />
                  <span className="font-semibold text-red-600">Kritikus kérdés</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  />
                  Aktív
                </label>
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy disabled:opacity-50"
            >
              {isPending ? "Mentés..." : "Mentés"}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-500">
              Mégse
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {questions.map((q, idx) => (
          <div key={q.id} className="rounded-xl border border-gray-100 bg-white px-4 py-3 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs text-gray-400">#{idx + 1}</span>
                {q.is_critical && <span className="rounded-full bg-red-100 text-red-600 text-xs px-2 py-0.5 font-semibold">Kritikus</span>}
                {!q.is_active && <span className="rounded-full bg-gray-100 text-gray-400 text-xs px-2 py-0.5">Inaktív</span>}
                {q.category && <span className="text-xs text-gray-400">{q.category}</span>}
              </div>
              <p className="text-sm font-medium text-sni-text truncate">{q.question_text}</p>
              <p className="text-xs text-emerald-600 mt-0.5">Helyes: {q.correct_answers.join(", ")}</p>
            </div>
            <button
              onClick={() => editQuestion(q)}
              className="text-xs text-sni-brand-blue underline hover:no-underline shrink-0"
            >
              Szerkesztés
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
