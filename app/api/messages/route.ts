import { NextRequest, NextResponse } from "next/server";
import type { BookingRecord, MessageRecord, UserRecord } from "@/lib/models";
import {
  getBookingForMessageValidation,
  getMessageList,
  isAdmin,
  normaliseMessageBody,
  normaliseMessageSubject,
  resolveAdminRecipientId,
  roleForMessageSender,
} from "@/lib/messages";
import { sendEmailMessage } from "@/lib/notifications/provider";
import { getRouteActor } from "@/lib/route-access";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const SUPPORT_ISSUE_TYPES = new Set([
  "booking_issue",
  "payment_question",
  "shift_cancellation",
  "worker_did_not_arrive",
  "business_issue",
  "account_issue",
  "other",
]);

async function validateBookingAccess({
  actorId,
  isActorAdmin,
  booking,
}: {
  actorId: string;
  isActorAdmin: boolean;
  booking: BookingRecord | null;
}) {
  if (!booking) return false;
  if (isActorAdmin) return true;
  return booking.worker_id === actorId || booking.business_id === actorId;
}

export async function GET(request: NextRequest) {
  const actor = await getRouteActor(request);
  if (!actor) return invalid("Please log in again.", 401);

  const isActorAdmin = await isAdmin(actor.authUser.id);
  const boxParam = request.nextUrl.searchParams.get("box") ?? "inbox";
  const box = boxParam === "sent" || boxParam === "all" ? boxParam : "inbox";
  const bookingId = request.nextUrl.searchParams.get("bookingId")?.trim() || undefined;

  if (box === "all" && !isActorAdmin) {
    return invalid("Admin access required for all messages.", 403);
  }

  if (bookingId) {
    const booking = await getBookingForMessageValidation(bookingId);
    const canAccessBooking = await validateBookingAccess({
      actorId: actor.authUser.id,
      isActorAdmin,
      booking,
    });

    if (!canAccessBooking) {
      return invalid("You cannot access messages for this booking.", 403);
    }
  }

  const items = await getMessageList({
    actorId: actor.authUser.id,
    isActorAdmin,
    box,
    bookingId,
  });

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const actor = await getRouteActor(request);
  if (!actor) return invalid("Please log in again.", 401);

  const isActorAdmin = await isAdmin(actor.authUser.id);
  const payload = (await request.json().catch(() => ({}))) as {
    booking_id?: string;
    recipient_id?: string;
    recipient_role?: "worker" | "business" | "admin" | null;
    issue_type?: string | null;
    issueType?: string | null;
    subject?: string;
    body?: string;
  };

  const bookingId = payload.booking_id?.trim() || null;
  const recipientRole = payload.recipient_role ?? null;
  const issueTypeRaw =
    payload.issue_type?.trim().toLowerCase() ||
    payload.issueType?.trim().toLowerCase() ||
    null;
  const issueType = issueTypeRaw && SUPPORT_ISSUE_TYPES.has(issueTypeRaw) ? issueTypeRaw : null;
  let recipientId = payload.recipient_id?.trim() || null;
  const subject = normaliseMessageSubject(payload.subject);
  const body = normaliseMessageBody(payload.body);

  if (!body || body.length < 1) {
    return invalid("Message body is required.");
  }

  const booking = bookingId ? await getBookingForMessageValidation(bookingId) : null;
  if (bookingId && !(await validateBookingAccess({ actorId: actor.authUser.id, isActorAdmin, booking }))) {
    return invalid("You cannot message on this booking.", 403);
  }

  if (!recipientId && recipientRole === "admin") {
    recipientId = await resolveAdminRecipientId();
  }

  if (!recipientId && booking) {
    if (actor.authUser.id === booking.worker_id) {
      recipientId = recipientRole === "admin" ? await resolveAdminRecipientId() : booking.business_id;
    } else if (actor.authUser.id === booking.business_id) {
      recipientId = recipientRole === "admin" ? await resolveAdminRecipientId() : booking.worker_id;
    } else if (isActorAdmin) {
      recipientId = recipientRole === "worker" ? booking.worker_id : booking.business_id;
    }
  }

  if (!recipientId) {
    return invalid("Recipient could not be resolved.");
  }

  const isSupportMessage =
    recipientRole === "admin" ||
    recipientId === (await resolveAdminRecipientId());

  const resolvedIssueType = isSupportMessage ? issueType || "other" : issueType;

  if (isSupportMessage && !resolvedIssueType) {
    return invalid("Please choose what you need help with.");
  }

  if (!isActorAdmin && recipientId === actor.authUser.id) {
    return invalid("You cannot send a message to yourself.");
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: recipient } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", recipientId)
    .maybeSingle<UserRecord>();

  if (!recipient) {
    return invalid("Recipient account was not found.");
  }

  if (!isActorAdmin && booking) {
    const allowedRecipients = new Set<string>([
      booking.worker_id,
      booking.business_id,
      ...(recipientRole === "admin" ? [await resolveAdminRecipientId()].filter(Boolean) as string[] : []),
    ]);

    if (!allowedRecipients.has(recipientId)) {
      return invalid("Recipient is not valid for this booking.", 403);
    }
  }

  const senderRole = roleForMessageSender(actor.appUser.role);
  const recipientRoleValue = recipient.role === "admin" ? "admin" : recipient.role;

  const insertPayload = {
    booking_id: booking?.id ?? null,
    sender_id: actor.authUser.id,
    recipient_id: recipientId,
    recipient_role: recipientRoleValue,
    sender_role: senderRole,
    subject,
    body,
    issue_type: resolvedIssueType,
    support_status: "open",
    support_reviewed_at: null,
    support_reviewed_by: null,
    status: "sent",
    email_notification_status: "pending",
    whatsapp_notification_status: "not_configured",
    metadata: {
      source: "internal_messages_mvp",
    },
  };

  const { data: createdMessage, error } = await supabaseAdmin
    .from("messages")
    .insert(insertPayload)
    .select("*")
    .single<MessageRecord>();

  if (error || !createdMessage) {
    return invalid("Unable to create message right now.", 500);
  }

  const recipientInboxPath =
    recipientRoleValue === "business"
      ? "/dashboard/business/messages"
      : recipientRoleValue === "admin"
        ? "/admin/messages"
        : "/dashboard/worker/messages";

  const inboxUrl = `${(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://nexhyr.co.uk").replace(/\/+$/, "")}${recipientInboxPath}`;

  let emailStatus: "sent" | "failed" | "skipped" = "skipped";
  let emailReason: string | null = null;

  if (recipient.email) {
    const emailResult = await sendEmailMessage({
      to: recipient.email,
      subject: `New NexHyr message${subject ? `: ${subject}` : ""}`,
      text: [
        `Hi ${recipient.display_name?.trim() || "there"},`,
        "",
        `You have a new NexHyr message from ${actor.appUser.display_name?.trim() || actor.authUser.email || "a user"}.`,
        booking?.id ? `Booking reference: ${booking.id}` : null,
        "",
        body.length > 280 ? `${body.slice(0, 279)}…` : body,
        "",
        `View your inbox: ${inboxUrl}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    if (emailResult.status === "sent") {
      emailStatus = "sent";
    } else {
      emailStatus = "failed";
      emailReason = emailResult.reason;
    }
  } else {
    emailReason = "Recipient email is missing.";
  }

  await supabaseAdmin
    .from("messages")
    .update({
      email_notification_status: emailStatus,
      metadata: {
        ...(createdMessage.metadata ?? {}),
        email_reason: emailReason,
        whatsapp_placeholder:
          "You have a new NexHyr message. Log in to view it.",
      },
    })
    .eq("id", createdMessage.id);

  return NextResponse.json({
    success: true,
    item: {
      ...createdMessage,
      email_notification_status: emailStatus,
    },
  });
}
