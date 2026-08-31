"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { prepareTestAttempt, submitTestAttempt } from "@/lib/academy/actions";
import type { AcademyQuestion } from "@/lib/academy/types";

interface Props {
  enrollmentId: string;
  token: string;
}

type Phase = "loading" | "error" | "question" | "submitting" | "done";

const OPTIONS = ["A", "B", "C", "D"] as const;

function getOptionText(q: AcademyQuestion, opt: string): string {
  if (opt === "A") return q.option_a;
  if (opt === "B") return q.option_b;
  if (opt === "C") return q.option_c;
  return q.option_d;
}

export default function TestEngine({ enrollmentId, token }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AcademyQuestion[]>([]);
  const [passingScore, setPassingScore] = useState(80);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<{ score: number; passed: boolean; failedCritical: boolean } | null>(null);

  useEffect(() => {
    prepareTestAttempt(enrollmentId).then((res) => {
      if (!res.ok || !res.attemptId || !res.questions) {
        setError(res.error ?? "Teszt indítása sikertelen.");
        setPhase("error");
        return;
      }
      setAttemptId(res.attemptId);
      setQuestions(res.questions);
      setPassingScore(res.passingScore ?? 80);
      setPhase("question");
    });
  }, [enrollmentId]);

  function toggleOption(opt: string) {
    const q = questions[current];
    if (!q) return;
    // Single or multi based on correct_answers length
    const isMulti = q.correct_answers.length > 1;
    if (isMulti) {
      setSelected((prev) =>
        prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
      );
    } else {
      setSelected([opt]);
    }
  }

  function handleNext() {
    const q = questions[current];
    if (!q || selected.length === 0) return;

    const newAnswers = { ...answers, [q.id]: selected };
    setAnswers(newAnswers);
    setSelected([]);

    if (current + 1 < questions.length) {
      setCurrent((c) => c + 1);
    } else {
      // Last question — submit
      handleSubmit(newAnswers);
    }
  }

  async function handleSubmit(finalAnswers: Record<string, string[]>) {
    if (!attemptId) return;
    setPhase("submitting");

    const answerList = Object.entries(finalAnswers).map(([questionId, selectedAnswers]) => ({
      questionId,
      selectedAnswers,
    }));

    const res = await submitTestAttempt(attemptId, enrollmentId, answerList);
    if (!res.ok) {
      setError(res.error ?? "Beküldés sikertelen.");
      setPhase("error");
      return;
    }

    setResult({
      score: res.score ?? 0,
      passed: res.passed ?? false,
      failedCritical: res.failedCritical ?? false,
    });
    setPhase("done");
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
        Teszt betöltése...
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 px-6 py-5 text-red-700">
        <p className="font-semibold">Hiba</p>
        <p className="text-sm mt-1">{error}</p>
        <a
          href={`/akademia/meghivo/${token}`}
          className="mt-4 inline-block text-sm underline"
        >
          Vissza a kezdőlaphoz
        </a>
      </div>
    );
  }

  if (phase === "done" && result) {
    const passed = result.passed;
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className={`text-6xl mb-4`}>{passed ? "🎉" : "😔"}</div>
        <h2 className="text-2xl font-bold text-sni-text mb-2">
          {passed ? "Gratulálunk! Átmentél a teszten." : "Sajnos nem sikerült ezúttal."}
        </h2>
        <p className="text-gray-500 text-sm mb-1">Eredmény: {result.score}%</p>
        <p className="text-gray-400 text-xs mb-6">Szükséges: {passingScore}%</p>
        {result.failedCritical && (
          <p className="text-xs text-red-600 mb-4">
            Egy kötelező (kritikus) kérdésre helytelen választ adtál.
          </p>
        )}
        <a
          href={`/akademia/meghivo/${token}/eredmeny`}
          className={`inline-block rounded-full px-6 py-2.5 text-sm font-bold transition ${
            passed
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "bg-sni-brand-teal text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white"
          }`}
        >
          {passed ? "Igazolás megtekintése" : "Eredmény megtekintése"}
        </a>
      </div>
    );
  }

  if (phase === "submitting") {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
        Beküldés folyamatban...
      </div>
    );
  }

  // Phase === "question"
  const q = questions[current];
  if (!q) return null;

  const isMulti = q.correct_answers.length > 1;
  const progress = ((current + 1) / questions.length) * 100;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex-1 h-2 rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-sni-brand-teal transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 shrink-0">
          {current + 1} / {questions.length}
        </span>
      </div>

      {/* Question card */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-soft p-6 mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
          {isMulti ? "Több helyes válasz lehetséges" : "Egyetlen helyes válasz"}
        </p>
        <p className="text-base font-semibold text-sni-text mb-6 leading-snug">
          {q.question_text}
        </p>

        <div className="space-y-3">
          {OPTIONS.map((opt) => {
            const optText = getOptionText(q, opt);
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => toggleOption(opt)}
                className={`w-full flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                  isSelected
                    ? "border-sni-brand-teal bg-sni-brand-teal/10 font-semibold text-sni-brand-navy"
                    : "border-gray-200 bg-white hover:border-sni-brand-teal text-gray-700"
                }`}
              >
                <span className={`shrink-0 mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center text-xs ${
                  isSelected ? "border-sni-brand-teal bg-sni-brand-teal text-white" : "border-gray-300"
                }`}>
                  {isSelected && "✓"}
                </span>
                <span>
                  <span className="font-bold mr-1">{opt})</span>
                  {optText}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleNext}
          disabled={selected.length === 0}
          className="rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition disabled:opacity-40"
        >
          {current + 1 === questions.length ? "Befejezés és beküldés" : "Következő →"}
        </button>
      </div>
    </div>
  );
}
