// ── Státusz típusok ────────────────────────────────────────────────────────

export type CourseStatus = "draft" | "published" | "archived";
export type EnrollmentStatus =
  | "invited"
  | "opened"
  | "in_progress"
  | "course_completed"
  | "test_in_progress"
  | "test_failed"
  | "completed"
  | "expired"
  | "revoked";
export type CertificateStatus = "active" | "expired" | "revoked";
export type QuestionType = "single_choice" | "multiple_choice";

export type ContentBlockType =
  | "paragraph"
  | "heading"
  | "image"
  | "video"
  | "bullet_list"
  | "numbered_list"
  | "table"
  | "quote"
  | "info_callout"
  | "warning_callout"
  | "success_callout"
  | "scenario"
  | "divider";

// ── Kurzus ────────────────────────────────────────────────────────────────

export interface AcademyCourse {
  id: string;
  slug: string;
  title: string;
  description: string;
  estimated_duration_minutes: number;
  certificate_validity_months: number;
  status: CourseStatus;
  created_at: string;
  updated_at: string;
}

export interface AcademyCourseVersion {
  id: string;
  course_id: string;
  version: string;
  status: CourseStatus;
  requires_retraining: boolean;
  passing_score: number;
  question_count: number;
  max_attempts: number;
  source_document_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  course?: AcademyCourse;
}

export interface AcademyModule {
  id: string;
  course_version_id: string;
  title: string;
  description: string;
  display_order: number;
  is_required: boolean;
  created_at: string;
  // joined
  lessons?: AcademyLesson[];
}

export interface AcademyLesson {
  id: string;
  module_id: string;
  title: string;
  display_order: number;
  is_required: boolean;
  created_at: string;
  // joined
  content_blocks?: AcademyContentBlock[];
}

// ── Tartalomblokk ─────────────────────────────────────────────────────────

export type ParagraphContent = { text: string };
export type HeadingContent = { text: string; level?: number };
export type BulletListContent = { items: string[] };
export type NumberedListContent = { items: string[] };
export type ImageContent = { url: string; alt?: string; caption?: string };
export type VideoContent = { url: string; poster?: string; transcript?: string; caption?: string };
export type TableContent = { headers: string[]; rows: string[][] };
export type QuoteContent = { text: string; attribution?: string };
export type CalloutContent = { title?: string; text: string };
export type ScenarioContent = {
  title?: string;
  situation: string;
  explanation?: string;
  do_text?: string;
  dont_text?: string;
  image_url?: string;
};

export interface AcademyContentBlock {
  id: string;
  lesson_id: string;
  block_type: ContentBlockType;
  content_json: Record<string, unknown>;
  display_order: number;
  created_at: string;
}

// ── Kérdésbank ────────────────────────────────────────────────────────────

export interface AcademyQuestion {
  id: string;
  course_version_id: string;
  question_text: string;
  question_type: QuestionType;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answers: string[];
  explanation: string;
  category: string;
  is_critical: boolean;
  is_active: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

// ── Résztvevő ─────────────────────────────────────────────────────────────

export interface AcademyParticipant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  partner_id: string;
  location: string;
  job_role: string;
  created_at: string;
  updated_at: string;
}

// ── Beiratkozás ────────────────────────────────────────────────────────────

export interface AcademyEnrollment {
  id: string;
  participant_id: string;
  course_version_id: string;
  partner_id: string;
  status: EnrollmentStatus;
  progress_percent: number;
  started_at: string | null;
  completed_course_at: string | null;
  completed_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  // joined
  participant?: AcademyParticipant;
  course_version?: AcademyCourseVersion & { course?: AcademyCourse };
  certificate?: AcademyCertificate;
  latest_test_attempt?: AcademyTestAttempt;
}

// ── Meghívás ──────────────────────────────────────────────────────────────

export interface AcademyInvitation {
  id: string;
  participant_id: string;
  enrollment_id: string;
  token_hash: string;
  sent_at: string;
  opened_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  resent_count: number;
  created_at: string;
}

// ── Haladás ───────────────────────────────────────────────────────────────

export interface AcademyLessonProgress {
  enrollment_id: string;
  lesson_id: string;
  completed: boolean;
  completed_at: string | null;
}

// ── Tesztpróbálkozás ──────────────────────────────────────────────────────

export interface AcademyTestAttempt {
  id: string;
  enrollment_id: string;
  attempt_number: number;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  passed: boolean | null;
  failed_critical: boolean | null;
  created_at: string;
  // joined
  answers?: AcademyTestAnswer[];
}

export interface AcademyTestAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_answers: string[];
  is_correct: boolean;
}

// ── Igazolás ──────────────────────────────────────────────────────────────

export interface AcademyCertificate {
  id: string;
  certificate_code: string;
  enrollment_id: string;
  issued_at: string;
  expires_at: string | null;
  pdf_storage_path: string | null;
  status: CertificateStatus;
  test_score: number;
  created_at: string;
  // joined
  enrollment?: AcademyEnrollment;
}

// ── Partnerbeállítások ────────────────────────────────────────────────────

export interface AcademyPartnerSettings {
  id: string;
  partner_id: string;
  frontline_employee_count: number;
  annual_confirmed_at: string | null;
  annual_confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Token context (magic link session) ───────────────────────────────────

export interface AcademyTokenContext {
  invitation: AcademyInvitation;
  enrollment: AcademyEnrollment;
  participant: AcademyParticipant;
  courseVersion: AcademyCourseVersion & { course: AcademyCourse };
  partnerName: string;
}

// ── DOCX import ───────────────────────────────────────────────────────────

export interface ParsedDocxLesson {
  title: string;
  blocks: ParsedBlock[];
}

export interface ParsedDocxModule {
  title: string;
  lessons: ParsedDocxLesson[];
}

export interface ParsedBlock {
  type: ContentBlockType;
  content: Record<string, unknown>;
  order: number;
}

export interface DocxImportResult {
  modules: ParsedDocxModule[];
  warnings: string[];
}
