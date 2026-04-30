"use client";

import { useState } from "react";
import type { BookingRecord, PaymentRecord } from "@/lib/models";
import { fetchWithSession } from "@/lib/route-client";
import { useToast } from "@/components/ui/toast-provider";

type CancelBookingActionProps = {
  bookingId: string;
  actorRole: "worker" | "business";
  className?: string;
  onCancelled?: (booking: BookingRecord | null, payment: PaymentRecord | null) => void;
};

const REASONS = [
  "Worker unavailable",
  "Business no longer needs staff",
  "Emergency",
  "Other",
] as const;

function safeParseResponse(text: string) {
  if (!text.trim()) {
    return { error: "We couldn't cancel this booking. Please contact support." } as {
      error?: string;
      message?: string;
      booking?: BookingRecord | null;
      payment?: PaymentRecord | null;
    };
  }

  try {
    return JSON.parse(text) as {
      error?: string;
      message?: string;
      booking?: BookingRecord | null;
      payment?: PaymentRecord | null;
    };
  } catch {
    return { error: "We couldn't cancel this booking. Please contact support." };
  }
}

export function CancelBookingAction({
  bookingId,
  actorRole,
  className,
  onCancelled,
}: CancelBookingActionProps) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("Worker unavailable");
  const [note, setNote] = useState("");

  const submit = async () => {
    if (submitting) {
      return;
    }

    if (reason === "Other" && !note.trim()) {
      showToast({
        title: "Add a note",
        description: "Please add a short detail when selecting Other.",
        tone: "error",
      });
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetchWithSession(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason,
          note: note.trim() || null,
        }),
      });

      const payload = safeParseResponse(await response.text());

      if (!response.ok) {
        throw new Error(payload.error || "We couldn't cancel this booking. Please contact support.");
      }

      showToast({
        title: "Booking cancelled",
        description:
          payload.message ||
          (actorRole === "worker"
            ? "Booking cancelled. This shift is now available for other workers."
            : "Booking cancelled. Admin can review any payment adjustments if required."),
        tone: "success",
      });

      setOpen(false);
      onCancelled?.(payload.booking ?? null, payload.payment ?? null);
    } catch (error) {
      showToast({
        title: "Cancellation failed",
        description:
          error instanceof Error
            ? error.message
            : "We couldn't cancel this booking. Please contact support.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "secondary-btn w-full px-5 sm:w-auto"}
      >
        Cancel booking
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-black/90 p-5 shadow-2xl">
            <h3 className="text-xl font-semibold text-stone-100">Cancel this booking?</h3>
            <p className="mt-3 text-sm leading-6 text-stone-400">
              Are you sure you want to cancel this booking?
            </p>
            <p className="mt-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-xs leading-5 text-stone-500">
              This may affect payment or refund handling. Admin will review if needed.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-stone-400">
                <span className="font-medium text-stone-200">Reason for cancellation (optional)</span>
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value as (typeof REASONS)[number])}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-base text-stone-100 outline-none transition focus:border-[#00A7FF]"
                >
                  {REASONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              {reason === "Other" ? (
                <label className="block text-sm text-stone-400">
                  <span className="font-medium text-stone-200">Add more detail</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-base text-stone-100 outline-none transition focus:border-[#00A7FF]"
                    placeholder="Add more detail"
                  />
                </label>
              ) : null}
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="secondary-btn w-full px-5 sm:flex-1"
              >
                Keep booking
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1"
              >
                {submitting ? "Cancelling..." : "Confirm cancellation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
