"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { fetchWithSession } from "@/lib/route-client";

type RecipientOption = {
  label: string;
  recipient_id?: string | null;
  recipient_role?: "worker" | "business" | "admin";
};

const ISSUE_OPTIONS = [
  { value: "booking_issue", label: "Booking issue" },
  { value: "payment_question", label: "Payment question" },
  { value: "shift_cancellation", label: "Shift cancellation" },
  { value: "worker_did_not_arrive", label: "Worker did not arrive" },
  { value: "business_issue", label: "Business issue" },
  { value: "account_issue", label: "Account issue" },
  { value: "other", label: "Other" },
];

async function readJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const text = await response.text();

  if (!text) {
    return { error: fallbackError } as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: fallbackError } as T;
  }
}

export function BookingMessageBox({
  bookingId,
  recipients,
  compact = false,
}: {
  bookingId: string;
  recipients: RecipientOption[];
  compact?: boolean;
}) {
  const { showToast } = useToast();
  const [recipientValue, setRecipientValue] = useState(() => recipients[0]?.label ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const selectedRecipient = recipients.find((recipient) => recipient.label === recipientValue) ?? recipients[0];
  const [issueType, setIssueType] = useState("other");
  const isSupportTarget = (selectedRecipient?.recipient_role ?? "admin") === "admin";

  const submit = async () => {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      showToast({
        title: "Message required",
        description: "Write a short message before sending.",
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
          booking_id: bookingId,
          recipient_id: selectedRecipient?.recipient_id ?? null,
          recipient_role: selectedRecipient?.recipient_role ?? "admin",
          issue_type: issueType,
          subject: subject.trim() || null,
          body: trimmedBody,
        }),
      });
      const payload = await readJsonResponse<{ success?: boolean; error?: string }>(
        response,
        "We couldn’t send your message. Please try again or contact support.",
      );

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "We couldn’t send your message. Please try again or contact support.");
      }

      setBody("");
      setSubject("");
      showToast({
        title: "Message sent",
        description: "Message sent. Admin will review it.",
        tone: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "We couldn’t send your message. Please try again or contact support.";
      showToast({
        title: "Message not sent",
        description: message,
        tone: "error",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="panel-soft p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-stone-900">Send message</h2>
      <div className={`mt-4 grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        <label className="text-sm text-stone-600">
          Recipient
          <select
            value={recipientValue}
            onChange={(event) => setRecipientValue(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-[#00A7FF]"
          >
            {recipients.map((recipient) => (
              <option key={recipient.label} value={recipient.label}>
                {recipient.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-stone-600">
          Subject (optional)
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Short subject"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-[#00A7FF]"
          />
        </label>
      </div>
      {isSupportTarget ? (
        <label className="mt-3 block text-sm text-stone-600">
          What do you need help with?
          <select
            value={issueType}
            onChange={(event) => setIssueType(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-[#00A7FF]"
          >
            {ISSUE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="mt-3 block text-sm text-stone-600">
        Message
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          placeholder="Write your message"
          className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-[#00A7FF]"
        />
      </label>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={sending}
        className="primary-btn mt-4 px-5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? "Sending..." : "Send message"}
      </button>
    </section>
  );
}
