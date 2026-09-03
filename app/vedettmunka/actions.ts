"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { sendAdminPush } from "@/lib/push";

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Munkáltatói regisztráció ───────────────────────────────────

export async function registerEmployer(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nincs bejelentkezve.");

  const rawPrivacyUrl = (formData.get("privacy_policy_url") as string)?.trim() || "";
  if (!rawPrivacyUrl) {
    throw new Error("A munkáltatói adatkezelési tájékoztató linkje kötelező.");
  }
  try {
    const parsed = new URL(rawPrivacyUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("only http/https");
    }
  } catch {
    throw new Error("Érvénytelen URL formátum. Csak http:// vagy https:// protokollal kezdődő link fogadható el.");
  }

  const obj = {
    user_id: user.id,
    company_name: (formData.get("company_name") as string).trim(),
    tax_number: (formData.get("tax_number") as string)?.trim() || null,
    address: (formData.get("address") as string).trim(),
    website: (formData.get("website") as string)?.trim() || null,
    privacy_policy_url: rawPrivacyUrl,
    contact_name: (formData.get("contact_name") as string).trim(),
    contact_email: (formData.get("contact_email") as string).trim(),
    contact_phone: (formData.get("contact_phone") as string)?.trim() || null,
    description: (formData.get("description") as string).trim(),
    job_types_description: (formData.get("job_types_description") as string).trim(),
    open_to_neurodivergent: formData.get("open_to_neurodivergent") === "true",
    open_to_disabled: formData.get("open_to_disabled") === "true",
    open_to_parents: formData.get("open_to_parents") === "true",
    accepts_vm_terms: formData.get("accepts_vm_terms") === "true",
    accepts_no_diagnosis_req: formData.get("accepts_no_diagnosis_req") === "true",
  };

  if (!obj.accepts_vm_terms || !obj.accepts_no_diagnosis_req) {
    throw new Error("A feltételek elfogadása kötelező.");
  }

  const { data: newEmployer, error } = await supabase.from("employers").insert(obj).select("id").single();
  if (error) throw new Error(error.message);

  // Consent napló – munkáltatói feltételek
  const admin = createAdminClient();
  try {
    await admin.from("vm_consent_log").insert([
      {
        user_id: user.id,
        employer_id: newEmployer?.id ?? null,
        consent_type: "employer_terms_acceptance",
        employer_privacy_url: rawPrivacyUrl,
        metadata: { company_name: obj.company_name },
      },
      {
        user_id: user.id,
        employer_id: newEmployer?.id ?? null,
        consent_type: "employer_fair_selection_declaration",
        metadata: { accepts_no_diagnosis_req: true },
      },
    ]);
  } catch { /* audit log nem blokkolja a fő műveletet */ }

  // Admin értesítő e-mail
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await resend.emails.send({
      from: "VédettKarrier <noreply@vedettsarok.hu>",
      to: adminEmail,
      subject: `[VédettKarrier] Új karrierpartneri regisztráció: ${obj.company_name}`,
      html: `<p>Új munkáltatói regisztráció érkezett: <strong>${obj.company_name}</strong></p>
             <p>Kapcsolattartó: ${obj.contact_name} &lt;${obj.contact_email}&gt;</p>
             <p>Adatkezelési link: <a href="${rawPrivacyUrl}">${rawPrivacyUrl}</a></p>
             <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin/vedettmunka/munkaltatok">Admin kezelés</a></p>`,
    }).catch(() => null);
  }

  // Admin PWA push értesítés
  await sendAdminPush(
    "Új munkáltatói regisztráció",
    `${obj.company_name} – ${obj.contact_name}`,
    "/admin/vedettmunka/munkaltatok"
  );

  revalidatePath("/vedettmunka/munkaltatoi-regisztracio");
}

// ─── Hirdetés feladás ───────────────────────────────────────────

export async function submitJobPost(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nincs bejelentkezve.");

  const { data: employer } = await supabase
    .from("employers")
    .select("id, status")
    .eq("user_id", user.id)
    .single();

  if (!employer || employer.status !== "approved") {
    throw new Error("Csak jóváhagyott munkáltató adhat fel hirdetést.");
  }

  const interaction = formData.getAll("interaction_with") as string[];

  const obj = {
    employer_id: employer.id,
    title: (formData.get("title") as string).trim(),
    city: (formData.get("city") as string).trim(),
    county: (formData.get("county") as string).trim(),
    workplace_address: (formData.get("workplace_address") as string)?.trim() || null,
    work_type: formData.get("work_type") as string,
    job_category: (formData.get("job_category") as string).trim(),
    work_location_type: formData.get("work_location_type") as string,
    daily_hours: (formData.get("daily_hours") as string).trim(),
    working_days: (formData.get("working_days") as string).trim(),
    working_hours_from: (formData.get("working_hours_from") as string)?.trim() || null,
    working_hours_to: (formData.get("working_hours_to") as string)?.trim() || null,
    break_description: (formData.get("break_description") as string)?.trim() || null,
    schedule_type: formData.get("schedule_type") as string,
    salary_range: (formData.get("salary_range") as string).trim(),
    tasks_description: (formData.get("tasks_description") as string).trim(),
    requirements_description: (formData.get("requirements_description") as string).trim(),
    application_deadline: (formData.get("application_deadline") as string) || null,
    expected_start_date: (formData.get("expected_start_date") as string)?.trim() || null,
    training_description: (formData.get("training_description") as string)?.trim() || null,
    mentor_available: formData.get("mentor_available") as string,
    interview_process: (formData.get("interview_process") as string)?.trim() || null,
    contact_name: (formData.get("contact_name") as string)?.trim() || null,
    contact_email: (formData.get("contact_email") as string)?.trim() || null,
    application_email: (formData.get("application_email") as string).trim(),
    required_documents: (formData.get("required_documents") as string)?.trim() || null,
    notes: (formData.get("notes") as string)?.trim() || null,
    support_description: (formData.get("support_description") as string).trim(),
    phone_required_level: formData.get("phone_required_level") as string | null,
    verbal_interaction_level: formData.get("verbal_interaction_level") as string | null,
    interaction_with: interaction,
    noise_level: formData.get("noise_level") as string | null,
    written_instructions_available: formData.get("written_instructions_available") as string | null,
    break_flexibility: formData.get("break_flexibility") as string | null,
    start_end_flexibility: formData.get("start_end_flexibility") as string | null,
    part_time_available: formData.get("part_time_available") as string | null,
    open_to_parents: formData.get("open_to_parents") === "true",
    open_to_neurodivergent: formData.get("open_to_neurodivergent") === "true",
    open_to_disabled: formData.get("open_to_disabled") === "true",
    status: "submitted",
  };

  const { error } = await supabase.from("job_posts").insert(obj);
  if (error) throw new Error(error.message);

  // Admin értesítő
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await resend.emails.send({
      from: "VédettKarrier <noreply@vedettsarok.hu>",
      to: adminEmail,
      subject: `[VédettKarrier] Új lehetőség jóváhagyásra vár: ${obj.title}`,
      html: `<p>Új lehetőség érkezett: <strong>${obj.title}</strong></p>
             <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin/vedettmunka/hirdetesek">Admin kezelés</a></p>`,
    }).catch(() => null);
  }

  revalidatePath("/vedettmunka/hirdetes-feladas");
}

// ─── Wizard alapú hirdetésfeladás (+ attribútumok) ─────────────

export async function submitJobPostWizard(
  data: Record<string, string | string[] | boolean>,
  attributeSlugs: string[]
): Promise<{ ok: boolean; error?: string }> {
  "use server";
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Nincs bejelentkezve." };

    const { data: employer } = await supabase
      .from("employers")
      .select("id, status")
      .eq("user_id", user.id)
      .single();

    if (!employer || employer.status !== "approved") {
      return { ok: false, error: "Csak jóváhagyott munkáltató adhat fel hirdetést." };
    }

    const obj = {
      employer_id: employer.id,
      title:                    (data.title as string ?? "").trim(),
      city:                     (data.city as string ?? "").trim(),
      county:                   (data.county as string ?? "").trim(),
      workplace_address:        (data.workplace_address as string)?.trim() || null,
      work_type:                (data.work_type as string) || "szellemi",
      job_category:             (data.job_category as string ?? "").trim(),
      work_location_type:       (data.work_location_type as string) || "munkahelyen",
      daily_hours:              (data.daily_hours as string ?? "").trim(),
      working_days:             (data.working_days as string ?? "").trim(),
      working_hours_from:       (data.working_hours_from as string)?.trim() || null,
      working_hours_to:         (data.working_hours_to as string)?.trim() || null,
      break_description:        (data.break_description as string)?.trim() || null,
      schedule_type:            (data.schedule_type as string) || "allando",
      salary_range:             (data.salary_range as string ?? "").trim(),
      tasks_description:        (data.tasks_description as string ?? "").trim(),
      requirements_description: (data.requirements_description as string ?? "").trim(),
      application_deadline:     (data.application_deadline as string) || null,
      expected_start_date:      (data.expected_start_date as string)?.trim() || null,
      training_description:     (data.training_description as string)?.trim() || null,
      mentor_available:         (data.mentor_available as string) || "meg_egyeztetes_alatt",
      interview_process:        (data.interview_process as string)?.trim() || null,
      contact_name:             (data.contact_name as string)?.trim() || null,
      contact_email:            (data.contact_email as string)?.trim() || null,
      application_email:        (data.application_email as string ?? "").trim(),
      required_documents:       (data.required_documents as string)?.trim() || null,
      notes:                    (data.notes as string)?.trim() || null,
      support_description:      (data.support_description as string ?? "").trim(),
      noise_level:              (data.noise_level as string) || null,
      verbal_interaction_level: (data.verbal_interaction_level as string) || null,
      interaction_with:         Array.isArray(data.interaction_with) ? data.interaction_with : [],
      written_instructions_available: (data.written_instructions_available as string) || null,
      break_flexibility:        (data.break_flexibility as string) || null,
      start_end_flexibility:    (data.start_end_flexibility as string) || null,
      part_time_available:      (data.part_time_available as string) || null,
      open_to_parents:          data.open_to_parents === true || data.open_to_parents === "true",
      open_to_neurodivergent:   data.open_to_neurodivergent === true || data.open_to_neurodivergent === "true",
      open_to_disabled:         data.open_to_disabled === true || data.open_to_disabled === "true",
      status: "submitted",
    };

    const { data: inserted, error } = await supabase
      .from("job_posts")
      .insert(obj)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };

    // Attribútumok mentése
    if (inserted?.id && attributeSlugs.length > 0) {
      const admin = createAdminClient();
      const rows = attributeSlugs.map((slug) => ({
        job_post_id: inserted.id,
        attribute_slug: slug,
        value: "true",
      }));
      await admin.from("vm_job_attribute_values").insert(rows);
    }

    // Admin értesítő
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await resend.emails.send({
        from: "VédettKarrier <noreply@vedettsarok.hu>",
        to: adminEmail,
        subject: `[VédettKarrier] Új lehetőség jóváhagyásra vár: ${obj.title}`,
        html: `<p>Új lehetőség érkezett a wizardon keresztül: <strong>${obj.title}</strong></p>
               <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin/vedettmunka/hirdetesek">Admin kezelés</a></p>`,
      }).catch(() => null);
    }

    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Ismeretlen hiba" };
  }
}

// ─── Saját Munkaprofil mentése ──────────────────────────────────

export async function saveWorkProfile(slugs: string[], notes: string): Promise<{ ok: boolean; error?: string }> {
  "use server";
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Nincs bejelentkezve." };
    await supabase.from("vm_work_profiles").upsert({
      user_id: user.id,
      attribute_slugs: slugs,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Hiba" };
  }
}

// ─── Lehetőségfigyelő ──────────────────────────────────────────────

export async function upsertJobAlert(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nincs bejelentkezve.");

  const categories = formData.getAll("categories") as string[];
  const enabled = formData.get("enabled") === "true";

  const obj = {
    user_id: user.id,
    enabled,
    categories,
    work_type: (formData.get("work_type") as string) || null,
    city: (formData.get("city") as string)?.trim() || null,
    county: (formData.get("county") as string)?.trim() || null,
    home_office: formData.get("home_office") === "true",
    hybrid: formData.get("hybrid") === "true",
    part_time: formData.get("part_time") === "true",
    flexible_schedule: formData.get("flexible_schedule") === "true",
    open_to_neurodivergent: formData.get("open_to_neurodivergent") === "true",
    open_to_disabled: formData.get("open_to_disabled") === "true",
    open_to_parents: formData.get("open_to_parents") === "true",
    salary_min: Number(formData.get("salary_min")) || null,
    frequency: (formData.get("frequency") as string) || "heti",
  };

  const { error } = await supabase
    .from("job_alerts")
    .upsert(obj, { onConflict: "user_id" });
  if (error) throw new Error(error.message);

  // Consent log feliratkozáskor
  if (enabled) {
    const admin = createAdminClient();
    try {
      await admin.from("vm_consent_log").insert({
        user_id: user.id,
        consent_type: "job_alert_subscribe",
        metadata: { categories, frequency: obj.frequency },
      });
    } catch { /* nem blokkolja a fő műveletet */ }
  }

  revalidatePath("/vedettmunka/ertesito");
}

export async function quickToggleAlert(enable: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nincs bejelentkezve.");

  const { data: existing } = await supabase
    .from("job_alerts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("job_alerts")
      .update({ enabled: enable })
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  } else if (enable) {
    const { error } = await supabase
      .from("job_alerts")
      .insert({ user_id: user.id, enabled: true, frequency: "heti", categories: [] });
    if (error) throw new Error(error.message);
  }

  // Consent log feliratkozáskor / leiratkozáskor
  if (enable) {
    const admin = createAdminClient();
    try {
      await admin.from("vm_consent_log").insert({
        user_id: user.id,
        consent_type: "job_alert_subscribe",
        metadata: { source: "quick_toggle" },
      });
    } catch { /* nem blokkolja a fő műveletet */ }
  }

  revalidatePath("/vedettmunka");
  revalidatePath("/vedettmunka/ertesito");
}

// ─── Hirdetés jelentése ─────────────────────────────────────────

export async function reportJob(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("A hirdetés jelzéséhez be kell lépni.");

  const { error } = await supabase.from("job_reports").insert({
    reporter_user_id: user.id,
    job_id: formData.get("job_id") as string,
    reason: formData.get("reason") as string,
    description: (formData.get("description") as string)?.trim() || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/vedettmunka/allasok");
}

// ─── Segédfüggvény: admin audit log bejegyzés ──────────────────

async function writeAuditLog(
  adminUserId: string,
  actionType: string,
  targetType: string,
  targetId: string | null,
  metadata?: Record<string, unknown>
) {
  const admin = createAdminClient();
  try {
    await admin.from("vm_admin_audit_log").insert({
      admin_user_id: adminUserId,
      action_type: actionType,
      target_type: targetType,
      target_id: targetId ?? null,
      metadata: metadata ?? null,
    });
  } catch { /* ne blokkolja a fő műveletet */ }
}

// ─── Admin: munkáltató státusz ──────────────────────────────────

export async function adminUpdateEmployerStatus(
  id: string,
  status: string,
  note?: string
) {
  const supabase = createClient();
  const { data: { user: adminUser } } = await supabase.auth.getUser();

  const admin = createAdminClient();

  // Jóváhagyás csak érvényes adatkezelési link esetén engedélyezett
  // Fetch employer adatok (jóváhagyás-ellenőrzés + e-mail küldés)
  const { data: emp } = await admin
    .from("employers")
    .select("privacy_policy_url, company_name, contact_name, contact_email")
    .eq("id", id)
    .single();

  if (status === "approved") {
    if (!emp?.privacy_policy_url) {
      throw new Error(
        "A munkáltató nem hagyható jóvá adatkezelési tájékoztató link nélkül. " +
        "Kérd meg a munkáltatót, hogy adja meg a linkjét, vagy vedd fel a kapcsolatot velük."
      );
    }
  }

  const { error } = await admin
    .from("employers")
    .update({ status, admin_note: note ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Jóváhagyáskor e-mail a karrierpartnernek
  if (status === "approved" && emp?.contact_email) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vedettsarok.hu";
    await resend.emails.send({
      from: "VédettKarrier <noreply@vedettsarok.hu>",
      to: emp.contact_email,
      subject: `Üdvözöljük a VédettKarrier platformján! – ${emp.company_name}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#123A5C">Elfogadtuk a regisztrációját!</h2>
          <p>Kedves ${emp.contact_name ?? emp.company_name}!</p>
          <p>Örömmel tájékoztatjuk, hogy a <strong>${emp.company_name}</strong> karrierpartneri regisztrációját jóváhagytuk a <strong>VédettKarrier</strong> platformján.</p>
          <p>Köszöntjük a VédettSarok közösségében! Mostantól feladhat lehetőségeket és befogadó karrierpartnerként megjelenhet a VédettKarrier felületen.</p>
          <p style="margin-top:24px">
            <a href="${siteUrl}/vedettmunka/hirdetes-feladas"
               style="background:#34D8C3;color:#123A5C;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold;display:inline-block">
              Lehetőség feladása →
            </a>
          </p>
          <p style="margin-top:24px;font-size:13px;color:#666">
            Ha kérdése van, írjon nekünk a <a href="mailto:info@vedettsarok.hu">info@vedettsarok.hu</a> címre.
          </p>
        </div>
      `,
    }).catch(() => null);
  }

  if (adminUser) {
    const actionMap: Record<string, string> = {
      approved: "employer_approved",
      rejected: "employer_rejected",
      suspended: "employer_suspended",
    };
    await writeAuditLog(adminUser.id, actionMap[status] ?? "employer_status_changed", "employer", id, {
      to_status: status,
      admin_note: note ?? null,
    });
  }

  revalidatePath("/admin/vedettmunka/munkaltatok");
}

// ─── Admin: hirdetés státusz ────────────────────────────────────

export async function adminUpdateJobStatus(
  id: string,
  status: string,
  note?: string
) {
  const supabase = createClient();
  const { data: { user: adminUser } } = await supabase.auth.getUser();

  const admin = createAdminClient();

  // Publikálás csak érvényes adatkezelési linkkel rendelkező munkáltatóhoz engedélyezett
  if (status === "published") {
    const { data: job } = await admin
      .from("job_posts")
      .select("employer_id, employers(privacy_policy_url)")
      .eq("id", id)
      .single();
    const empRows = job?.employers as { privacy_policy_url: string | null }[] | null;
    const employerPrivacyUrl = empRows?.[0]?.privacy_policy_url ?? null;
    if (!employerPrivacyUrl) {
      throw new Error(
        "Ez a hirdetés nem publikálható, mert a munkáltatónak nincs megadva adatkezelési tájékoztató linkje."
      );
    }
  }

  const { data: prevJob } = await admin
    .from("job_posts")
    .select("status")
    .eq("id", id)
    .single();

  const update: Record<string, unknown> = {
    status,
    admin_note: note ?? null,
    updated_at: new Date().toISOString(),
  };
  if (status === "published") {
    update.published_at = new Date().toISOString();
    update.expires_at = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 nap
    sendJobAlertEmails(id).catch(() => null);
  }

  const { error } = await admin.from("job_posts").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  if (adminUser) {
    await writeAuditLog(adminUser.id, "job_status_changed", "job_post", id, {
      from_status: prevJob?.status ?? null,
      to_status: status,
      admin_note: note ?? null,
    });
  }

  revalidatePath("/admin/vedettmunka/hirdetesek");
}

// ─── Admin: hirdetés jelentés ───────────────────────────────────

export async function adminUpdateReportStatus(
  id: string,
  status: string,
  note?: string
) {
  const supabase = createClient();
  const { data: { user: adminUser } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { error } = await admin
    .from("job_reports")
    .update({
      status,
      admin_note: note ?? null,
      resolved_at: ["resolved", "dismissed"].includes(status) ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (adminUser) {
    await writeAuditLog(adminUser.id, "job_report_status_changed", "job_report", id, {
      to_status: status,
      admin_note: note ?? null,
    });
  }

  revalidatePath("/admin/vedettmunka/jelentesek");
}

// ─── Lehetőségfigyelő e-mailek küldése (publikáláskor) ─────────────

async function sendJobAlertEmails(jobId: string) {
  const admin = createAdminClient();
  const { data: job } = await admin
    .from("job_posts")
    .select("*, employers(company_name)")
    .eq("id", jobId)
    .single();

  if (!job) return;

  const { data: alerts } = await admin
    .from("job_alerts")
    .select("*, profiles(email)")
    .eq("enabled", true);

  if (!alerts) return;

  for (const alert of alerts) {
    const profile = (alert as Record<string, unknown>).profiles as { email: string } | null;
    if (!profile?.email) continue;

    // Egyszerű relevanciaszűrés
    const workTypeMatch = !alert.work_type || alert.work_type === "mindketto" || alert.work_type === job.work_type;
    const ndMatch = !alert.open_to_neurodivergent || job.open_to_neurodivergent;
    const disabledMatch = !alert.open_to_disabled || job.open_to_disabled;
    const parentsMatch = !alert.open_to_parents || job.open_to_parents;
    const ptMatch = !alert.part_time || job.part_time_available === "igen";
    const cityMatch = !alert.city || job.city.toLowerCase().includes(alert.city.toLowerCase());
    const countyMatch = !alert.county || job.county === alert.county;

    if (workTypeMatch && ndMatch && disabledMatch && parentsMatch && ptMatch && cityMatch && countyMatch) {
      const companyName = (job.employers as { company_name: string } | null)?.company_name ?? "";
      await resend.emails.send({
        from: "VédettKarrier <noreply@vedettsarok.hu>",
        to: profile.email,
        subject: `[VédettKarrier] Új lehetőség: ${job.title}`,
        html: `<p>Új lehetőség jelent meg a VédettKarrier felületen:</p>
               <p><strong>${job.title}</strong> – ${companyName} – ${job.city}</p>
               <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/vedettmunka/allasok/${job.id}">Megnézem a lehetőséget</a></p>
               <hr><p style="font-size:12px;">Lehetőségfigyelőd módosításához: <a href="${process.env.NEXT_PUBLIC_SITE_URL}/vedettmunka/ertesito">VédettKarrier lehetőségfigyelő</a></p>`,
      }).catch(() => null);
    }
  }
}
