"use client";

import Link from "next/link";
import { buildSupportMailtoUrl, buildWhatsAppSupportUrl } from "@/lib/support";

type AdminContactCardProps = {
  title?: string;
  description?: string;
  accountType?: "worker" | "business" | "admin" | "unknown";
  bookingId?: string | null;
  roleLabel?: string | null;
  shiftDate?: string | null;
};

export function AdminContactCard({
  title = "Contact Support",
  description = "Having an issue? Contact support and we’ll help.",
  accountType = "unknown",
  bookingId,
  roleLabel,
  shiftDate,
}: AdminContactCardProps) {
  const context = { accountType, bookingId, roleLabel, shiftDate };
  const whatsappUrl = buildWhatsAppSupportUrl(context);
  const mailtoUrl = buildSupportMailtoUrl(context);
  const inboxPath =
    accountType === "business"
      ? "/dashboard/business/messages"
      : accountType === "worker"
        ? "/dashboard/worker/messages"
        : "/admin/messages";
  const inboxHref = bookingId
    ? `${inboxPath}?bookingId=${encodeURIComponent(bookingId)}`
    : inboxPath;

  return (
    <section className="panel-soft p-5 sm:p-6">
      <h2 className="text-xl font-semibold text-stone-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Link href={inboxHref} className="primary-btn w-full px-5 text-center sm:w-auto">
          Message Admin
        </Link>
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="secondary-btn w-full px-5 text-center sm:w-auto"
          >
            WhatsApp support
          </a>
        ) : (
          <a href={mailtoUrl} className="secondary-btn w-full px-5 text-center sm:w-auto">
            Email support
          </a>
        )}
      </div>
    </section>
  );
}
