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
  booking_enabled?: boolean | null;
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
  pilotAccess: string[];
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

// ─────────────────────────────────────────────────────────────────────────────
// Booking platform típusok
// ─────────────────────────────────────────────────────────────────────────────

export type BookingType = "appointment" | "accommodation" | "both";
export type BookingStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "completed";
export type PackageType = "appointment" | "accommodation";
export type PriceUnit = "alkalom" | "éjszaka" | "fő" | "fő/éjszaka" | "óra";
export type SlotType = "recurring" | "specific" | "blocked";
export type ProviderRegistrationStatus = "pending" | "approved" | "rejected";

export interface ProviderRegistration {
  id: string;
  userId: string;
  placeId: string | null;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  taxNumber?: string | null;
  bookingType: BookingType;
  customDescription?: string | null;
  status: ProviderRegistrationStatus;
  rejectReason?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  // joined
  placeName?: string;
  placeSlug?: string;
}

export interface ProviderProfile {
  id: string;
  userId: string;
  placeId: string;
  registrationId?: string | null;
  companyName: string;
  contactEmail: string;
  contactPhone?: string | null;
  bookingType: BookingType;
  customDescription?: string | null;
  bookingNoticeHours: number;
  maxAdvanceDays: number;
  autoConfirm: boolean;
  cancellationPolicy?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  // joined
  placeName?: string;
  placeSlug?: string;
}

export interface ServicePackage {
  id: string;
  providerId: string;
  placeId: string;
  name: string;
  description?: string | null;
  packageType: PackageType;
  durationMinutes?: number | null;
  unitName?: string | null;
  maxGuests?: number | null;
  priceAmount: number;
  priceCurrency: string;
  priceUnit: PriceUnit;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface AvailabilitySlot {
  id: string;
  providerId: string;
  packageId?: string | null;
  slotType: SlotType;
  dayOfWeek?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  specificDate?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  capacity: number;
  createdAt: string;
}

export interface Booking {
  id: string;
  providerId: string;
  packageId: string;
  placeId: string;
  guestUserId?: string | null;
  bookingType: PackageType;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  checkinDate?: string | null;
  checkoutDate?: string | null;
  numGuests: number;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  guestNote?: string | null;
  totalAmount?: number | null;
  currency: string;
  status: BookingStatus;
  rejectReason?: string | null;
  confirmedAt?: string | null;
  cancelledAt?: string | null;
  dataRetentionUntil: string;
  createdAt: string;
  updatedAt: string;
  // joined
  placeName?: string;
  packageName?: string;
  providerCompanyName?: string;
}
