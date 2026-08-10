import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Category, Place, Review, Profile, Report } from "@/lib/types";

// Magyar ékezetes karaktereket alapbetűkre cseréli rendezéshez
function huNormalize(s: string): string {
  return (s ?? "").trim().toLowerCase()
    .replace(/[áÁ]/g, "a").replace(/[éÉ]/g, "e").replace(/[íÍ]/g, "i")
    .replace(/[óÓőŐ]/g, "o").replace(/[öÖ]/g, "o")
    .replace(/[úÚűŰ]/g, "u").replace(/[üÜ]/g, "u");
}
function huSort(a: string, b: string): number {
  return huNormalize(a).localeCompare(huNormalize(b));
}

type PlaceRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  city: string;
  country: string | null;
  postal_code: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  description: string;
  why_friendly: string;
  own_experience: string | null;
  images: string[] | null;
  status: Place["status"];
  created_by: string | null;
};

type ReviewRow = {
  id: string;
  place_id: string;
  author_id: string | null;
  title: string;
  overall_rating: number;
  noise_rating: number;
  crowd_rating: number;
  staff_empathy_rating: number;
  safety_rating: number;
  quiet_space_rating: number;
  positive_text: string;
  warning_text: string | null;
  would_return: boolean;
  images: string[] | null;
  status: Review["status"];
  created_at: string;
  profiles?: {
    display_name: string;
    first_name: string | null;
    show_first_name: boolean;
  } | {
    display_name: string;
    first_name: string | null;
    show_first_name: boolean;
  }[] | null;
};

type ReportRow = {
  id: string;
  place_id: string;
  review_id: string | null;
  reported_by: string | null;
  report_type: Report["reportType"];
  description: string;
  status: Report["status"];
  created_at: string;
};

export type ReportWithPlace = Report & { placeName: string; placeSlug: string };

type ReportRowWithPlace = ReportRow & {
  places?: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

function mapPlace(row: PlaceRow): Place {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    city: row.city,
    country: row.country ?? "Magyarország",
    postalCode: row.postal_code ?? undefined,
    address: row.address,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    description: row.description,
    whyFriendly: row.why_friendly,
    ownExperience: row.own_experience ?? undefined,
    images: row.images ?? null,
    status: row.status,
    createdBy: row.created_by,
  };
}

function authorName(profiles: ReviewRow["profiles"]): string {
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  if (!profile) return "Közösségi tag";
  if (profile.show_first_name && profile.first_name) return profile.first_name;
  return profile.display_name ?? "Közösségi tag";
}

function mapReview(row: ReviewRow): Review {
  return {
    id: row.id,
    placeId: row.place_id,
    authorId: row.author_id,
    authorName: authorName(row.profiles),
    overallRating: row.overall_rating,
    noiseRating: row.noise_rating,
    crowdRating: row.crowd_rating,
    staffEmpathyRating: row.staff_empathy_rating,
    safetyRating: row.safety_rating,
    quietSpaceRating: row.quiet_space_rating,
    title: row.title,
    positiveText: row.positive_text,
    warningText: row.warning_text ?? "",
    wouldReturn: row.would_return,
    images: row.images ?? null,
    createdAt: row.created_at,
    status: row.status,
  };
}

function mapReport(row: ReportRow): Report {
  return {
    id: row.id,
    placeId: row.place_id,
    reviewId: row.review_id,
    reportedBy: row.reported_by,
    reportType: row.report_type,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}

function placeRef(places: ReportRowWithPlace["places"]): { name: string; slug: string } | null {
  const place = Array.isArray(places) ? places[0] : places;
  return place ?? null;
}

export async function getCategories(): Promise<Category[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("slug, name, icon")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function getCategoryBySlug(slug: string): Promise<Category | undefined> {
  const categories = await getCategories();
  return categories.find((c) => c.slug === slug);
}

export async function getVisiblePlaces(): Promise<Place[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("places").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map(mapPlace);
}

export async function getApprovedPlaces(): Promise<Place[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("places")
    .select("*")
    .eq("status", "published")
    .order("name");
  if (error) throw error;
  return (data ?? [])
    .map(mapPlace)
    .sort((a, b) => huSort(a.name, b.name));
}

export async function getPlaceBySlug(slug: string): Promise<Place | undefined> {
  const supabase = createClient();
  const { data, error } = await supabase.from("places").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data ? mapPlace(data) : undefined;
}

export async function getPlaceById(id: string): Promise<Place | undefined> {
  const supabase = createClient();
  const { data, error } = await supabase.from("places").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapPlace(data) : undefined;
}

export async function getPendingPlaces(): Promise<Place[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("places")
    .select("*")
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapPlace);
}

const PROFILE_SELECT = "display_name, first_name, show_first_name";

export async function getApprovedReviewsForPlace(placeId: string): Promise<Review[]> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("reviews")
    .select(`*, profiles(${PROFILE_SELECT})`)
    .eq("place_id", placeId)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapReview);
}

export async function getPendingReviews(): Promise<Review[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(`*, profiles(${PROFILE_SELECT})`)
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapReview);
}


export async function getFlaggedReviews(): Promise<Review[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(`*, profiles(${PROFILE_SELECT})`)
    .eq("flagged_for_review", true)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapReview);
}

export async function getAdminReviews(): Promise<Review[]> {
  // Megjelölt + bejelentett közzétett értékelések admin kezeléshez
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(`*, profiles(${PROFILE_SELECT})`)
    .in("status", ["published", "removed"])
    .eq("flagged_for_review", true)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapReview);
}

export async function getOwnPlaces(userId: string): Promise<Place[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("places")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPlace);
}

export async function getOwnReviews(userId: string): Promise<Review[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(`*, profiles(${PROFILE_SELECT})`)
    .eq("author_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapReview);
}

export async function getFavoritePlaceIds(userId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("favorites").select("place_id").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.place_id);
}

export async function isPlaceFavorited(userId: string, placeId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("favorites")
    .select("place_id")
    .eq("user_id", userId)
    .eq("place_id", placeId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function getFavoritePlaces(userId: string): Promise<Place[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("favorites")
    .select("created_at, places(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((row) => {
      const place = Array.isArray(row.places) ? row.places[0] : row.places;
      return place ? mapPlace(place as PlaceRow) : null;
    })
    .filter((p): p is Place => p !== null);
}

export async function getPendingReports(): Promise<ReportWithPlace[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("*, places(name, slug)")
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const place = placeRef((row as ReportRowWithPlace).places);
    return {
      ...mapReport(row),
      placeName: place?.name ?? "Ismeretlen hely",
      placeSlug: place?.slug ?? "",
    };
  });
}

export function citiesFromPlaces(places: Place[]): string[] {
  return Array.from(new Set(places.map((p) => p.city))).sort((a, b) => huSort(a, b));
}

export function countriesFromPlaces(places: Place[]): string[] {
  const all = [...new Set(places.map((p) => p.country ?? "Magyarország"))];
  return all.sort((a, b) => a === "Magyarország" ? -1 : b === "Magyarország" ? 1 : a.localeCompare(b, "hu"));
}

export async function getCurrentUserAndProfile(): Promise<{
  user: { id: string; email?: string } | null;
  profile: Profile | null;
}> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { user: null, profile: null };

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id, display_name, role, first_name, show_first_name, newsletter_subscribed")
    .eq("id", user.id)
    .maybeSingle();

  const profile: Profile | null = profileRow
    ? {
        id: profileRow.id,
        displayName: profileRow.display_name,
        role: profileRow.role,
        firstName: profileRow.first_name ?? undefined,
        showFirstName: profileRow.show_first_name ?? false,
        newsletterSubscribed: profileRow.newsletter_subscribed ?? true,
      }
    : null;

  return { user: { id: user.id, email: user.email }, profile };
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { profile } = await getCurrentUserAndProfile();
  return profile?.role === "admin";
}

// --- Admin: beküldő azonosítása (profil neve + e-mail) ---

async function fetchSubmitterInfo(
  userId: string | null | undefined
): Promise<{ displayName: string; email: string }> {
  if (!userId) return { displayName: "–", email: "Adminisztrátor vagy importált adat" };
  try {
    const admin = createAdminClient();
    const [{ data: profileData }, { data: authData }] = await Promise.all([
      admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ]);
    const displayName = profileData?.display_name ?? "Névtelen felhasználó";
    const email = authData.user?.email ?? "Nincs e-mail adat";
    return { displayName, email };
  } catch {
    return { displayName: "Azonosítatlan", email: "Lekérdezési hiba" };
  }
}

export async function getPendingPlacesWithSubmitter(): Promise<Place[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("places")
    .select("*")
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;

  const places = (data ?? []).map(mapPlace);

  // Beküldők lekérése párhuzamosan
  const submitters = await Promise.all(
    places.map((p) => fetchSubmitterInfo(p.createdBy))
  );
  return places.map((p, i) => ({ ...p, submitter: submitters[i] }));
}

export async function getPlaceByIdWithSubmitter(id: string): Promise<Place | undefined> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("places").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  const place = mapPlace(data);
  place.submitter = await fetchSubmitterInfo(place.createdBy);
  return place;
}

// ─────────────────────────────────────────────────────────────────────────────
// Place claims + responses — Nyilvános Válasz / Hely-igénylés
// ─────────────────────────────────────────────────────────────────────────────

import { PlaceClaim, PlaceResponse } from "@/lib/types";

/** Ellenőrzött claim lekérése egy hely számára */
export async function getVerifiedClaimForPlace(
  placeId: string
): Promise<PlaceClaim | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("place_claims")
    .select("id, place_id, claimant_user_id, verification_method, verification_data, status, reject_reason, created_at, verified_at")
    .eq("place_id", placeId)
    .eq("status", "verified")
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    placeId: data.place_id,
    claimantUserId: data.claimant_user_id,
    verificationMethod: data.verification_method,
    verificationData: data.verification_data,
    status: data.status,
    rejectReason: data.reject_reason,
    createdAt: data.created_at,
    verifiedAt: data.verified_at,
  };
}

/** Aktív nyilvános válaszok lekérése egy helyhez (review_id → válasz) */
export async function getPublishedResponsesForPlace(
  placeId: string
): Promise<Record<string, PlaceResponse>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("place_responses")
    .select("id, review_id, place_id, responder_user_id, text, status, flagged_for_review, flag_reason, created_at")
    .eq("place_id", placeId)
    .eq("status", "published");

  const map: Record<string, PlaceResponse> = {};
  for (const r of data ?? []) {
    map[r.review_id] = {
      id: r.id,
      reviewId: r.review_id,
      placeId: r.place_id,
      responderUserId: r.responder_user_id,
      text: r.text,
      status: r.status,
      flaggedForReview: r.flagged_for_review,
      flagReason: r.flag_reason,
      createdAt: r.created_at,
    };
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Booking adatok a hely oldalához
// ─────────────────────────────────────────────────────────────────────────────

import { ServicePackage, AvailabilitySlot, ProviderProfile } from "@/lib/types";

/** Feature flag: booking_live értéke */
export async function isBookingLive(): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("feature_flags")
    .select("value")
    .eq("key", "booking_live")
    .single();
  return data?.value === true || data?.value === "true";
}

/** Provider profil lekérése egy helyhez (ha van aktív) */
export async function getProviderForPlace(
  placeId: string
): Promise<ProviderProfile | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("provider_profiles")
    .select("id, user_id, place_id, company_name, contact_email, contact_phone, booking_type, custom_description, booking_notice_hours, max_advance_days, auto_confirm, cancellation_policy, active, created_at, updated_at")
    .eq("place_id", placeId)
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    userId: data.user_id,
    placeId: data.place_id,
    companyName: data.company_name,
    contactEmail: data.contact_email,
    contactPhone: data.contact_phone,
    bookingType: data.booking_type,
    customDescription: data.custom_description,
    bookingNoticeHours: data.booking_notice_hours,
    maxAdvanceDays: data.max_advance_days,
    autoConfirm: data.auto_confirm,
    cancellationPolicy: data.cancellation_policy,
    active: data.active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/** Aktív szolgáltatás csomagok + elérhetőségek egy hely provideréhez */
export async function getBookingDataForPlace(providerId: string): Promise<{
  packages: ServicePackage[];
  slots: AvailabilitySlot[];
}> {
  const admin = createAdminClient();
  const [pkgRes, slotRes] = await Promise.all([
    admin.from("service_packages").select("*").eq("provider_id", providerId).eq("active", true).order("sort_order"),
    admin.from("availability_slots").select("*").eq("provider_id", providerId),
  ]);

  const packages: ServicePackage[] = (pkgRes.data ?? []).map((p) => ({
    id: p.id, providerId: p.provider_id, placeId: p.place_id,
    name: p.name, description: p.description, packageType: p.package_type,
    durationMinutes: p.duration_minutes, unitName: p.unit_name, maxGuests: p.max_guests,
    priceAmount: p.price_amount, priceCurrency: p.price_currency, priceUnit: p.price_unit,
    active: p.active, sortOrder: p.sort_order, createdAt: p.created_at,
  }));

  const slots: AvailabilitySlot[] = (slotRes.data ?? []).map((s) => ({
    id: s.id, providerId: s.provider_id, packageId: s.package_id, slotType: s.slot_type,
    dayOfWeek: s.day_of_week, startTime: s.start_time, endTime: s.end_time,
    specificDate: s.specific_date, dateFrom: s.date_from, dateTo: s.date_to,
    capacity: s.capacity, createdAt: s.created_at,
  }));

  return { packages, slots };
}

// ─── PWA statisztika ──────────────────────────────────────────────────────────
export async function getPwaStats(): Promise<{
  totalInstalls: number;
  androidInstalls: number;
  iosInstalls: number;
  totalSessions: number;
  last30DaySessions: number;
}> {
  const adminClient = createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: installs }, { data: sessions }, { data: recentSessions }] = await Promise.all([
    adminClient.from("pwa_stats").select("platform").eq("event_type", "install"),
    adminClient.from("pwa_stats").select("id").eq("event_type", "session"),
    adminClient.from("pwa_stats").select("id").eq("event_type", "session").gte("created_at", thirtyDaysAgo),
  ]);

  return {
    totalInstalls: installs?.length ?? 0,
    androidInstalls: installs?.filter((r) => r.platform === "android").length ?? 0,
    iosInstalls: installs?.filter((r) => r.platform === "ios").length ?? 0,
    totalSessions: sessions?.length ?? 0,
    last30DaySessions: recentSessions?.length ?? 0,
  };
}

// ─── Admin naplók ─────────────────────────────────────────────────────────────

export async function getPlacesLog(): Promise<Array<{
  id: string; name: string; city: string; slug: string;
  status: string; source: string | null;
  createdAt: string; submitterName: string | null;
}>> {
  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from("places")
    .select("id, name, city, slug, status, source, created_at, created_by")
    .order("created_at", { ascending: false });

  if (!data) return [];

  // Beküldők display_name-jének lekérése
  const userIds = [...new Set(data.map((p) => p.created_by).filter(Boolean))];
  const profileMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    for (const p of profiles ?? []) profileMap[p.id] = p.display_name;
  }

  return data.map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    slug: p.slug,
    status: p.status,
    source: p.source,
    createdAt: p.created_at,
    submitterName: p.created_by ? (profileMap[p.created_by] ?? "Ismeretlen") : "Admin",
  }));
}

export async function getAllReviewsLog(): Promise<Array<{
  id: string; title: string; overallRating: number;
  placeName: string; placeSlug: string;
  authorName: string; createdAt: string;
  status: string; flagged: boolean;
}>> {
  const adminClient = createAdminClient();
  const { data: reviews } = await adminClient
    .from("reviews")
    .select("id, title, overall_rating, place_id, author_id, status, flagged_for_review, created_at, profiles(display_name)")
    .order("created_at", { ascending: false });

  if (!reviews) return [];

  const placeIds = [...new Set(reviews.map((r) => r.place_id))];
  const placeMap: Record<string, { name: string; slug: string }> = {};
  if (placeIds.length > 0) {
    const { data: places } = await adminClient
      .from("places")
      .select("id, name, slug")
      .in("id", placeIds);
    for (const p of places ?? []) placeMap[p.id] = { name: p.name, slug: p.slug };
  }

  return reviews.map((r) => ({
    id: r.id,
    title: r.title,
    overallRating: r.overall_rating,
    placeName: placeMap[r.place_id]?.name ?? "Ismeretlen hely",
    placeSlug: placeMap[r.place_id]?.slug ?? "",
    authorName: (r.profiles as unknown as { display_name: string } | null)?.display_name ?? "Anonim",
    createdAt: r.created_at,
    status: r.status ?? "published",
    flagged: r.flagged_for_review ?? false,
  }));
}
