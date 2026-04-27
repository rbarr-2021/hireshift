"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { fetchWithSession } from "@/lib/route-client";

type AdminContactCardProps = {
  title?: string;
  description?: string;
  subjectPlaceholder?: string;
};

export function AdminContactCard({
  title = "Message admin",
  description = "Need help? Send a message to the NexHyr admin team.",
  subjectPlaceholder = "What do you need help with?",
}: AdminContactCardProps) {
  const { showToast } = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      showToast({
        title: "Message incomplete",
        description: "Add a subject and message before sending.",
        tone: "info",
      });
      return;
    }

    setSending(true);

    try {
      const response = await fetchWithSession("/api/support/admin-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject,
          message,
        }),
      });

      const raw = await response.text();
      let payload: { error?: string } = {};

      if (raw) {
        try {
          payload = JSON.parse(raw) as { error?: string };
        } catch {
          payload = {};
        }
      }

      if (!response.ok) {
        throw new Error(payload.error || "Unable to send your message right now.");
      }

      setSubject("");
      setMessage("");
      showToast({
        title: "Message sent",
        description: "Admin has received your message and will respond by email.",
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "Message failed",
        description:
          error instanceof Error ? error.message : "Unable to send your message right now.",
        tone: "error",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="panel-soft p-5 sm:p-6">
      <h2 className="text-xl font-semibold text-stone-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
      <div className="mt-4 grid gap-3">
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder={subjectPlaceholder}
          className="input"
          maxLength={120}
        />
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Write your message"
          className="input min-h-28 resize-y"
          maxLength={2000}
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending}
          className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {sending ? "Sending..." : "Send to admin"}
        </button>
      </div>
    </section>
  );
}
