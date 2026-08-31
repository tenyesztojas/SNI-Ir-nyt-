"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getResend } from "@/lib/resend.ts";
import { hashToken, getCurrentPartnerId } from "./data";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import type {
  AcademyParticipant,
  AcademyEnrollment,
  AcademyQuestion,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateCertificateCode(): string {
  const year = new Date().getFullYear();
  const rand = nanoid(7).toUpperCase();
  return `VA-${year}-${rand}`;
}

function generateRawToken(): string {
  // 40 karakter URL-safe véletlen token (magas entropy)
  return nanoid(40);
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner: munkatárs hozzáadása + meghívó
// ─────────────────────────────────────────────────────────────────────────────

export async function inviteParticipant(input: {
  firstName: string;
  lastName: string;
  email: string;
  location: string;
  jobRole?: string;
  courseVersionId: string;
}): Promise<{ ok: boolean; error?: string; participantId?: string }> {
  const partnerId = await getCurrentPartnerId();
  if (!partnerId) return { ok: false, error: "Nincs aktív partner fiók." };

  const admin = createAdminClient();

  // Duplikált e-mail ellenőrzés
  const { data: existing } = await admin
    .from("academy_participants")
    .select("id")
    .eq("email", input.email.toLowerCase().trim())
    .eq("partner_id", partnerId)
    .maybeSingle();

  let participantId: string;

  if (existing) {
    participantId = existing.id;
  } else {
    const { data: newPart, error: partErr } = await admin
      .from("academy_participants")
      .insert({
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        email: input.email.toLowerCase().trim(),
        partner_id: partnerId,
        location: input.location.trim(),
        job_role: input.jobRole?.trim() ?? "",
      })
      .select("id")
      .single();

    if (partErr || !newPart) return { ok: false, error: "Munkatárs létrehozása sikertelen." };
    participantId = newPart.id;
  }

  // Van-e már beiratkozás erre a kurzusverzióra?
  const { data: existingEnr } = await admin
    .from("academy_enrollments")
    .select("id, status")
    .eq("participant_id", participantId)
    .eq("course_version_id", input.courseVersionId)
    .maybeSingle();

  let enrollmentId: string;

  if (existingEnr && existingEnr.status !== "revoked") {
    enrollmentId = existingEnr.id;
  } else {
    const { data: enr, error: enrErr } = await admin
      .from("academy_enrollments")
      .insert({
        participant_id: participantId,
        course_version_id: input.courseVersionId,
        partner_id: partnerId,
        status: "invited",
      })
      .select("id")
      .single();

    if (enrErr || !enr) return { ok: false, error: "Beiratkozás létrehozása sikertelen." };
    enrollmentId = enr.id;
  }

  // Meghívó token generálása
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  const { error: invErr } = await admin
    .from("academy_invitations")
    .insert({
      participant_id: participantId,
      enrollment_id: enrollmentId,
      token_hash: tokenHash,
      sent_at: new Date().toISOString(),
    });

  if (invErr) return { ok: false, error: "Meghívó token létrehozása sikertelen." };

  // E-mail küldése
  await sendInvitationEmail({
    firstName: input.firstName,
    email: input.email,
    rawToken,
    courseVersionId: input.courseVersionId,
    partnerId,
  });

  revalidatePath("/akademia/munkatarsak");
  revalidatePath("/akademia/meghivasok");
  return { ok: true, participantId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Meghívó e-mail
// ─────────────────────────────────────────────────────────────────────────────

async function sendInvitationEmail(params: {
  firstName: string;
  email: string;
  rawToken: string;
  courseVersionId: string;
  partnerId: string;
}) {
  const admin = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vedettsarok.hu";
  const inviteUrl = `${baseUrl}/akademia/meghivo/${params.rawToken}`;

  // Kurzus + partner neve
  const { data: cv } = await admin
    .from("academy_course_versions")
    .select("version, course:academy_courses(title)")
    .eq("id", params.courseVersionId)
    .maybeSingle();

  const { data: partner } = await admin
    .from("provider_profiles")
    .select("company_name")
    .eq("id", params.partnerId)
    .maybeSingle();

  const courseName = (cv?.course as unknown as { title: string } | null)?.title ?? "Védett Akadémia képzés";
  const partnerName = partner?.company_name ?? "A munkáltatója";

  try {
    const resend = getResend();
    await resend.emails.send({
      from: "Védett Akadémia <akademia@vedettsarok.hu>",
      to: params.email,
      subject: "Meghívó a Védett Akadémia képzésére",
      html: `
<!DOCTYPE html>
<html lang="hu">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#2E2E2E;background:#FAF8F4">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#123A5C">Védett Akadémia</span>
  </div>
  <p>Kedves <strong>${params.firstName}</strong>!</p>
  <p>A <strong>${partnerName}</strong> Védett Partnerként elkötelezett amellett, hogy az autizmussal és ADHD-val érintett vendégeket felkészülten és megértően fogadja.</p>
  <p>Ehhez kérjük, végezd el a Védett Akadémia alábbi képzését:</p>
  <p style="font-weight:bold;font-size:16px">${courseName}</p>
  <p>A képzést nem kell egyszerre befejezned. A rendszer megjegyzi, hol tartasz, és később ugyanerről a linkről folytathatod.</p>
  <p>A képzés végén egy feleletválasztós teszt vár. Sikeres teljesítés után névre szóló igazolást kapsz.</p>
  <p><strong>A képzéshez nem szükséges regisztrálnod.</strong></p>
  <div style="text-align:center;margin:32px 0">
    <a href="${inviteUrl}" style="background:#34D8C3;color:#123A5C;padding:14px 28px;border-radius:999px;font-weight:bold;font-size:15px;text-decoration:none;display:inline-block">
      KÉPZÉS MEGKEZDÉSE
    </a>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="font-size:12px;color:#888">Ezt a meghívót a <strong>${partnerName}</strong> küldte a Védett Akadémia rendszerén keresztül.<br>Ha nem ismered ezt a meghívót, nyugodtan hagyd figyelmen kívül.</p>
</body>
</html>`,
    });
  } catch {
    // E-mail hiba nem állítja meg a folyamatot
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Meghívó újraküldése
// ─────────────────────────────────────────────────────────────────────────────

export async function resendInvitation(
  enrollmentId: string
): Promise<{ ok: boolean; error?: string }> {
  const partnerId = await getCurrentPartnerId();
  if (!partnerId) return { ok: false, error: "Nincs aktív partner fiók." };

  const admin = createAdminClient();

  // Partner isolation
  const { data: enr } = await admin
    .from("academy_enrollments")
    .select("id, participant_id, course_version_id, partner_id")
    .eq("id", enrollmentId)
    .eq("partner_id", partnerId)
    .maybeSingle();

  if (!enr) return { ok: false, error: "Nem található a beiratkozás." };

  const { data: participant } = await admin
    .from("academy_participants")
    .select("first_name, email")
    .eq("id", enr.participant_id)
    .maybeSingle();

  if (!participant) return { ok: false, error: "Résztvevő nem található." };

  // Új token generálása (régi marad, de új is jön)
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  await admin.from("academy_invitations").insert({
    participant_id: enr.participant_id,
    enrollment_id: enrollmentId,
    token_hash: tokenHash,
    sent_at: new Date().toISOString(),
  });

  await sendInvitationEmail({
    firstName: participant.first_name,
    email: participant.email,
    rawToken,
    courseVersionId: enr.course_version_id,
    partnerId,
  });

  revalidatePath("/akademia/meghivasok");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Meghívó visszavonása
// ─────────────────────────────────────────────────────────────────────────────

export async function revokeInvitation(
  enrollmentId: string
): Promise<{ ok: boolean; error?: string }> {
  const partnerId = await getCurrentPartnerId();
  if (!partnerId) return { ok: false, error: "Nincs aktív partner fiók." };

  const admin = createAdminClient();

  // Partner isolation
  const { data: enr } = await admin
    .from("academy_enrollments")
    .select("id, partner_id")
    .eq("id", enrollmentId)
    .eq("partner_id", partnerId)
    .maybeSingle();

  if (!enr) return { ok: false, error: "Nem található a beiratkozás." };

  const now = new Date().toISOString();

  await Promise.all([
    admin
      .from("academy_invitations")
      .update({ revoked_at: now })
      .eq("enrollment_id", enrollmentId)
      .is("revoked_at", null),
    admin
      .from("academy_enrollments")
      .update({ status: "revoked" })
      .eq("id", enrollmentId),
  ]);

  revalidatePath("/akademia/meghivasok");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Magic link: első megnyitás – enrollment státusz frissítése
// ─────────────────────────────────────────────────────────────────────────────

export async function markInvitationOpened(
  invitationId: string,
  enrollmentId: string
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  await Promise.all([
    admin
      .from("academy_invitations")
      .update({ opened_at: now })
      .eq("id", invitationId)
      .is("opened_at", null),
    admin
      .from("academy_enrollments")
      .update({ status: "opened", last_activity_at: now })
      .eq("id", enrollmentId)
      .eq("status", "invited"),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecke teljesítése
// ─────────────────────────────────────────────────────────────────────────────

export async function completeLessonAction(
  enrollmentId: string,
  lessonId: string,
  allRequiredLessonIds: string[]
): Promise<{ ok: boolean; newProgressPercent: number; allDone: boolean }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Upsert lesson progress
  await admin.from("academy_lesson_progress").upsert(
    { enrollment_id: enrollmentId, lesson_id: lessonId, completed: true, completed_at: now },
    { onConflict: "enrollment_id,lesson_id" }
  );

  // Összes teljesített lecke lekérése
  const { data: progressData } = await admin
    .from("academy_lesson_progress")
    .select("lesson_id")
    .eq("enrollment_id", enrollmentId)
    .eq("completed", true);

  const completedIds = new Set((progressData ?? []).map((p) => p.lesson_id));
  const doneCount = allRequiredLessonIds.filter((id) => completedIds.has(id)).length;
  const total = allRequiredLessonIds.length;
  const newProgressPercent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const allDone = doneCount >= total;

  const updatePayload: Record<string, unknown> = {
    progress_percent: newProgressPercent,
    last_activity_at: now,
  };

  if (allDone) {
    updatePayload.status = "course_completed";
    updatePayload.completed_course_at = now;
  } else {
    // in_progress ha el volt kezdve
    const { data: enr } = await admin
      .from("academy_enrollments")
      .select("status")
      .eq("id", enrollmentId)
      .maybeSingle();

    if (enr?.status === "opened" || enr?.status === "invited") {
      updatePayload.status = "in_progress";
      updatePayload.started_at = now;
    }
  }

  await admin.from("academy_enrollments").update(updatePayload).eq("id", enrollmentId);

  return { ok: true, newProgressPercent, allDone };
}

// ─────────────────────────────────────────────────────────────────────────────
// Teszt: próbálkozás indítása
// ─────────────────────────────────────────────────────────────────────────────

export async function startTestAttempt(
  enrollmentId: string
): Promise<{ ok: boolean; attemptId?: string; error?: string }> {
  const admin = createAdminClient();

  const { count } = await admin
    .from("academy_test_attempts")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId);

  const { data: enr } = await admin
    .from("academy_enrollments")
    .select("course_version_id, status")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (!enr) return { ok: false, error: "Beiratkozás nem található." };
  if (!["course_completed", "test_failed"].includes(enr.status)) {
    return { ok: false, error: "A tananyagot előbb be kell fejezni." };
  }

  const { data: cv } = await admin
    .from("academy_course_versions")
    .select("max_attempts")
    .eq("id", enr.course_version_id)
    .maybeSingle();

  const maxAttempts = cv?.max_attempts ?? 0;
  if (maxAttempts > 0 && (count ?? 0) >= maxAttempts) {
    return { ok: false, error: "Elérted a maximális próbálkozások számát." };
  }

  const { data: attempt, error } = await admin
    .from("academy_test_attempts")
    .insert({
      enrollment_id: enrollmentId,
      attempt_number: (count ?? 0) + 1,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !attempt) return { ok: false, error: "Próbálkozás indítása sikertelen." };

  await admin
    .from("academy_enrollments")
    .update({ status: "test_in_progress", last_activity_at: new Date().toISOString() })
    .eq("id", enrollmentId);

  return { ok: true, attemptId: attempt.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Teszt: beküldés és pontozás
// ─────────────────────────────────────────────────────────────────────────────

export async function submitTestAttempt(
  attemptId: string,
  enrollmentId: string,
  answers: { questionId: string; selectedAnswers: string[] }[]
): Promise<{
  ok: boolean;
  score?: number;
  passed?: boolean;
  failedCritical?: boolean;
  error?: string;
}> {
  const admin = createAdminClient();

  // Kérdések lekérése
  const questionIds = answers.map((a) => a.questionId);
  const { data: questions } = await admin
    .from("academy_question_bank")
    .select("id, correct_answers, is_critical")
    .in("id", questionIds);

  if (!questions) return { ok: false, error: "Kérdések betöltése sikertelen." };

  const { data: enr } = await admin
    .from("academy_enrollments")
    .select("course_version_id")
    .eq("id", enrollmentId)
    .maybeSingle();

  const { data: cv } = await admin
    .from("academy_course_versions")
    .select("passing_score")
    .eq("id", enr?.course_version_id ?? "")
    .maybeSingle();

  const passingScore = cv?.passing_score ?? 80;

  // Pontozás
  const qMap = new Map(questions.map((q) => [q.id, q]));
  let correctCount = 0;
  let failedCritical = false;
  const answerRows: { attempt_id: string; question_id: string; selected_answers: string[]; is_correct: boolean }[] = [];

  for (const ans of answers) {
    const q = qMap.get(ans.questionId);
    if (!q) continue;

    const correct = new Set<string>(q.correct_answers as string[]);
    const selected = new Set<string>(ans.selectedAnswers);
    const isCorrect =
      correct.size === selected.size &&
      [...correct].every((c) => selected.has(c));

    if (isCorrect) {
      correctCount++;
    } else if (q.is_critical) {
      failedCritical = true;
    }

    answerRows.push({
      attempt_id: attemptId,
      question_id: ans.questionId,
      selected_answers: ans.selectedAnswers,
      is_correct: isCorrect,
    });
  }

  const score = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0;
  const passed = score >= passingScore && !failedCritical;
  const submittedAt = new Date().toISOString();

  // Válaszok mentése
  if (answerRows.length > 0) {
    await admin.from("academy_test_answers").insert(answerRows);
  }

  // Próbálkozás frissítése
  await admin
    .from("academy_test_attempts")
    .update({ submitted_at: submittedAt, score, passed, failed_critical: failedCritical })
    .eq("id", attemptId);

  // Enrollment státusz
  const newStatus = passed ? "completed" : "test_failed";
  const updateData: Record<string, unknown> = {
    status: newStatus,
    last_activity_at: submittedAt,
  };
  if (passed) updateData.completed_at = submittedAt;

  await admin.from("academy_enrollments").update(updateData).eq("id", enrollmentId);

  // Ha sikeres: igazolás generálása
  if (passed) {
    await createCertificate(enrollmentId, score);
  }

  return { ok: true, score, passed, failedCritical };
}

// ─────────────────────────────────────────────────────────────────────────────
// Igazolás generálása
// ─────────────────────────────────────────────────────────────────────────────

async function createCertificate(enrollmentId: string, score: number): Promise<void> {
  const admin = createAdminClient();

  // Már van igazolás?
  const { data: existing } = await admin
    .from("academy_certificates")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();

  if (existing) return;

  // Lejárat kiszámítása
  const { data: enr } = await admin
    .from("academy_enrollments")
    .select("course_version_id")
    .eq("id", enrollmentId)
    .maybeSingle();

  const { data: cv } = await admin
    .from("academy_course_versions")
    .select("course:academy_courses(certificate_validity_months)")
    .eq("id", enr?.course_version_id ?? "")
    .maybeSingle();

  const months = (cv?.course as unknown as { certificate_validity_months: number } | null)
    ?.certificate_validity_months ?? 12;

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + months);

  // Egyedi kód generálása (retry ha ütközik)
  let code = generateCertificateCode();
  for (let i = 0; i < 5; i++) {
    const { data: codeConflict } = await admin
      .from("academy_certificates")
      .select("id")
      .eq("certificate_code", code)
      .maybeSingle();
    if (!codeConflict) break;
    code = generateCertificateCode();
  }

  await admin.from("academy_certificates").insert({
    certificate_code: code,
    enrollment_id: enrollmentId,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    test_score: score,
    status: "active",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: kurzus létrehozása
// ─────────────────────────────────────────────────────────────────────────────

export async function createCourse(input: {
  title: string;
  description: string;
  estimatedMinutes: number;
  validityMonths: number;
}): Promise<{ ok: boolean; courseId?: string; error?: string }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Bejelentkezés szükséges." };

  const admin = createAdminClient();
  const slug = input.title
    .toLowerCase()
    .replace(/[áÁ]/g, "a").replace(/[éÉ]/g, "e").replace(/[íÍ]/g, "i")
    .replace(/[óÓőŐöÖ]/g, "o").replace(/[úÚűŰüÜ]/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  const { data, error } = await admin
    .from("academy_courses")
    .insert({
      slug: `${slug}-${Date.now()}`,
      title: input.title,
      description: input.description,
      estimated_duration_minutes: input.estimatedMinutes,
      certificate_validity_months: input.validityMonths,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Kurzus létrehozása sikertelen." };
  revalidatePath("/admin/akademia/kurzusok");
  return { ok: true, courseId: data.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: kurzusverzió publikálása
// ─────────────────────────────────────────────────────────────────────────────

export async function publishCourseVersion(
  versionId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Bejelentkezés szükséges." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("academy_course_versions")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", versionId);

  if (error) return { ok: false, error: "Publikálás sikertelen." };
  revalidatePath("/admin/akademia/kurzusok");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: tartalomblokk mentése
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertContentBlock(block: {
  id?: string;
  lessonId: string;
  blockType: string;
  contentJson: Record<string, unknown>;
  displayOrder: number;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const admin = createAdminClient();

  if (block.id) {
    const { error } = await admin
      .from("academy_content_blocks")
      .update({
        block_type: block.blockType,
        content_json: block.contentJson,
        display_order: block.displayOrder,
      })
      .eq("id", block.id);

    if (error) return { ok: false, error: "Blokk frissítése sikertelen." };
    return { ok: true, id: block.id };
  } else {
    const { data, error } = await admin
      .from("academy_content_blocks")
      .insert({
        lesson_id: block.lessonId,
        block_type: block.blockType,
        content_json: block.contentJson,
        display_order: block.displayOrder,
      })
      .select("id")
      .single();

    if (error || !data) return { ok: false, error: "Blokk létrehozása sikertelen." };
    return { ok: true, id: data.id };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: kérdés mentése
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertQuestion(q: {
  id?: string;
  courseVersionId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswers: string[];
  explanation: string;
  category: string;
  isCritical: boolean;
  isActive: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();

  const payload = {
    course_version_id: q.courseVersionId,
    question_text: q.questionText,
    option_a: q.optionA,
    option_b: q.optionB,
    option_c: q.optionC,
    option_d: q.optionD,
    correct_answers: q.correctAnswers,
    explanation: q.explanation,
    category: q.category,
    is_critical: q.isCritical,
    is_active: q.isActive,
  };

  if (q.id) {
    const { error } = await admin
      .from("academy_question_bank")
      .update(payload)
      .eq("id", q.id);
    if (error) return { ok: false, error: "Kérdés frissítése sikertelen." };
  } else {
    const { error } = await admin.from("academy_question_bank").insert(payload);
    if (error) return { ok: false, error: "Kérdés létrehozása sikertelen." };
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner: frontline count frissítése
// ─────────────────────────────────────────────────────────────────────────────

export async function updateFrontlineCount(
  count: number
): Promise<{ ok: boolean; error?: string }> {
  const partnerId = await getCurrentPartnerId();
  if (!partnerId) return { ok: false, error: "Nincs aktív partner fiók." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("academy_partner_settings")
    .upsert(
      { partner_id: partnerId, frontline_employee_count: count, updated_at: new Date().toISOString() },
      { onConflict: "partner_id" }
    );

  if (error) return { ok: false, error: "Mentés sikertelen." };
  revalidatePath("/akademia");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner: éves nyilatkozat megerősítése
// ─────────────────────────────────────────────────────────────────────────────

export async function confirmAnnualDeclaration(
  frontlineCount: number
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Bejelentkezés szükséges." };

  const partnerId = await getCurrentPartnerId();
  if (!partnerId) return { ok: false, error: "Nincs aktív partner fiók." };

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from("academy_partner_settings")
    .upsert(
      {
        partner_id: partnerId,
        frontline_employee_count: frontlineCount,
        annual_confirmed_at: now,
        annual_confirmed_by: userData.user.id,
        updated_at: now,
      },
      { onConflict: "partner_id" }
    );

  if (error) return { ok: false, error: "Megerősítés sikertelen." };
  revalidatePath("/akademia");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: DOCX import – struktúra mentése az adatbázisba
// ─────────────────────────────────────────────────────────────────────────────

export async function saveDocxImport(
  courseVersionId: string,
  modules: { title: string; lessons: { title: string; blocks: { type: string; content: Record<string, unknown> }[] }[] }[]
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();

  for (let mi = 0; mi < modules.length; mi++) {
    const mod = modules[mi];
    const { data: modRow, error: modErr } = await admin
      .from("academy_modules")
      .insert({
        course_version_id: courseVersionId,
        title: mod.title,
        display_order: mi,
      })
      .select("id")
      .single();

    if (modErr || !modRow) return { ok: false, error: `Modul mentési hiba: ${mod.title}` };

    for (let li = 0; li < mod.lessons.length; li++) {
      const lesson = mod.lessons[li];
      const { data: lesRow, error: lesErr } = await admin
        .from("academy_lessons")
        .insert({ module_id: modRow.id, title: lesson.title, display_order: li })
        .select("id")
        .single();

      if (lesErr || !lesRow) return { ok: false, error: `Lecke mentési hiba: ${lesson.title}` };

      const blocks = lesson.blocks.map((b, bi) => ({
        lesson_id: lesRow.id,
        block_type: b.type,
        content_json: b.content,
        display_order: bi,
      }));

      if (blocks.length > 0) {
        await admin.from("academy_content_blocks").insert(blocks);
      }
    }
  }

  revalidatePath(`/admin/akademia/kurzusok`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Résztvevő: teszt előkészítése (startTestAttempt + kérdések betöltése)
// ─────────────────────────────────────────────────────────────────────────────

export async function prepareTestAttempt(enrollmentId: string): Promise<{
  ok: boolean;
  attemptId?: string;
  questions?: import("./types").AcademyQuestion[];
  passingScore?: number;
  error?: string;
}> {
  const admin = createAdminClient();

  // Enrollment + verziók betöltése
  const { data: enr } = await admin
    .from("academy_enrollments")
    .select("id, status, course_version_id, attempt_count")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (!enr) return { ok: false, error: "Beiratkozás nem található." };

  if (!["course_completed", "test_failed"].includes(enr.status)) {
    return { ok: false, error: "A teszt még nem érhető el." };
  }

  const { data: cv } = await admin
    .from("academy_course_versions")
    .select("passing_score, question_count, max_attempts")
    .eq("id", enr.course_version_id)
    .maybeSingle();

  if (!cv) return { ok: false, error: "Kurzusverzió nem található." };

  const maxAttempts = (cv as unknown as { max_attempts: number }).max_attempts ?? 3;
  const attemptCount = enr.attempt_count ?? 0;
  if (attemptCount >= maxAttempts) {
    return { ok: false, error: `Elérted a maximális próbálkozási számot (${maxAttempts}).` };
  }

  // Új kísérlet
  const { data: attempt, error: attErr } = await admin
    .from("academy_test_attempts")
    .insert({ enrollment_id: enrollmentId, started_at: new Date().toISOString() })
    .select("id")
    .single();

  if (attErr || !attempt) return { ok: false, error: "Teszt indítása sikertelen." };

  // Próbálkozásszám növelése
  await admin
    .from("academy_enrollments")
    .update({ attempt_count: attemptCount + 1, status: "test_in_progress" })
    .eq("id", enrollmentId);

  // Kérdések lekérése
  const questionCount = (cv as unknown as { question_count: number }).question_count ?? 10;
  const passingScore = (cv as unknown as { passing_score: number }).passing_score ?? 80;

  const { data: allQ } = await admin
    .from("academy_question_bank")
    .select("*")
    .eq("course_version_id", enr.course_version_id)
    .eq("is_active", true);

  const all = (allQ ?? []) as import("./types").AcademyQuestion[];
  const critical = all.filter((q) => q.is_critical);
  const nonCritical = all.filter((q) => !q.is_critical);

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
  const needed = Math.max(questionCount, shuffledCritical.length);
  const questions = shuffle([
    ...shuffledCritical,
    ...shuffledNonCritical.slice(0, needed - shuffledCritical.length),
  ]);

  return { ok: true, attemptId: attempt.id, questions, passingScore };
}
