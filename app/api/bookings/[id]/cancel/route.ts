import { NextRequest, NextResponse } from "next/server";
import type { BookingRecord, PaymentRecord } from "@/lib/models";
import { canCancelBooking } from "@/lib/bookings";
import { getRouteActor } from "@/lib/route-access";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANCELLATION_REASONS = new Set([
  "Worker unavailable",
  "Business no longer needs staff",
  "Emergency",
  "Other",
]);

function parsePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { reason: null, note: null };
  }

  const input = payload as { reason?: unknown; note?: unknown };
  const reason =
    typeof input.reason === "string" && input.reason.trim()
      ? input.reason.trim()
      : null;
  const note =
    typeof input.note === "string" && input.note.trim()
      ? input.note.trim().slice(0, 600)
      : null;

  return { reason, note };
}

async function loadBookingSnapshot(bookingId: string) {
  const supabaseAdmin = getSupabaseAdminClient();
  const [bookingResult, paymentResult] = await Promise.all([
    supabaseAdmin.from("bookings").select("*").eq("id", bookingId).maybeSingle<BookingRecord>(),
    supabaseAdmin.from("payments").select("*").eq("booking_id", bookingId).maybeSingle<PaymentRecord>(),
  ]);

  return {
    booking: bookingResult.data ?? null,
    payment: paymentResult.data ?? null,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getRouteActor(request);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { reason, note } = parsePayload(body);

  if (reason && !CANCELLATION_REASONS.has(reason)) {
    return NextResponse.json({ error: "Choose a valid cancellation reason." }, { status: 400 });
  }

  if (reason === "Other" && !note) {
    return NextResponse.json(
      { error: "Add a short note when selecting Other." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const { booking, payment } = await loadBookingSnapshot(id);

  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const actorId = actor.authUser.id;
  const actorRole = actor.appUser.role;

  if (actorRole !== "worker" && actorRole !== "business") {
    return NextResponse.json({ error: "Only workers or businesses can cancel here." }, { status: 403 });
  }

  if (actorRole === "worker" && booking.worker_id !== actorId) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (actorRole === "business" && booking.business_id !== actorId) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (!canCancelBooking(booking, payment)) {
    return NextResponse.json(
      { error: "This booking is locked and can no longer be cancelled." },
      { status: 409 },
    );
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const cancellationReason = reason ?? null;
  const cancellationNote = note ?? null;

  if (actorRole === "worker") {
    const rpcResult = await supabaseAdmin.rpc("worker_cancel_booking", {
      target_booking_id: booking.id,
    });

    if (rpcResult.error) {
      return NextResponse.json(
        { error: rpcResult.error.message || "Unable to cancel this booking right now." },
        { status: 409 },
      );
    }
  } else {
    const updateResult = await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", booking.id)
      .eq("business_id", actorId)
      .eq("status", "accepted");

    if (updateResult.error) {
      return NextResponse.json(
        { error: updateResult.error.message || "Unable to cancel this booking right now." },
        { status: 409 },
      );
    }
  }

  await supabaseAdmin
    .from("bookings")
    .update({
      cancelled_at: nowIso,
      cancelled_by_user_id: actorId,
      cancelled_by_role: actorRole,
      cancellation_reason: cancellationReason,
      cancellation_note: cancellationNote,
      updated_at: nowIso,
    })
    .eq("id", booking.id);

  const refreshed = await loadBookingSnapshot(booking.id);

  if (payment?.id) {
    await supabaseAdmin.from("payment_events").insert({
      booking_id: booking.id,
      payment_id: payment.id,
      event_type: "booking_cancelled",
      source: "system",
      metadata: {
        cancelled_by_user_id: actorId,
        cancelled_by_role: actorRole,
        cancellation_reason: cancellationReason,
        cancellation_note: cancellationNote,
      },
    });
  }

  return NextResponse.json({
    booking: refreshed.booking,
    payment: refreshed.payment,
    message:
      actorRole === "worker"
        ? "Booking cancelled. This shift is now available for other workers."
        : "Booking cancelled. Admin can review any payment adjustments if required.",
  });
}

