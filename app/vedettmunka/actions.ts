"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Munkáltatói regisztráció ───────────────────────────────────

export async function registerEmployer(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nincs bejelentkezve.");

  const obj = {
    user_id: user.id,
    company_name: (formData.get("company_name") as string).trim(),
    tax_number: (formData.get("tax_number") as string)?.trim() || null,
    address: (formData.get("address") as string).trim(),
    website: (formData.get("website") as string)?.trim() || null,
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

  const { error } = await supabase.from("employers").insert(obj);
  if (error) throw new Error(error.message);

  // Admin értesítő e-mail
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await resend.emails.send({
      from: "Védett Munka <noreply@vedettsarok.hu>",
      to: adminEmail,
      subject: `[Védett Munka] Új munkáltatói regisztráció: ${obj.company_name}`,
      html: `<p>Új munkáltatói regisztráció érkezett: <strong>${obj.company_name}</strong></p>
             <p>Kapcsolattartó: ${obj.contact_name} &lt;${obj.contact_email}&gt;</p>
             <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin/vedettmunka/munkaltatok">Admin kezelés</a></p>`,
    }).catch(() => null);
  }

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
      from: "Védett Munka <noreply@vedettsarok.hu>",
      to: adminEmail,
      subject: `[Védett Munka] Új hirdetés jóváhagyásra vár: ${obj.title}`,
      html: `<p>Új hirdetés érkezett: <strong>${obj.title}</strong></p>
             <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin/vedettmunka/hirdetesek">Admin kezelés</a></p>`,
    }).catch(() => null);
  }

  revalidatePath("/vedettmunka/hirdetes-feladas");
}

// ─── Állásértesítő ──────────────────────────────────────────────

export async function upsertJobAlert(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nincs bejelentkezve.");

  const categories = formData.getAll("categories") as string[];

  const obj = {
    user_id: user.id,
    enabled: formData.get("enabled") === "true",
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

// ─── Admin: munkáltató státusz ──────────────────────────────────

export async function adminUpdateEmployerStatus(
  id: string,
  status: string,
  note?: string
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("employers")
    .update({ status, admin_note: note ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/vedettmunka/munkaltatok");
}

// ─── Admin: hirdetés státusz ────────────────────────────────────

export async function adminUpdateJobStatus(
  id: string,
  status: string,
  note?: string
) {
  const admin = createAdminClient();

  const update: Record<string, unknown> = {
    status,
    admin_note: note ?? null,
    updated_at: new Date().toISOString(),
  };
  if (status === "published") {
    update.published_at = new Date().toISOString();
    update.expires_at = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 nap
    // Értesítők küldése async (nem blokkoló)
    sendJobAlertEmails(id).catch(() => null);
  }

  const { error } = await admin.from("job_posts").update(update).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/vedettmunka/hirdetesek");
}

// ─── Admin: hirdetés jelentés ───────────────────────────────────

export async function adminUpdateReportStatus(
  id: string,
  status: string,
  note?: string
) {
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
  revalidatePath("/admin/vedettmunka/jelentesek");
}

// ─── Állásértesítő e-mailek küldése (publikáláskor) ─────────────

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
        from: "Védett Munka <noreply@vedettsarok.hu>",
        to: profile.email,
        subject: `[Védett Munka] Új állás: ${job.title}`,
        html: `<p>Új álláslehetőség jelent meg a Védett Munka felületen:</p>
               <p><strong>${job.title}</strong> – ${companyName} – ${job.city}</p>
               <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/vedettmunka/allasok/${job.id}">Megnézem az állást</a></p>
               <hr><p style="font-size:12px;">Értesítőd módosításához: <a href="${process.env.NEXT_PUBLIC_SITE_URL}/vedettmunka/ertesito">Védett Munka értesítők</a></p>`,
      }).catch(() => null);
    }
  }
}
