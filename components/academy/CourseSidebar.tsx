"use client";
import Link from "next/link";
import type { AcademyModule, AcademyLesson } from "@/lib/academy/types";

interface Props {
  token: string;
  modules: (AcademyModule & { lessons: AcademyLesson[] })[];
  completedLessonIds: string[];
  currentLessonId?: string;
  courseTitle: string;
}

export default function CourseSidebar({
  token,
  modules,
  completedLessonIds,
  currentLessonId,
  courseTitle,
}: Props) {
  const completedSet = new Set(completedLessonIds);

  return (
    <aside className="w-64 shrink-0 hidden lg:flex flex-col gap-2 sticky top-0 max-h-screen overflow-y-auto pr-2">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3 px-2">
        {courseTitle}
      </p>

      {modules.map((mod) => (
        <div key={mod.id} className="mb-3">
          <p className="text-xs font-bold text-sni-brand-navy uppercase tracking-wide px-2 mb-1">
            {mod.title}
          </p>
          <ul className="space-y-0.5">
            {mod.lessons.map((lesson) => {
              const isCurrent = lesson.id === currentLessonId;
              const isDone = completedSet.has(lesson.id);

              let icon = "○";
              let iconColor = "text-gray-300";
              if (isDone) { icon = "✓"; iconColor = "text-emerald-500"; }
              else if (isCurrent) { icon = "●"; iconColor = "text-sni-brand-teal"; }

              return (
                <li key={lesson.id}>
                  <Link
                    href={`/akademia/meghivo/${token}/tananyag/${lesson.id}`}
                    className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors ${
                      isCurrent
                        ? "bg-sni-brand-teal/10 text-sni-brand-navy font-semibold"
                        : "hover:bg-gray-100 text-gray-600"
                    }`}
                  >
                    <span className={`mt-0.5 text-xs shrink-0 font-bold ${iconColor}`}>{icon}</span>
                    <span className="leading-snug">{lesson.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}
