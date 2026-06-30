import { createClient } from "@/lib/supabase/server";
import { Category, Place, Review, Profile, Report } from "@/lib/types";

type PlaceRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  city: string;
  postal_code: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  description: string;
  why_friendly: string;
  own_experience: string | null;
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
    postalCode: row.postal_code ?? undefined,
    address: row.address,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    description: row.description,
    whyFriendly: row.why_friendly,
    ownExperience: row.own_experience ?? undefined,
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
  const places = await getVisiblePlaces();
  return places.filter((p) => p.status === "approved");
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
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(`*, profiles(${PROFILE_SELECT})`)
    .eq("place_id", placeId)
    .eq("status", "approved")
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
  return Array.from(new Set(places.map((p) => p.city))).sort((a, b) => a.localeCompare(b, "hu"));
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
    .select("id, display_name, role, first_name, show_first_name")
    .eq("id", user.id)
    .maybeSingle();

  const profile: Profile | null = profileRow
    ? {
        id: profileRow.id,
        displayName: profileRow.display_name,
        role: profileRow.role,
        firstName: profileRow.first_name ?? undefined,
        showFirstName: profileRow.show_first_name ?? false,
      }
    : null;

  return { user: { id: user.id, email: user.email }, profile };
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { profile } = await getCurrentUserAndProfile();
  return profile?.role === "admin";
}
