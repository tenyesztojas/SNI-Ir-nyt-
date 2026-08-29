// ─── Munkáltató ────────────────────────────────────────────────
export type EmployerStatus = "pending_review" | "approved" | "rejected" | "suspended";

export interface Employer {
  id: string;
  user_id: string | null;
  company_name: string;
  tax_number: string | null;
  address: string;
  website: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  description: string;
  job_types_description: string;
  open_to_neurodivergent: boolean;
  open_to_disabled: boolean;
  open_to_parents: boolean;
  accepts_vm_terms: boolean;
  accepts_no_diagnosis_req: boolean;
  status: EmployerStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Hirdetés ──────────────────────────────────────────────────
export type JobStatus =
  | "draft" | "submitted" | "under_review" | "needs_revision"
  | "approved" | "published" | "rejected" | "expired" | "archived";

export type WorkType = "szellemi" | "fizikai";
export type WorkLocationType = "munkahelyen" | "otthonrol" | "hibrid";
export type ScheduleType = "allando" | "valtozo" | "muszakos" | "elore_tervezheto";
export type MentorAvailable = "van" | "nincs" | "meg_egyeztetes_alatt";

export interface JobPost {
  id: string;
  employer_id: string;
  title: string;
  city: string;
  county: string;
  workplace_address: string | null;
  work_type: WorkType;
  job_category: string;
  work_location_type: WorkLocationType;
  daily_hours: string;
  working_days: string;
  working_hours_from: string | null;
  working_hours_to: string | null;
  break_description: string | null;
  schedule_type: ScheduleType;
  salary_range: string;
  tasks_description: string;
  requirements_description: string;
  application_deadline: string | null;
  expected_start_date: string | null;
  training_description: string | null;
  mentor_available: MentorAvailable;
  interview_process: string | null;
  contact_name: string | null;
  contact_email: string | null;
  application_email: string;
  required_documents: string | null;
  notes: string | null;
  support_description: string;
  phone_required_level: string | null;
  verbal_interaction_level: string | null;
  interaction_with: string[];
  noise_level: string | null;
  written_instructions_available: string | null;
  break_flexibility: string | null;
  start_end_flexibility: string | null;
  part_time_available: string | null;
  open_to_parents: boolean;
  open_to_neurodivergent: boolean;
  open_to_disabled: boolean;
  status: JobStatus;
  admin_note: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  // join
  employers?: Pick<Employer, "company_name" | "website">;
}

// ─── Állásértesítő ──────────────────────────────────────────────
export type AlertFrequency = "azonnali" | "heti";

export interface JobAlert {
  id: string;
  user_id: string;
  enabled: boolean;
  categories: string[];
  work_type: WorkType | "mindketto" | null;
  city: string | null;
  county: string | null;
  home_office: boolean;
  hybrid: boolean;
  part_time: boolean;
  flexible_schedule: boolean;
  open_to_neurodivergent: boolean;
  open_to_disabled: boolean;
  open_to_parents: boolean;
  salary_min: number | null;
  frequency: AlertFrequency;
  created_at: string;
  updated_at: string;
}

// ─── Jelentés ──────────────────────────────────────────────────
export type ReportStatus = "open" | "reviewed" | "resolved" | "dismissed";

export interface JobReport {
  id: string;
  reporter_user_id: string | null;
  job_id: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

// ─── Napló ─────────────────────────────────────────────────────
export type DeliveryStatus = "pending" | "sent" | "failed";

export interface JobApplicationLog {
  id: string;
  job_id: string | null;
  employer_id: string | null;
  user_id: string | null;
  applicant_name: string;
  applicant_email: string;
  cv_filename: string | null;
  sent_at: string;
  delivery_status: DeliveryStatus;
  created_at: string;
}

// ─── CV készítő ────────────────────────────────────────────────
export interface CvData {
  // 1. Alapadatok
  nev: string;
  szuletesi_ev: string;
  lakhely: string;
  telefon: string;
  email: string;
  foto_base64: string | null; // data URL

  // 2. Jogosítványok
  b_jogositvany: boolean;
  targonca_jogositvany: boolean;
  egyeb_jogositvany: string;

  // 3. Iskolai végzettség
  iskolai_vegzettseg: string;
  iskola_helye: string;
  iskola_eve: string;

  // 4. Szakma
  szakma: string;
  szakma_helye: string;
  szakma_eve: string;

  // 5. Munkahelyek
  munkahelyek: Array<{
    hol: string;
    mit: string;
    mettol: string;
    meddig: string;
  }>;
  nem_dolgozott: boolean;

  // 6. Számítógépes ismeretek
  szamitogep: string[];

  // 7. Nyelvismeret
  nyelvek: Array<{ nyelv: string; szint: string }>;

  // 8. Munkába állás
  munkaba_allas: string;

  // 9. Egyéb
  egyeb_info: string;
}

export const EMPTY_CV: CvData = {
  nev: "",
  szuletesi_ev: "",
  lakhely: "",
  telefon: "",
  email: "",
  foto_base64: null,
  b_jogositvany: false,
  targonca_jogositvany: false,
  egyeb_jogositvany: "",
  iskolai_vegzettseg: "",
  iskola_helye: "",
  iskola_eve: "",
  szakma: "",
  szakma_helye: "",
  szakma_eve: "",
  munkahelyek: [{ hol: "", mit: "", mettol: "", meddig: "" }],
  nem_dolgozott: false,
  szamitogep: [],
  nyelvek: [{ nyelv: "", szint: "" }],
  munkaba_allas: "azonnal",
  egyeb_info: "",
};

// ─── Label mappings ─────────────────────────────────────────────
export const EMPLOYER_STATUS_LABELS: Record<EmployerStatus, string> = {
  pending_review: "Jóváhagyásra vár",
  approved: "Jóváhagyott",
  rejected: "Elutasított",
  suspended: "Felfüggesztett",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Piszkozat",
  submitted: "Beküldve",
  under_review: "Ellenőrzés alatt",
  needs_revision: "Javítás szükséges",
  approved: "Jóváhagyva",
  published: "Publikált",
  rejected: "Elutasítva",
  expired: "Lejárt",
  archived: "Archivált",
};

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  szellemi: "Szellemi munka",
  fizikai: "Fizikai munka",
};

export const WORK_LOCATION_LABELS: Record<WorkLocationType, string> = {
  munkahelyen: "Munkahelyen",
  otthonrol: "Otthonról",
  hibrid: "Hibrid",
};

export const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  allando: "Állandó",
  valtozo: "Változó",
  muszakos: "Műszakos",
  elore_tervezheto: "Előre tervezhető",
};

export const REPORT_REASONS = [
  "MLM / piramisjáték",
  "Gyors meggazdagodást ígér",
  "Diagnózist / egészségügyi iratot kér",
  "Sértő vagy stigmatizáló megfogalmazás",
  "Gyanús, megtévesztő ajánlat",
  "Valótlan adatok",
  "Egyéb",
];
