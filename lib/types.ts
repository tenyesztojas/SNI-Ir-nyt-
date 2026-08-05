export type PlaceStatus = "pending" | "approved" | "rejected" | "archived" | "published" | "removed";
export type ReviewStatus = "pending" | "approved" | "rejected" | "redacted" | "published" | "rejected_automated" | "removed";
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
  country?: string;
  postalCode?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  description: string;
  whyFriendly: string;
  ownExperience?: string;
  images?: string[] | null;
  status: PlaceStatus;
  createdBy?: string | null;
  submitter?: { displayName: string; email: string };
  source?: string | null;
  flaggedForReview?: boolean | null;
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
  images?: string[] | null;
  createdAt: string;
  status: ReviewStatus;
  flaggedForReview?: boolean | null;
  flagReason?: string | null;
  rejectionReason?: string | null;
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

export type ClaimStatus = "pending" | "verified" | "rejected";
export type ResponseStatus = "published" | "removed_by_report" | "removed_by_admin" | "pending_review";
export type ConsentType = "anonymous_only" | "share_contact" | "block";

export interface PlaceClaim {
  id: string;
  placeId: string;
  claimantUserId: string;
  verificationMethod: string;
  verificationData?: string | null;
  status: ClaimStatus;
  rejectReason?: string | null;
  createdAt: string;
  verifiedAt?: string | null;
  // joined fields
  placeName?: string;
  placeSlug?: string;
}

export interface PlaceResponse {
  id: string;
  reviewId: string;
  placeId: string;
  responderUserId: string;
  text: string;
  status: ResponseStatus;
  flaggedForReview?: boolean | null;
  flagReason?: string | null;
  createdAt: string;
  // joined
  placeName?: string;
}

export interface Message {
  id: string;
  reviewId?: string | null;
  placeId: string;
  senderUserId: string;
  recipientUserId: string;
  senderRole: "place" | "reviewer";
  text: string;
  createdAt: string;
  readAt?: string | null;
  // joined
  placeName?: string;
  reviewTitle?: string | null;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  placeId: string;
  reviewId?: string | null;
  consentType: ConsentType;
  grantedAt: string;
  revokedAt?: string | null;
}
