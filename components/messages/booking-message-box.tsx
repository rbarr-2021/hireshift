"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { fetchWithSession } from "@/lib/route-client";

type RecipientOption = {
  label: string;
  recipient_id?: string | null;
  recipient_role?: "worker" | "business" | "admin";
};

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
          subject: subject.trim() || null,
          body: trimmedBody,
        }),
      });
      const payload = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to send message.");
      }

      setBody("");
      setSubject("");
      showToast({
        title: "Message sent",
        description: "Your booking message has been sent.",
        tone: "success",
      });
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
