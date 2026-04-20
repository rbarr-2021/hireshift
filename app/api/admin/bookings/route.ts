import { NextRequest, NextResponse } from "next/server";
import { buildAdminBookingSummaries } from "@/lib/admin-bookings";
import type {
  BookingRecord,
  BusinessProfileRecord,
  MarketplaceUserRecord,
  PaymentRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import { getRouteActor, isAdminUser } from "@/lib/route-access";
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

  const [paymentsResult, workerUsersResult, workerProfilesResult, businessUsersResult, businessProfilesResult] =
    await Promise.all([
      bookingIds.length
        ? supabaseAdmin.from("payments").select("*").in("booking_id", bookingIds)
        : Promise.resolve({ data: [] as PaymentRecord[] }),
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
    ]);

  let items = buildAdminBookingSummaries({
    bookings,
    payments: (paymentsResult.data as PaymentRecord[] | null) ?? [],
    workerUsers: (workerUsersResult.data as MarketplaceUserRecord[] | null) ?? [],
    workerProfiles: (workerProfilesResult.data as WorkerProfileRecord[] | null) ?? [],
    businessUsers: (businessUsersResult.data as MarketplaceUserRecord[] | null) ?? [],
    businessProfiles: (businessProfilesResult.data as BusinessProfileRecord[] | null) ?? [],
  });

  if (paymentFilter) {
    items = items.filter((item) => (item.payment?.status ?? "pending") === paymentFilter);
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

  const counts = {
    pending: items.filter((item) => item.booking.status === "pending").length,
    confirmed: items.filter(
      (item) => item.booking.status === "accepted" && item.payment?.status === "captured",
    ).length,
    completed: items.filter((item) => item.booking.status === "completed").length,
    unpaid: items.filter((item) => !item.payment || item.payment.status === "pending").length,
    paid: items.filter((item) => item.payment?.status === "captured").length,
  };

  return NextResponse.json({ items, counts });
}
