"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeLessonAction } from "@/lib/academy/actions";

interface Props {
  enrollmentId: string;
  lessonId: string;
  allRequiredLessonIds: string[];
  nextLessonHref?: string;
  testHref: string;
  isCourseCompleted: boolean;
  isAlreadyDone: boolean;
}

export default function LessonCompleteButton({
  enrollmentId,
  lessonId,
  allRequiredLessonIds,
  nextLessonHref,
  testHref,
  isCourseCompleted,
  isAlreadyDone,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleComplete() {
    startTransition(async () => {
      const res = await completeLessonAction(enrollmentId, lessonId, allRequiredLessonIds);
      if (!res.ok) {
        setError("Hiba a mentés során.");
        return;
      }

      if (res.allDone || isCourseCompleted) {
        router.push(testHref);
      } else if (nextLessonHref) {
        router.push(nextLessonHref);
      } else {
        router.push(testHref);
      }
      router.refresh();
    });
  }

  if (isAlreadyDone && nextLessonHref) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-emerald-600 font-semibold">✓ Elvégezve</span>
        <a
          href={nextLessonHref}
          className="rounded-full bg-sni-brand-teal px-5 py-2.5 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition"
        >
          Következő lecke →
        </a>
      </div>
    );
  }

  if (isAlreadyDone) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-emerald-600 font-semibold">✓ Elvégezve</span>
        <a
          href={testHref}
          className="rounded-full bg-sni-brand-teal px-5 py-2.5 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition"
        >
          Ugrás a teszthez →
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleComplete}
        disabled={isPending}
        className="rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition disabled:opacity-50"
      >
        {isPending ? "Mentés..." : "Elvégeztem ezt a leckét ✓"}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
