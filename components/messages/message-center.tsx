"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast-provider";
import { fetchWithSession } from "@/lib/route-client";

type AccountType = "worker" | "business" | "admin";
type Mailbox = "inbox" | "sent" | "all";

type MessageListItem = {
  id: string;
  booking_id: string | null;
  subject: string | null;
  body: string;
  status: "sent" | "read";
  created_at: string;
  read_at: string | null;
  sender_name: string;
  sender_email: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  booking_role_label: string | null;
  booking_shift_date: string | null;
};

export function MessageCenter({ accountType }: { accountType: AccountType }) {
  const { showToast } = useToast();
  const [mailbox, setMailbox] = useState<Mailbox>(accountType === "admin" ? "all" : "inbox");
  const [items, setItems] = useState<MessageListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const accountPath =
    accountType === "worker"
      ? "/dashboard/worker"
      : accountType === "business"
        ? "/dashboard/business"
        : "/admin";

  const refreshMessages = async () => {
    setLoading(true);
    try {
      const response = await fetchWithSession(`/api/messages?box=${mailbox}`);
      const payload = (await response.json()) as { items?: MessageListItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load messages.");
      setItems(payload.items ?? []);
    } catch (error) {
      showToast({
        title: "Messages unavailable",
        description: error instanceof Error ? error.message : "Unable to load messages.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailbox]);

  const inboxItems = useMemo(() => items, [items]);

  const sendSupportMessage = async () => {
    const trimmedBody = body.trim();
    const trimmedSubject = subject.trim();

    if (!trimmedBody) {
      showToast({
        title: "Message required",
        description: "Add a message before sending.",
        tone: "error",
      });
      return;
    }

    setSending(true);
    try {
      const response = await fetchWithSession("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_role: "admin",
          subject: trimmedSubject || null,
          body: trimmedBody,
        }),
      });
      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to send message.");
      }
      setSubject("");
      setBody("");
      showToast({
        title: "Message sent",
        description: "Your message has been sent to support.",
        tone: "success",
      });
      await refreshMessages();
    } catch (error) {
      showToast({
        title: "Send failed",
        description: error instanceof Error ? error.message : "Unable to send message.",
        tone: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const markRead = async (id: string) => {
    try {
      const response = await fetchWithSession(`/api/messages/${id}/read`, {
        method: "POST",
      });
      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to mark as read.");
      }
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: "read", read_at: new Date().toISOString() } : item,
        ),
      );
    } catch (error) {
      showToast({
        title: "Read update failed",
        description: error instanceof Error ? error.message : "Unable to update message.",
        tone: "error",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMailbox("inbox")}
          className={mailbox === "inbox" ? "primary-btn px-4 py-2" : "secondary-btn px-4 py-2"}
        >
          Inbox
        </button>
        <button
          type="button"
          onClick={() => setMailbox("sent")}
          className={mailbox === "sent" ? "primary-btn px-4 py-2" : "secondary-btn px-4 py-2"}
        >
          Sent
        </button>
        {accountType === "admin" ? (
          <button
            type="button"
            onClick={() => setMailbox("all")}
            className={mailbox === "all" ? "primary-btn px-4 py-2" : "secondary-btn px-4 py-2"}
          >
            All
          </button>
        ) : null}
      </div>

      <section className="panel-soft p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-stone-900">Contact Support</h2>
        <p className="mt-2 text-sm text-stone-600">
          Send a message to support. For booking-specific messages, use the booking detail page.
        </p>
        <div className="mt-4 grid gap-3">
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject (optional)"
            className="input-modern w-full"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="How can we help?"
            className="input-modern min-h-28 w-full resize-y"
            maxLength={2000}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void sendSupportMessage()}
              disabled={sending}
              className="primary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send message"}
            </button>
            <Link href={accountPath} className="secondary-btn px-5">
              Back
            </Link>
          </div>
        </div>
      </section>

      <section className="panel-soft p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-stone-900">Messages</h2>
        {loading ? (
          <p className="mt-4 text-sm text-stone-600">Loading messages...</p>
        ) : inboxItems.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">No messages yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {inboxItems.map((item) => (
              <article key={item.id} className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-stone-100">
                    {item.subject || "No subject"}
                  </p>
                  <span className="text-xs uppercase tracking-[0.16em] text-stone-400">
                    {new Date(item.created_at).toLocaleString("en-GB")}
                  </span>
                </div>
                <p className="mt-2 text-xs text-stone-400">
                  From {item.sender_name}
                  {item.recipient_name ? ` -> ${item.recipient_name}` : ""}
                  {item.booking_id ? ` | Booking ${item.booking_id}` : ""}
                </p>
                <p className="mt-3 text-sm leading-6 text-stone-300 whitespace-pre-wrap">{item.body}</p>
                {mailbox !== "sent" && item.status !== "read" ? (
                  <button
                    type="button"
                    onClick={() => void markRead(item.id)}
                    className="secondary-btn mt-3 px-4 py-2 text-xs"
                  >
                    Mark as read
                  </button>
                ) : (
                  <p className="mt-3 text-xs uppercase tracking-[0.14em] text-stone-500">
                    {item.status === "read" ? "Read" : "Sent"}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
