import type { BookingRecord, MessageRecord, UserRecord, UserRole } from "@/lib/models";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type MessageMailbox = "inbox" | "sent" | "all";

export type MessageListItem = MessageRecord & {
  sender_name: string;
  sender_email: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  booking_role_label: string | null;
  booking_shift_date: string | null;
};

const MAX_SUBJECT_LENGTH = 160;
const MAX_BODY_LENGTH = 2000;

export function normaliseMessageSubject(value: string | null | undefined) {
  const next = (value ?? "").trim().slice(0, MAX_SUBJECT_LENGTH);
  return next.length ? next : null;
}

export function normaliseMessageBody(value: string | null | undefined) {
  return (value ?? "").trim().slice(0, MAX_BODY_LENGTH);
}

export function getMessagePreview(body: string, length = 180) {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > length ? `${compact.slice(0, length - 1)}…` : compact;
}

export function getUserLabel(user: Pick<UserRecord, "display_name" | "email" | "id"> | null | undefined) {
  if (!user) return "Unknown user";
  return user.display_name?.trim() || user.email || user.id;
}

export async function isAdmin(userId: string) {
  const supabaseAdmin = getSupabaseAdminClient();
  const [{ data: adminRow }, { data: roleRow }] = await Promise.all([
    supabaseAdmin.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("users").select("role").eq("id", userId).maybeSingle<{ role: string | null }>(),
  ]);

  return Boolean(adminRow || roleRow?.role === "admin");
}

export async function getBookingForMessageValidation(bookingId: string) {
  const supabaseAdmin = getSupabaseAdminClient();
  const { data } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle<BookingRecord>();
  return data ?? null;
}

export async function resolveAdminRecipientId() {
  const supabaseAdmin = getSupabaseAdminClient();
  const { data: adminRow } = await supabaseAdmin
    .from("admin_users")
    .select("user_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ user_id: string }>();

  if (adminRow?.user_id) return adminRow.user_id;

  const { data: roleAdmin } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  return roleAdmin?.id ?? null;
}

export async function getMessageList({
  actorId,
  isActorAdmin,
  box,
  bookingId,
}: {
  actorId: string;
  isActorAdmin: boolean;
  box: MessageMailbox;
  bookingId?: string;
}) {
  const supabaseAdmin = getSupabaseAdminClient();
  let query = supabaseAdmin
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (bookingId) {
    query = query.eq("booking_id", bookingId);
  }

  if (!isActorAdmin || box !== "all") {
    if (box === "sent") {
      query = query.eq("sender_id", actorId);
    } else {
      query = query.eq("recipient_id", actorId);
    }
  }

  const { data: messages } = await query.returns<MessageRecord[]>();
  const nextMessages = messages ?? [];
  const participantIds = [...new Set(nextMessages.flatMap((message) => [message.sender_id, message.recipient_id]).filter(Boolean) as string[])];
  const bookingIds = [...new Set(nextMessages.map((message) => message.booking_id).filter(Boolean) as string[])];

  const [{ data: users }, { data: bookings }] = await Promise.all([
    participantIds.length
      ? supabaseAdmin.from("users").select("*").in("id", participantIds).returns<UserRecord[]>()
      : Promise.resolve({ data: [] as UserRecord[] }),
    bookingIds.length
      ? supabaseAdmin
          .from("bookings")
          .select("id, requested_role_label, shift_date")
          .in("id", bookingIds)
          .returns<Array<{ id: string; requested_role_label: string | null; shift_date: string }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; requested_role_label: string | null; shift_date: string }> }),
  ]);

  const usersById = new Map((users ?? []).map((user) => [user.id, user]));
  const bookingsById = new Map((bookings ?? []).map((booking) => [booking.id, booking]));

  const items: MessageListItem[] = nextMessages.map((message) => {
    const sender = usersById.get(message.sender_id);
    const recipient = message.recipient_id ? usersById.get(message.recipient_id) : null;
    const booking = message.booking_id ? bookingsById.get(message.booking_id) : null;

    return {
      ...message,
      sender_name: getUserLabel(sender),
      sender_email: sender?.email ?? null,
      recipient_name: getUserLabel(recipient),
      recipient_email: recipient?.email ?? null,
      booking_role_label: booking?.requested_role_label ?? null,
      booking_shift_date: booking?.shift_date ?? null,
    };
  });

  return items;
}

export function roleForMessageSender(role: UserRole | null): UserRole {
  if (role === "business" || role === "admin") return role;
  return "worker";
}
