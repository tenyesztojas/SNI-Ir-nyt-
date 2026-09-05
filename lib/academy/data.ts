import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  AcademyCourse,
  AcademyCourseVersion,
  AcademyModule,
  AcademyLesson,
  AcademyContentBlock,
  AcademyQuestion,
  AcademyParticipant,
  AcademyEnrollment,
  AcademyInvitation,
  AcademyLessonProgress,
  AcademyTestAttempt,
  AcademyCertificate,
  AcademyPartnerSettings,
  AcademyTokenContext,
} from "./types";
import { createHash } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────────────────────

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Magic link validation (no auth required)
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveInvitationToken(
  rawToken: string
): Promise<AcademyTokenContext | null> {
  const admin = createAdminClient();
  const tokenHash = hashToken(rawToken);

  const { data: inv } = await admin
    .from("academy_invitations")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!inv) return null;
  if (inv.revoked_at) return null;
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return null;

  const { data: enrollment } = await admin
    .from("academy_enrollments")
    .select(`
      *,
      participant:academy_participants(*),
      course_version:academy_course_versions(
        *,
        course:academy_courses(*)
      )
    `)
    .eq("id", inv.enrollment_id)
    .maybeSingle();

  if (!enrollment) return null;
  if (enrollment.status === "revoked") return null;

  const { data: provider } = await admin
    .from("provider_profiles")
    .select("company_name")
    .eq("id", enrollment.partner_id)
    .maybeSingle();

  const participant = enrollment.participant as AcademyParticipant;
  const courseVersion = enrollment.course_version as AcademyCourseVersion & { course: AcademyCourse };

  return {
    invitation: inv as AcademyInvitation,
    enrollment: enrollment as AcademyEnrollment,
    participant,
    courseVersion,
    partnerName: provider?.company_name ?? "Partner",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner adatok (bejelentkezett Védett Partner felhasználó)
// ─────────────────────────────────────────────────────────────────────────────

/** Visszaadja a bejelentkezett user provider_profiles.id-ját, vagy null-t */
export async function getCurrentPartnerId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("provider_profiles")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();

  return data?.id ?? null;
}

export async function getPartnerProfile(partnerId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("provider_profiles")
    .select("id, company_name")
    .eq("id", partnerId)
    .maybeSingle();
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner dashboard stats
// ─────────────────────────────────────────────────────────────────────────────

export async function getPartnerAcademyStats(partnerId: string) {
  const admin = createAdminClient();

  const [enrollmentsRes, settingsRes] = await Promise.all([
    admin
      .from("academy_enrollments")
      .select("status, progress_percent")
      .eq("partner_id", partnerId),
    admin
      .from("academy_partner_settings")
      .select("frontline_employee_count, annual_confirmed_at")
      .eq("partner_id", partnerId)
      .maybeSingle(),
  ]);

  const enrollments = enrollmentsRes.data ?? [];
  const frontline = settingsRes.data?.frontline_employee_count ?? 0;
  const annualConfirmedAt = settingsRes.data?.annual_confirmed_at ?? null;

  const total = enrollments.length;
  const invited = enrollments.filter((e) => e.status === "invited").length;
  const opened = enrollments.filter((e) => ["opened", "in_progress", "course_completed", "test_in_progress", "test_failed"].includes(e.status)).length;
  const completed = enrollments.filter((e) => e.status === "completed").length;
  const notStarted = enrollments.filter((e) => e.status === "invited").length;
  const coverage = frontline > 0 ? Math.round((completed / frontline) * 100) : 0;

  return { total, invited, opened, completed, notStarted, frontline, coverage, annualConfirmedAt };
}

// ─────────────────────────────────────────────────────────────────────────────
// Munkatársak
// ─────────────────────────────────────────────────────────────────────────────

export async function getPartnerParticipants(partnerId: string): Promise<
  (AcademyParticipant & {
    enrollment?: AcademyEnrollment & { certificate?: AcademyCertificate };
  })[]
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("academy_participants")
    .select(`
      *,
      enrollment:academy_enrollments(
        *,
        course_version:academy_course_versions(version, course:academy_courses(title)),
        certificate:academy_certificates(certificate_code, status, issued_at, expires_at, test_score)
      )
    `)
    .eq("partner_id", partnerId)
    .order("last_name", { ascending: true });

  return (data ?? []) as (AcademyParticipant & {
    enrollment?: AcademyEnrollment & { certificate?: AcademyCertificate };
  })[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Teljesítések
// ─────────────────────────────────────────────────────────────────────────────

export async function getPartnerEnrollments(partnerId: string): Promise<AcademyEnrollment[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("academy_enrollments")
    .select(`
      *,
      participant:academy_participants(first_name, last_name, email, location, job_role),
      course_version:academy_course_versions(version, course:academy_courses(title)),
      certificate:academy_certificates(certificate_code, status, issued_at, test_score)
    `)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false });

  return (data ?? []) as AcademyEnrollment[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Igazolások
// ─────────────────────────────────────────────────────────────────────────────

export async function getPartnerCertificates(partnerId: string): Promise<AcademyCertificate[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("academy_certificates")
    .select(`
      *,
      enrollment:academy_enrollments(
        *,
        participant:academy_participants(first_name, last_name, email),
        course_version:academy_course_versions(version, course:academy_courses(title))
      )
    `)
    .eq("enrollment.partner_id" as string, partnerId)
    .order("issued_at", { ascending: false });

  return (data ?? []) as AcademyCertificate[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Kurzusok (admin)
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllCourses(): Promise<AcademyCourse[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("academy_courses")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as AcademyCourse[];
}

export async function getCourseWithVersions(courseId: string): Promise<
  (AcademyCourse & { versions: AcademyCourseVersion[] }) | null
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("academy_courses")
    .select(`*, versions:academy_course_versions(*)`)
    .eq("id", courseId)
    .maybeSingle();
  return data as (AcademyCourse & { versions: AcademyCourseVersion[] }) | null;
}

export async function getCourseVersionWithContent(versionId: string): Promise<
  (AcademyCourseVersion & {
    course: AcademyCourse;
    modules: (AcademyModule & { lessons: (AcademyLesson & { content_blocks: AcademyContentBlock[] })[] })[];
  }) | null
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("academy_course_versions")
    .select(`
      *,
      course:academy_courses(*),
      modules:academy_modules(
        *,
        lessons:academy_lessons(
          *,
          content_blocks:academy_content_blocks(*)
        )
      )
    `)
    .eq("id", versionId)
    .maybeSingle();

  if (!data) return null;

  // Rendezés display_order szerint
  const d = data as AcademyCourseVersion & {
    course: AcademyCourse;
    modules: (AcademyModule & { lessons: (AcademyLesson & { content_blocks: AcademyContentBlock[] })[] })[];
  };

  d.modules.sort((a, b) => a.display_order - b.display_order);
  d.modules.forEach((m) => {
    m.lessons.sort((a, b) => a.display_order - b.display_order);
    m.lessons.forEach((l) => {
      l.content_blocks?.sort((a, b) => a.display_order - b.display_order);
    });
  });

  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Kérdésbank (admin)
// ─────────────────────────────────────────────────────────────────────────────

export async function getQuestionsForVersion(versionId: string): Promise<AcademyQuestion[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("academy_question_bank")
    .select("*")
    .eq("course_version_id", versionId)
    .order("created_at", { ascending: true });
  return (data ?? []) as AcademyQuestion[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Participant lecke-haladás
// ─────────────────────────────────────────────────────────────────────────────

export async function getEnrollmentProgress(enrollmentId: string): Promise<AcademyLessonProgress[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("academy_lesson_progress")
    .select("*")
    .eq("enrollment_id", enrollmentId);
  return (data ?? []) as AcademyLessonProgress[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Teszt kérdések (randomizált) a résztvevőnek
// ─────────────────────────────────────────────────────────────────────────────

export async function getRandomizedTestQuestions(
  versionId: string,
  count: number
): Promise<AcademyQuestion[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("academy_question_bank")
    .select("*")
    .eq("course_version_id", versionId)
    .eq("is_active", true);

  const all = (data ?? []) as AcademyQuestion[];

  // Kritikus kérdések mindig benne vannak
  const critical = all.filter((q) => q.is_critical);
  const nonCritical = all.filter((q) => !q.is_critical);

  // Keverés
  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const shuffledCritical = shuffle(critical);
  const shuffledNonCritical = shuffle(nonCritical);

  const needed = Math.max(count, shuffledCritical.length);
  const nonCriticalCount = needed - shuffledCritical.length;

  const result = [
    ...shuffledCritical,
    ...shuffledNonCritical.slice(0, nonCriticalCount),
  ];

  return shuffle(result);
}

// ─────────────────────────────────────────────────────────────────────────────
// Igazolás publikus ellenőrzés
// ─────────────────────────────────────────────────────────────────────────────

export async function getCertificateByCode(code: string): Promise<{
  certificate: AcademyCertificate;
  participantName: string;
  courseName: string;
  courseVersion: string;
  partnerName: string;
} | null> {
  const admin = createAdminClient();
  const { data: cert } = await admin
    .from("academy_certificates")
    .select(`
      *,
      enrollment:academy_enrollments(
        partner_id,
        participant:academy_participants(first_name, last_name),
        course_version:academy_course_versions(
          version,
          course:academy_courses(title)
        )
      )
    `)
    .eq("certificate_code", code)
    .maybeSingle();

  if (!cert) return null;

  const enr = cert.enrollment as {
    partner_id: string;
    participant: { first_name: string; last_name: string };
    course_version: { version: string; course: { title: string } };
  };

  const { data: partner } = await admin
    .from("provider_profiles")
    .select("company_name")
    .eq("id", enr.partner_id)
    .maybeSingle();

  return {
    certificate: cert as AcademyCertificate,
    participantName: `${enr.participant.last_name} ${enr.participant.first_name}`,
    courseName: enr.course_version.course.title,
    courseVersion: enr.course_version.version,
    partnerName: partner?.company_name ?? "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: minden enrollment
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllEnrollments(filters?: {
  partnerId?: string;
  courseVersionId?: string;
  status?: string;
}): Promise<AcademyEnrollment[]> {
  const admin = createAdminClient();
  let query = admin
    .from("academy_enrollments")
    .select(`
      *,
      participant:academy_participants(first_name, last_name, email),
      course_version:academy_course_versions(version, course:academy_courses(title)),
      certificate:academy_certificates(certificate_code, status, issued_at, test_score)
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters?.partnerId) query = query.eq("partner_id", filters.partnerId);
  if (filters?.courseVersionId) query = query.eq("course_version_id", filters.courseVersionId);
  if (filters?.status) query = query.eq("status", filters.status);

  const { data } = await query;
  return (data ?? []) as AcademyEnrollment[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner settings
// ─────────────────────────────────────────────────────────────────────────────

export async function getPartnerSettings(
  partnerId: string
): Promise<AcademyPartnerSettings | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("academy_partner_settings")
    .select("*")
    .eq("partner_id", partnerId)
    .maybeSingle();
  return data as AcademyPartnerSettings | null;
}
