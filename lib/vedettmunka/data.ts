import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Employer, JobPost, JobAlert, JobReport, JobApplicationLog } from "./types";
import type { JobFilters } from "./categories";
import type { VmAttribute, VmJobAttributeValue, VmWorkProfile } from "./attributes";
import { deriveAttributesFromJobPost } from "./attributes";

// ─── Publikus lekérdezések ──────────────────────────────────────

export async function getPublishedJobs(filters: Partial<{
  work_type: string;
  city: string;
  county: string;
  work_location_type: string;
  category: string;
  part_time: boolean;
  open_to_neurodivergent: boolean;
  open_to_disabled: boolean;
  open_to_parents: boolean;
  mentor: boolean;
  written_instructions: boolean;
  quiet_environment: boolean;
  low_verbal: boolean;
  q: string;
}> = {}): Promise<(JobPost & { employers: { company_name: string } | null })[]> {
  const supabase = createClient();
  let query = supabase
    .from("job_posts")
    .select("*, employers(company_name)")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (filters.work_type) query = query.eq("work_type", filters.work_type);
  if (filters.category) query = query.eq("job_category", filters.category);
  if (filters.city) query = query.ilike("city", `%${filters.city}%`);
  if (filters.county) query = query.eq("county", filters.county);
  if (filters.work_location_type) query = query.eq("work_location_type", filters.work_location_type);
  if (filters.open_to_neurodivergent) query = query.eq("open_to_neurodivergent", true);
  if (filters.open_to_disabled) query = query.eq("open_to_disabled", true);
  if (filters.open_to_parents) query = query.eq("open_to_parents", true);
  if (filters.part_time) query = query.eq("part_time_available", "igen");
  if (filters.mentor) query = query.eq("mentor_available", "van");
  if (filters.written_instructions) query = query.eq("written_instructions_available", "igen");
  if (filters.quiet_environment) query = query.eq("noise_level", "csendes");
  if (filters.low_verbal) query = query.in("verbal_interaction_level", ["nem", "ritkan"]);
  if (filters.q) {
    query = query.or(`title.ilike.%${filters.q}%,tasks_description.ilike.%${filters.q}%`);
  }

  const { data } = await query.limit(100);
  return (data ?? []) as (JobPost & { employers: { company_name: string } | null })[];
}

/** Az összes aktív hirdetésben szereplő, nem üres megye lista (rendezve) */
export async function getPublishedJobCounties(): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("job_posts")
    .select("county")
    .eq("status", "published")
    .not("county", "is", null)
    .neq("county", "");
  const unique = [...new Set((data ?? []).map((r: { county: string }) => r.county).filter(Boolean))];
  return unique.sort((a, b) => a.localeCompare(b, "hu"));
}

export async function getPublishedJobById(id: string): Promise<(JobPost & { employers: Employer | null }) | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("job_posts")
    .select("*, employers(*)")
    .eq("id", id)
    .eq("status", "published")
    .single();
  return data as (JobPost & { employers: Employer | null }) | null;
}

// ─── Saját munkáltatói adatok ───────────────────────────────────

export async function getMyEmployer(): Promise<Employer | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("employers")
    .select("*")
    .eq("user_id", user.id)
    .single();
  return data as Employer | null;
}

export async function getMyJobPosts(): Promise<JobPost[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: employer } = await supabase
    .from("employers")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!employer) return [];
  const { data } = await supabase
    .from("job_posts")
    .select("*")
    .eq("employer_id", employer.id)
    .order("created_at", { ascending: false });
  return (data ?? []) as JobPost[];
}

// ─── Állásértesítő ──────────────────────────────────────────────

export async function getMyJobAlert(): Promise<JobAlert | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("job_alerts")
    .select("*")
    .eq("user_id", user.id)
    .single();
  return data as JobAlert | null;
}

// ─── Admin lekérdezések ────────────────────────────────────────

export async function adminGetEmployers(status?: string): Promise<Employer[]> {
  const admin = createAdminClient();
  let query = admin.from("employers").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return (data ?? []) as Employer[];
}

export async function adminGetJobPosts(status?: string): Promise<(JobPost & { employers: { company_name: string } | null })[]> {
  const admin = createAdminClient();
  let query = admin
    .from("job_posts")
    .select("*, employers(company_name)")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return (data ?? []) as (JobPost & { employers: { company_name: string } | null })[];
}

export async function adminGetJobReports(status?: string): Promise<(JobReport & { job_posts: { title: string } | null })[]> {
  const admin = createAdminClient();
  let query = admin
    .from("job_reports")
    .select("*, job_posts(title)")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return (data ?? []) as (JobReport & { job_posts: { title: string } | null })[];
}

export async function adminGetApplicationLogs(): Promise<(JobApplicationLog & { job_posts: { title: string } | null })[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("job_applications_log")
    .select("*, job_posts(title)")
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []) as (JobApplicationLog & { job_posts: { title: string } | null })[];
}

export async function adminGetVmKpis() {
  const admin = createAdminClient();
  const [employers, jobs, reports, apps] = await Promise.all([
    admin.from("employers").select("id, status"),
    admin.from("job_posts").select("id, status"),
    admin.from("job_reports").select("id, status"),
    admin.from("job_applications_log").select("id"),
  ]);
  const empRows = employers.data ?? [];
  const jobRows = jobs.data ?? [];
  const repRows = reports.data ?? [];
  return {
    employers_total: empRows.length,
    employers_pending: empRows.filter((r) => r.status === "pending_review").length,
    employers_approved: empRows.filter((r) => r.status === "approved").length,
    jobs_total: jobRows.length,
    jobs_published: jobRows.filter((r) => r.status === "published").length,
    jobs_pending: jobRows.filter((r) => r.status === "submitted" || r.status === "under_review").length,
    reports_open: repRows.filter((r) => r.status === "open").length,
    applications_total: (apps.data ?? []).length,
  };
}

// ─── Attribútum / piktogram lekérdezések ───────────────────────

/** Összes aktív attribútum a DB-ből */
export async function getAllAttributes(): Promise<VmAttribute[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("vm_job_attributes")
    .select("*")
    .eq("is_active", true)
    .order("category")
    .order("display_order");
  return (data ?? []) as VmAttribute[];
}

/** Egy álláshoz tartozó attribútumok (DB + legacy levezetés) */
export async function getJobAttributes(jobPostId: string, job?: JobPost): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("vm_job_attribute_values")
    .select("attribute_slug, value")
    .eq("job_post_id", jobPostId)
    .eq("value", "true");

  const dbSlugs = (data ?? []).map((r) => (r as VmJobAttributeValue).attribute_slug);

  // Backward compat: régi állásokhoz levezetett attribútumok
  const legacySlugs = job ? deriveAttributesFromJobPost(job) : [];
  return [...new Set([...dbSlugs, ...legacySlugs])];
}

/** Állás attribútumainak beállítása (teljes felülírás) */
export async function setJobAttributes(jobPostId: string, slugs: string[]): Promise<void> {
  const admin = createAdminClient();
  // Delete existing
  await admin.from("vm_job_attribute_values").delete().eq("job_post_id", jobPostId);
  if (slugs.length === 0) return;
  // Insert new
  const rows = slugs.map((slug) => ({ job_post_id: jobPostId, attribute_slug: slug, value: "true" }));
  await admin.from("vm_job_attribute_values").insert(rows);
}

/** Saját Munkaprofil lekérése */
export async function getMyWorkProfile(): Promise<VmWorkProfile | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("vm_work_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return data as VmWorkProfile | null;
}

/** Saját Munkaprofil mentése (upsert) */
export async function saveMyWorkProfile(attributeSlugs: string[], notes?: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nem vagy bejelentkezve.");
  await supabase.from("vm_work_profiles").upsert({
    user_id: user.id,
    attribute_slugs: attributeSlugs,
    notes: notes ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}
