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

export const WORKER_ROLE_TAXONOMY = [
  {
    slug: "back-of-house",
    label: "Kitchen",
    sortOrder: 1,
    roles: [
      {
        slug: "chef",
        label: "Chef",
        searchTerms: ["kitchen", "cook", "line chef"],
      },
      {
        slug: "kitchen-porter",
        label: "Kitchen Porter",
        searchTerms: ["kp", "kitchen assistant", "porter"],
      },
      {
        slug: "commis-chef",
        label: "Commis Chef",
        searchTerms: ["junior chef", "commis"],
      },
      {
        slug: "demi-chef-de-partie",
        label: "Demi Chef de Partie",
        searchTerms: ["demi cdp", "chef de partie"],
      },
      {
        slug: "chef-de-partie",
        label: "Chef de Partie",
        searchTerms: ["cdp", "section chef"],
      },
      {
        slug: "senior-chef-de-partie",
        label: "Senior Chef de Partie",
        searchTerms: ["senior cdp", "lead cdp"],
      },
      {
        slug: "junior-sous-chef",
        label: "Junior Sous Chef",
        searchTerms: ["junior sous", "jr sous"],
      },
      {
        slug: "sous-chef",
        label: "Sous Chef",
        searchTerms: ["sous"],
      },
      {
        slug: "head-chef",
        label: "Head Chef",
        searchTerms: ["lead chef", "kitchen lead"],
      },
      {
        slug: "executive-head-chef",
        label: "Executive Head Chef",
        searchTerms: ["exec chef", "executive chef"],
      },
      {
        slug: "pastry-chef",
        label: "Pastry Chef",
        searchTerms: ["dessert", "pastry"],
      },
      {
        slug: "breakfast-chef",
        label: "Breakfast Chef",
        searchTerms: ["morning chef", "brunch chef"],
      },
      {
        slug: "prep-chef",
        label: "Prep Chef",
        searchTerms: ["preparation", "prep"],
      },
      {
        slug: "grill-chef",
        label: "Grill Chef",
        searchTerms: ["grill", "chargrill"],
      },
      {
        slug: "pizza-chef",
        label: "Pizza Chef",
        searchTerms: ["pizzaiolo", "pizza"],
      },
    ],
  },
  {
    slug: "front-of-house",
    label: "Front of House",
    sortOrder: 2,
    roles: [
      {
        slug: "server",
        label: "Server",
        searchTerms: ["wait staff", "serving"],
      },
      {
        slug: "food-runner",
        label: "Food Runner",
        searchTerms: ["runner", "food service"],
      },
      {
        slug: "waiter",
        label: "Waiter",
        searchTerms: ["server", "front of house"],
      },
      {
        slug: "waitress",
        label: "Waitress",
        searchTerms: ["server", "front of house"],
      },
      {
        slug: "senior-waiter",
        label: "Senior Waiter",
        searchTerms: ["head waiter", "lead server"],
      },
      {
        slug: "host",
        label: "Host",
        searchTerms: ["reception", "greeter"],
      },
      {
        slug: "hostess",
        label: "Hostess",
        searchTerms: ["reception", "greeter"],
      },
      {
        slug: "front-of-house-supervisor",
        label: "Front of House Supervisor",
        searchTerms: ["foh supervisor", "floor supervisor"],
      },
      {
        slug: "supervisor",
        label: "Supervisor",
        searchTerms: ["floor supervisor", "service supervisor"],
      },
      {
        slug: "barista",
        label: "Barista",
        searchTerms: ["coffee", "espresso"],
      },
    ],
  },
  {
    slug: "bar",
    label: "Bar",
    sortOrder: 3,
    roles: [
      {
        slug: "bartender",
        label: "Bartender",
        searchTerms: ["bar staff", "mixology"],
      },
      {
        slug: "cocktail-bartender",
        label: "Cocktail Bartender",
        searchTerms: ["mixologist", "cocktail"],
      },
      {
        slug: "senior-bartender",
        label: "Senior Bartender",
        searchTerms: ["lead bartender", "bar lead"],
      },
      {
        slug: "bar-supervisor",
        label: "Bar Supervisor",
        searchTerms: ["bar lead", "supervisor"],
      },
      {
        slug: "bar-manager",
        label: "Bar Manager",
        searchTerms: ["bar operations", "manager"],
      },
    ],
  },
  {
    slug: "management",
    label: "Management",
    sortOrder: 4,
    roles: [
      {
        slug: "assistant-manager",
        label: "Assistant Manager",
        searchTerms: ["assistant gm", "deputy manager"],
      },
      {
        slug: "duty-manager",
        label: "Duty Manager",
        searchTerms: ["shift manager", "duty"],
      },
      {
        slug: "restaurant-manager",
        label: "Restaurant Manager",
        searchTerms: ["rm", "operations manager"],
      },
      {
        slug: "general-manager",
        label: "General Manager",
        searchTerms: ["gm", "venue manager"],
      },
    ],
  },
  {
    slug: "events-support",
    label: "Events / Support",
    sortOrder: 5,
    roles: [
      {
        slug: "event-staff",
        label: "Event Staff",
        searchTerms: ["events", "festival staff"],
      },
      {
        slug: "porter",
        label: "Porter",
        searchTerms: ["support", "portering"],
      },
      {
        slug: "runner",
        label: "Runner",
        searchTerms: ["general runner", "support runner"],
      },
      {
        slug: "catering-assistant",
        label: "Catering Assistant",
        searchTerms: ["catering", "assistant"],
      },
    ],
  },
] as const;

export const BUSINESS_SECTORS = [
  "Restaurant",
  "Bar",
  "Hotel",
  "Catering",
  "Event Company",
  "Other",
] as const;

export const APPROVAL_STATUSES = ["pending", "verified", "rejected"] as const;
export const BOOKING_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "completed",
  "cancelled",
  "no_show",
] as const;
export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
  "disputed",
  // Legacy values kept for backwards compatibility during migration.
  "authorized",
  "captured",
  "released",
] as const;
export const PAYOUT_STATUSES = [
  "not_started",
  "pending",
  "in_progress",
  "completed",
  "failed",
  "on_hold",
  // Legacy values kept for backwards compatibility during migration.
  "pending_confirmation",
  "awaiting_shift_completion",
  "awaiting_business_approval",
  "approved_for_payout",
  "paid",
  "disputed",
] as const;
export const ATTENDANCE_STATUSES = [
  "not_started",
  "checked_in",
  "checked_out",
  "pending_approval",
  "approved",
  "disputed",
  "adjusted",
] as const;
export const SHIFT_LISTING_STATUSES = ["open", "claimed", "cancelled"] as const;
export const WORKER_AVAILABILITY_STATUSES = [
  "available",
  "unavailable",
  "partial",
] as const;
export const WORKER_RELIABILITY_STATUSES = [
  "good_standing",
  "warned",
  "temporarily_blocked",
] as const;
export const WORKER_RELIABILITY_EVENT_TYPES = [
  "completed",
  "cancelled_early",
  "cancelled_late",
  "no_show",
  "strike_applied",
  "block_applied",
] as const;

export const DOCUMENT_TYPES = [
  "food_safety_certificate",
  "right_to_work",
  "id_document",
  "other",
] as const;

export const BUSINESS_DOCUMENT_TYPES = ["verification_document"] as const;

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  food_safety_certificate: "Food safety certificate",
  right_to_work: "Right to work",
  id_document: "Photo ID",
  other: "Other supporting document",
};

export const BUSINESS_DOCUMENT_LABELS: Record<BusinessDocumentType, string> = {
  verification_document: "Business verification document",
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

export type UserRole = (typeof USER_ROLES)[number] | "admin";
export type HospitalityRole = string;
export type BusinessSector = (typeof BUSINESS_SECTORS)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type ShiftListingStatus = (typeof SHIFT_LISTING_STATUSES)[number];
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type BusinessDocumentType = (typeof BUSINESS_DOCUMENT_TYPES)[number];
export type WorkerAvailabilityStatus = (typeof WORKER_AVAILABILITY_STATUSES)[number];
export type WorkerReliabilityStatus = (typeof WORKER_RELIABILITY_STATUSES)[number];
export type WorkerReliabilityEventType = (typeof WORKER_RELIABILITY_EVENT_TYPES)[number];
export type WorkerRoleCategorySlug = (typeof WORKER_ROLE_TAXONOMY)[number]["slug"];

export type RoleCategoryRecord = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type RoleRecord = {
  id: string;
  category_id: string;
  slug: string;
  label: string;
  search_terms: string[] | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  category_slug?: string;
  category_label?: string;
};

export type WorkerRoleRecord = {
  id: string;
  worker_id: string;
  role_id: string;
  is_primary: boolean;
  created_at: string;
};

export type UserRecord = {
  id: string;
  email: string | null;
  role: UserRole | null;
  role_selected: boolean;
  display_name: string | null;
  phone: string | null;
  whatsapp_opt_in: boolean;
  onboarding_complete: boolean;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketplaceUserRecord = {
  id: string;
  role: UserRole | null;
  display_name: string | null;
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
  primary_role_id: string | null;
  bio: string | null;
  hourly_rate_gbp: number | null;
  years_experience: number;
  city: string;
  postcode: string | null;
  travel_radius_miles: number;
  availability_summary: string | null;
  profile_photo_url: string | null;
  profile_photo_path: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_details_submitted: boolean;
  stripe_connect_payouts_enabled: boolean;
  stripe_connect_charges_enabled: boolean;
  stripe_connect_onboarding_completed_at: string | null;
  stripe_connect_last_synced_at: string | null;
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

export type WorkerAvailabilityRecord = {
  id: string;
  worker_id: string;
  availability_date: string;
  status: WorkerAvailabilityStatus;
  start_datetime: string | null;
  end_datetime: string | null;
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

export type BusinessDocumentRecord = {
  id: string;
  business_id: string;
  document_type: BusinessDocumentType;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  created_at: string;
  updated_at: string;
};

export type WorkerReliabilityRecord = {
  worker_id: string;
  active_strikes: number;
  reliability_status: WorkerReliabilityStatus;
  blocked_until: string | null;
  late_cancellations_count: number;
  no_show_count: number;
  completed_shifts_count: number;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkerReliabilityEventRecord = {
  id: string;
  worker_id: string;
  booking_id: string | null;
  event_type: WorkerReliabilityEventType;
  strike_value: number;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type EmailNotificationType =
  | "booking_confirmed_worker"
  | "booking_confirmed_business"
  | "shift_reminder_24h_worker"
  | "shift_reminder_24h_business"
  | "payment_received_worker";

export type EmailNotificationRecord = {
  id: string;
  type: EmailNotificationType;
  recipient_email: string;
  booking_id: string | null;
  user_id: string | null;
  provider_message_id: string | null;
  metadata: Record<string, unknown>;
  sent_at: string;
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

export type BookingRecord = {
  id: string;
  worker_id: string;
  business_id: string;
  shift_date: string;
  shift_end_date: string | null;
  shift_listing_id: string | null;
  requested_role_label: string | null;
  shift_duration_hours: number | null;
  start_time: string;
  end_time: string;
  hourly_rate_gbp: number;
  location: string;
  notes: string | null;
  status: BookingStatus;
  total_amount_gbp: number;
  platform_fee_gbp: number;
  worker_checked_in_at: string | null;
  worker_checked_out_at: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  worker_hours_claimed: number | null;
  business_hours_approved: number | null;
  attendance_status: AttendanceStatus;
  business_adjustment_reason: string | null;
  approved_by_business_at: string | null;
  approved_by_business_id: string | null;
  admin_override_reason: string | null;
  attendance_notes: string | null;
  business_confirmed_start_at: string | null;
  business_confirmed_end_at: string | null;
  business_confirmed_at: string | null;
  business_confirmed_by: string | null;
  manager_confirmation_name: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentRecord = {
  id: string;
  booking_id: string;
  business_id: string;
  worker_id: string;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_checkout_url: string | null;
  stripe_checkout_expires_at: string | null;
  currency: string;
  gross_amount_gbp: number;
  platform_fee_gbp: number;
  worker_payout_gbp: number;
  status: PaymentStatus;
  payment_status?: PaymentStatus | null;
  payout_status: PayoutStatus;
  shift_completed_at: string | null;
  shift_completion_confirmed_by: string | null;
  payout_approved_at: string | null;
  payout_approved_by: string | null;
  payout_sent_at: string | null;
  transfer_started_at?: string | null;
  transfer_failed_at?: string | null;
  failure_reason?: string | null;
  dispute_reason: string | null;
  disputed_at: string | null;
  payout_hold_reason?: string | null;
  stripe_last_synced_at?: string | null;
  stripe_payment_status?: string | null;
  stripe_transfer_status?: string | null;
  reconciliation_status?: string | null;
  reconciliation_issue?: string | null;
  reconciliation_checked_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentEventRecord = {
  id: string;
  booking_id: string | null;
  payment_id: string | null;
  event_type: string;
  source: string;
  stripe_event_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AdminPaymentActionType =
  | "release_payout"
  | "hold_payout"
  | "retry_payout"
  | "refund_payment"
  | "flag_issue"
  | "platform_payment_controls_updated";

export type AdminPaymentActionRecord = {
  id: string;
  booking_id: string;
  payment_id: string;
  admin_user_id: string;
  action_type: AdminPaymentActionType;
  reason: string | null;
  previous_payment_status: PaymentStatus | null;
  previous_payout_status: PayoutStatus | null;
  new_payment_status: PaymentStatus | null;
  new_payout_status: PayoutStatus | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AdminUserRecord = {
  user_id: string;
  created_at: string;
};

export type ShiftListingRecord = {
  id: string;
  business_id: string;
  role_label: string;
  title: string | null;
  description: string | null;
  shift_date: string;
  shift_end_date: string | null;
  start_time: string;
  end_time: string;
  hourly_rate_gbp: number;
  location: string;
  city: string | null;
  location_lat: number | null;
  location_lng: number | null;
  open_positions: number;
  claimed_positions: number;
  status: ShiftListingStatus;
  claimed_worker_id: string | null;
  claimed_booking_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformPaymentControlsRecord = {
  id: string;
  payouts_enabled: boolean;
  refunds_enabled: boolean;
  admin_manual_release_required: boolean;
  max_single_payout_gbp: number | null;
  max_single_refund_gbp: number | null;
  emergency_hold_enabled: boolean;
  emergency_hold_reason: string | null;
  test_mode_banner_enabled: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type WorkerDiscoveryFilters = {
  query: string;
  role: HospitalityRole | "";
  skill: string;
  availableDay: number | "";
  availabilityStatus: "" | "has_availability" | "needs_update";
  maxHourlyRate: string;
  location: string;
  minRating: string;
  minTravelRadius: string;
};
