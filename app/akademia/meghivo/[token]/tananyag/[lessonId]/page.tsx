import { resolveInvitationToken } from "@/lib/academy/data";
import { getCourseVersionWithContent, getEnrollmentProgress } from "@/lib/academy/data";
import CourseSidebar from "@/components/academy/CourseSidebar";
import ContentBlock from "@/components/academy/ContentBlock";
import LessonCompleteButton from "@/components/academy/LessonCompleteButton";
import Link from "next/link";
import type { AcademyModule, AcademyLesson, AcademyContentBlock } from "@/lib/academy/types";

interface Props {
  params: { token: string; lessonId: string };
}

export default async function TananyagPage({ params }: Props) {
  const { token, lessonId } = params;
  const ctx = await resolveInvitationToken(token);

  if (!ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-5xl mb-4">🔗</p>
          <h1 className="text-xl font-bold text-sni-text mb-2">Érvénytelen link</h1>
          <p className="text-sm text-gray-500">Kérj új meghívót a munkáltatódtól.</p>
        </div>
      </div>
    );
  }

  const { enrollment, courseVersion, participant } = ctx;
  const course = await getCourseVersionWithContent(courseVersion.id);

  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">A képzési anyag nem érhető el.</p>
      </div>
    );
  }

  const progress = await getEnrollmentProgress(enrollment.id);
  const completedLessonIds = progress.map((p) => p.lesson_id);

  // Collect all lessons in order
  const allLessons = course.modules.flatMap((m) => m.lessons);
  const allLessonIds = allLessons.map((l) => l.id);

  // Find current lesson
  const currentLesson = allLessons.find((l) => l.id === lessonId);
  if (!currentLesson) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Lecke nem található.</p>
      </div>
    );
  }

  // Find next lesson
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const nextLesson = currentIndex >= 0 && currentIndex + 1 < allLessons.length
    ? allLessons[currentIndex + 1]
    : null;

  const nextLessonHref = nextLesson
    ? `/akademia/meghivo/${token}/tananyag/${nextLesson.id}`
    : undefined;

  const testHref = `/akademia/meghivo/${token}/teszt`;
  const isAlreadyDone = completedLessonIds.includes(lessonId);
  const isCourseCompleted = allLessonIds.every((id) => completedLessonIds.includes(id));

  // Find the lesson content blocks (from the module's lesson data)
  let contentBlocks: AcademyContentBlock[] = [];
  for (const mod of course.modules) {
    const found = mod.lessons.find((l) => l.id === lessonId);
    if (found) {
      contentBlocks = found.content_blocks ?? [];
      break;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 flex items-center justify-between">
          <Link
            href={`/akademia/meghivo/${token}`}
            className="text-xs text-gray-500 hover:text-sni-brand-blue flex items-center gap-1"
          >
            ← Vissza a kezdőlaphoz
          </Link>
          <div className="text-xs text-gray-400">
            {participant.last_name} {participant.first_name}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 flex gap-8">
        {/* Sidebar */}
        <CourseSidebar
          token={token}
          modules={course.modules as (AcademyModule & { lessons: AcademyLesson[] })[]}
          completedLessonIds={completedLessonIds}
          currentLessonId={lessonId}
          courseTitle={course.course.title}
        />

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="rounded-2xl border border-gray-100 bg-white shadow-soft px-8 py-8 mb-6">
            <h1 className="text-xl font-bold text-sni-brand-navy mb-6">{currentLesson.title}</h1>

            <div className="flex flex-col gap-5">
              {contentBlocks.length > 0 ? (
                contentBlocks.map((block) => (
                  <ContentBlock key={block.id} block={block} />
                ))
              ) : (
                <p className="text-sm text-gray-400 italic">Ez a lecke még nem tartalmaz tartalmat.</p>
              )}
            </div>
          </div>

          {/* Completion button */}
          <div className="flex justify-end">
            <LessonCompleteButton
              enrollmentId={enrollment.id}
              lessonId={lessonId}
              allRequiredLessonIds={allLessonIds}
              nextLessonHref={nextLessonHref}
              testHref={testHref}
              isCourseCompleted={isCourseCompleted}
              isAlreadyDone={isAlreadyDone}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
