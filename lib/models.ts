export const USER_ROLES = ["worker", "business"] as const;

export const HOSPITALITY_ROLES = [
  "Chef",
  "Bartender",
  "Waiter / Server",
  "Barista",
  "Kitchen Porter",
  "Event Staff",
  "Sous Chef",
  "Restaurant Manager",
  "Front of House Supervisor",
] as const;

export const HOSPITALITY_SKILLS = [
  "Cocktail service",
  "Wine knowledge",
  "POS systems",
  "Food safety",
  "Plating",
  "Prep",
  "Stock control",
  "Customer service",
  "Events",
  "Cash handling",
  "Coffee",
  "Team leadership",
] as const;

export const BUSINESS_SECTORS = [
  "Restaurant",
  "Bar",
  "Hotel",
  "Catering",
  "Event Company",
] as const;

export const APPROVAL_STATUSES = ["pending", "verified", "rejected"] as const;

export const DOCUMENT_TYPES = [
  "food_safety_certificate",
  "right_to_work",
  "id_document",
  "other",
] as const;

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  food_safety_certificate: "Food safety certificate",
  right_to_work: "Right to work",
  id_document: "Photo ID",
  other: "Other supporting document",
};

export const WEEK_DAYS = [
  { key: 1, label: "Mon" },
  { key: 2, label: "Tue" },
  { key: 3, label: "Wed" },
  { key: 4, label: "Thu" },
  { key: 5, label: "Fri" },
  { key: 6, label: "Sat" },
  { key: 0, label: "Sun" },
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type HospitalityRole = (typeof HOSPITALITY_ROLES)[number];
export type HospitalitySkill = (typeof HOSPITALITY_SKILLS)[number];
export type BusinessSector = (typeof BUSINESS_SECTORS)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type UserRecord = {
  id: string;
  email: string | null;
  role: UserRole | null;
  role_selected: boolean;
  display_name: string | null;
  phone: string | null;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkHistoryItem = {
  venue: string;
  role: string;
  startYear: string;
  endYear: string;
  summary: string;
};

export type WorkerProfileRecord = {
  user_id: string;
  job_role: string;
  bio: string | null;
  skills: string[];
  hourly_rate_gbp: number | null;
  daily_rate_gbp: number | null;
  years_experience: number;
  city: string;
  postcode: string | null;
  travel_radius_miles: number;
  availability_summary: string | null;
  profile_photo_url: string | null;
  profile_photo_path: string | null;
  work_history: WorkHistoryItem[];
  verification_status: ApprovalStatus;
  created_at: string;
  updated_at: string;
};

export type WorkerAvailabilitySlotRecord = {
  id: string;
  worker_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
};

export type WorkerDocumentRecord = {
  id: string;
  worker_id: string;
  document_type: DocumentType;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  created_at: string;
  updated_at: string;
};

export type ReviewRecord = {
  id: string;
  booking_id: string;
  reviewer_user_id: string;
  reviewee_user_id: string;
  punctuality_rating: number;
  skill_rating: number;
  attitude_rating: number;
  reliability_rating: number;
  comment: string | null;
  created_at: string;
};

export type ReviewAggregate = {
  averageRating: number | null;
  reviewCount: number;
};

export type BusinessProfileRecord = {
  user_id: string;
  business_name: string;
  sector: string;
  contact_name: string | null;
  phone: string | null;
  address_line_1: string;
  city: string;
  postcode: string | null;
  description: string | null;
  verification_status: ApprovalStatus;
  created_at: string;
  updated_at: string;
};

export type WorkerDiscoveryFilters = {
  query: string;
  role: HospitalityRole | "";
  skills: string[];
  availableDay: number | "";
  maxHourlyRate: string;
  location: string;
  minRating: string;
  minTravelRadius: string;
};
