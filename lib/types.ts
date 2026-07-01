export type PlaceStatus = "pending" | "approved" | "rejected" | "archived";
export type ReviewStatus = "pending" | "approved" | "rejected" | "redacted";
export type UserRole = "user" | "admin";
export type ReportType = "hibas_adat" | "nem_mukodik" | "nem_megfelelo_tartalom" | "egyeb";
export type ReportStatus = "pending" | "resolved" | "dismissed";

export interface Category {
  slug: string;
  name: string;
  icon: string;
}

export interface Place {
  id: string;
  slug: string;
  name: string;
  category: string;
  city: string;
  postalCode?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  description: string;
  whyFriendly: string;
  ownExperience?: string;
  status: PlaceStatus;
  createdBy?: string | null;
}

export interface Review {
  id: string;
  placeId: string;
  authorId?: string | null;
  authorName: string;
  overallRating: number;
  noiseRating: number;
  crowdRating: number;
  staffEmpathyRating: number;
  safetyRating: number;
  quietSpaceRating: number;
  title: string;
  positiveText: string;
  warningText: string;
  wouldReturn: boolean;
  createdAt: string;
  status: ReviewStatus;
}

export interface Profile {
  id: string;
  displayName: string;
  role: UserRole;
  firstName?: string;
  showFirstName: boolean;
  newsletterSubscribed: boolean;
}

export interface Report {
  id: string;
  placeId: string;
  reviewId?: string | null;
  reportedBy?: string | null;
  reportType: ReportType;
  description: string;
  status: ReportStatus;
  createdAt: string;
}
