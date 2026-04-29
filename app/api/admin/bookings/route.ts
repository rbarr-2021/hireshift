import { NextRequest, NextResponse } from "next/server";
import { buildAdminBookingSummaries } from "@/lib/admin-bookings";
import type {
  BookingRecord,
  BusinessProfileRecord,
  MarketplaceUserRecord,
  PaymentEventRecord,
  PaymentRecord,
  ShiftListingRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import { getRouteActor, isAdminUser } from "@/lib/route-access";
import { isUnfulfilledShiftListing } from "@/lib/shift-listings";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await getRouteActor(request);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAdminUser(actor.authUser.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const statusFilter = request.nextUrl.searchParams.get("status");
  const paymentFilter = request.nextUrl.searchParams.get("payment");
  const query = request.nextUrl.searchParams.get("query")?.trim().toLowerCase() || "";
  const supabaseAdmin = getSupabaseAdminClient();

  let bookingsQuery = supabaseAdmin
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(120);

  if (statusFilter) {
    bookingsQuery = bookingsQuery.eq("status", statusFilter);
  }

  const bookingsResult = await bookingsQuery.returns<BookingRecord[]>();
  const bookings = bookingsResult.data ?? [];
  const bookingIds = bookings.map((booking) => booking.id);
  const workerIds = [...new Set(bookings.map((booking) => booking.worker_id))];
  const businessIds = [...new Set(bookings.map((booking) => booking.business_id))];

  const shiftListingsResultPromise = supabaseAdmin
    .from("shift_listings")
    .select("*")
    .order("shift_date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(120)
    .returns<ShiftListingRecord[]>();

  const paymentEventsResultPromise = bookingIds.length
    ? supabaseAdmin
        .from("payment_events")
        .select("*")
        .in("booking_id", bookingIds)
        .order("created_at", { ascending: false })
    : Promise.resolve({ data: [] as PaymentEventRecord[] });

  const [paymentsResult, paymentEventsResult, workerUsersResult, workerProfilesResult, businessUsersResult, businessProfilesResult, shiftListingsResult] =
    await Promise.all([
      bookingIds.length
        ? supabaseAdmin.from("payments").select("*").in("booking_id", bookingIds)
        : Promise.resolve({ data: [] as PaymentRecord[] }),
      paymentEventsResultPromise,
      workerIds.length
        ? supabaseAdmin.from("marketplace_users").select("*").in("id", workerIds)
        : Promise.resolve({ data: [] as MarketplaceUserRecord[] }),
      workerIds.length
        ? supabaseAdmin.from("worker_profiles").select("*").in("user_id", workerIds)
        : Promise.resolve({ data: [] as WorkerProfileRecord[] }),
      businessIds.length
        ? supabaseAdmin.from("marketplace_users").select("*").in("id", businessIds)
        : Promise.resolve({ data: [] as MarketplaceUserRecord[] }),
      businessIds.length
        ? supabaseAdmin.from("business_profiles").select("*").in("user_id", businessIds)
        : Promise.resolve({ data: [] as BusinessProfileRecord[] }),
      shiftListingsResultPromise,
    ]);

  let items = buildAdminBookingSummaries({
    bookings,
    payments: (paymentsResult.data as PaymentRecord[] | null) ?? [],
    paymentEvents: (paymentEventsResult.data as PaymentEventRecord[] | null) ?? [],
    workerUsers: (workerUsersResult.data as MarketplaceUserRecord[] | null) ?? [],
    workerProfiles: (workerProfilesResult.data as WorkerProfileRecord[] | null) ?? [],
    businessUsers: (businessUsersResult.data as MarketplaceUserRecord[] | null) ?? [],
    businessProfiles: (businessProfilesResult.data as BusinessProfileRecord[] | null) ?? [],
  });

  if (paymentFilter) {
    items = items.filter((item) => {
      if (item.payment?.status === paymentFilter) {
        return true;
      }

      return (item.payment?.payout_status ?? "pending_confirmation") === paymentFilter;
    });
  }

  if (query) {
    items = items.filter((item) => {
      const haystack = [
        item.workerName,
        item.businessName,
        item.booking.requested_role_label,
        item.booking.location,
        item.booking.shift_date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  const shiftListings = (shiftListingsResult.data as ShiftListingRecord[] | null) ?? [];
  const unfulfilledShiftListings = shiftListings.filter((listing) =>
    isUnfulfilledShiftListing(listing),
  );
  const unfulfilledBusinessIds = [
    ...new Set(unfulfilledShiftListings.map((listing) => listing.business_id)),
  ];
  const knownBusinessUsers = (businessUsersResult.data as MarketplaceUserRecord[] | null) ?? [];
  const knownBusinessProfiles =
    (businessProfilesResult.data as BusinessProfileRecord[] | null) ?? [];
  const missingBusinessIds = unfulfilledBusinessIds.filter(
    (businessId) =>
      !knownBusinessUsers.some((candidate) => candidate.id === businessId) &&
      !knownBusinessProfiles.some((candidate) => candidate.user_id === businessId),
  );

  const [extraBusinessUsersResult, extraBusinessProfilesResult] =
    missingBusinessIds.length > 0
      ? await Promise.all([
          supabaseAdmin.from("marketplace_users").select("*").in("id", missingBusinessIds),
          supabaseAdmin.from("business_profiles").select("*").in("user_id", missingBusinessIds),
        ])
      : [
          { data: [] as MarketplaceUserRecord[] },
          { data: [] as BusinessProfileRecord[] },
        ];

  const allBusinessUsers = [
    ...knownBusinessUsers,
    ...((extraBusinessUsersResult.data as MarketplaceUserRecord[] | null) ?? []),
  ];
  const allBusinessProfiles = [
    ...knownBusinessProfiles,
    ...((extraBusinessProfilesResult.data as BusinessProfileRecord[] | null) ?? []),
  ];

  let unfulfilledListings =
    unfulfilledShiftListings
      .map((listing) => {
        const businessProfile = allBusinessProfiles.find(
          (candidate) => candidate.user_id === listing.business_id,
        );
        const businessUser = allBusinessUsers.find(
          (candidate) => candidate.id === listing.business_id,
        );

        return {
          listing,
          businessName:
            businessProfile?.business_name || businessUser?.display_name || "Business",
        };
      });

  if (query) {
    unfulfilledListings = unfulfilledListings.filter((item) => {
      const haystack = [
        item.businessName,
        item.listing.role_label,
        item.listing.title,
        item.listing.location,
        item.listing.city,
        item.listing.shift_date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  const counts = {
    pending: items.filter((item) => item.booking.status === "pending").length,
    approved: items.filter((item) => item.nextActionLabel === "Ready to release payout").length,
    completed: items.filter((item) => item.booking.status === "completed").length,
    disputed: items.filter((item) => item.payment?.status === "disputed").length,
    onHold: items.filter((item) => item.payment?.payout_status === "on_hold").length,
    paid: items.filter((item) => item.payment?.payout_status === "completed").length,
  };

  return NextResponse.json({ items, counts, unfulfilledListings });
}
