import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type TransactionalEmailType =
  | "booking_confirmed_worker"
  | "booking_confirmed_business"
  | "shift_reminder_24h_worker"
  | "shift_reminder_24h_business"
  | "payment_received_worker"
  | "hours_approved_worker"
  | "payout_processing_worker";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  type?: TransactionalEmailType;
  bookingId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

export type EmailSendResult =
  | {
      status: "sent";
      providerMessageId?: string | null;
    }
  | {
      status: "skipped";
      reason: string;
    };

type ResendSendResponse = {
  id?: string;
  error?: {
    message?: string;
  };
};

function getResendApiKey() {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

function getFromHeader() {
  return process.env.EMAIL_FROM?.trim() || "NexHyr <hello@nexhyr.co.uk>";
}

function isDevelopmentLike() {
  return process.env.NODE_ENV !== "production";
}

function buildShell(title: string, bodyHtml: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#020617;color:#e2e8f0;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#0b1220;border:1px solid rgba(148,163,184,0.25);border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid rgba(148,163,184,0.2);">
                <p style="margin:0;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;">NexHyr</p>
                <p style="margin:10px 0 0;font-size:22px;line-height:1.35;color:#f8fafc;font-weight:700;">${title}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px;font-size:15px;line-height:1.65;color:#cbd5e1;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;border-top:1px solid rgba(148,163,184,0.2);font-size:12px;color:#94a3b8;">
                Need help? Reply to this email and the NexHyr team will help.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function wasAlreadySent(input: SendEmailInput) {
  if (!input.type || !input.to.trim()) {
    return false;
  }

  try {
    const supabaseAdmin = getSupabaseAdminClient();
    const query = supabaseAdmin
      .from("email_notifications")
      .select("id")
      .eq("type", input.type)
      .eq("recipient_email", input.to.trim().toLowerCase())
      .limit(1);

    if (input.bookingId) {
      query.eq("booking_id", input.bookingId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data ?? []).length > 0;
  } catch (error) {
    console.warn("[email] duplicate check failed; continuing", {
      message: error instanceof Error ? error.message : "Unknown duplicate-check error.",
      type: input.type,
    });
    return false;
  }
}

async function persistEmailLog(input: SendEmailInput, providerMessageId?: string | null) {
  if (!input.type || !input.to.trim()) {
    return;
  }

  try {
    const supabaseAdmin = getSupabaseAdminClient();
    const { error } = await supabaseAdmin.from("email_notifications").insert({
      type: input.type,
      recipient_email: input.to.trim().toLowerCase(),
      booking_id: input.bookingId ?? null,
      user_id: input.userId ?? null,
      provider_message_id: providerMessageId ?? null,
      metadata: input.metadata ?? {},
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.warn("[email] failed to persist send log", {
      message: error instanceof Error ? error.message : "Unknown email log error.",
      type: input.type,
    });
  }
}

export async function sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
  const to = input.to.trim();

  if (!to) {
    return {
      status: "skipped",
      reason: "Recipient email is missing.",
    };
  }

  if (await wasAlreadySent(input)) {
    return {
      status: "skipped",
      reason: "Email already sent.",
    };
  }

  const resendApiKey = getResendApiKey();

  if (!resendApiKey) {
    if (isDevelopmentLike()) {
      console.info("[email] RESEND_API_KEY is missing; dev-mode skip", {
        to,
        subject: input.subject,
        type: input.type ?? "unspecified",
      });
    }

    return {
      status: "skipped",
      reason: "Resend is not configured.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFromHeader(),
      to: [to],
      subject: input.subject,
      html: buildShell(input.subject, input.html),
      text: input.text,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as ResendSendResponse;

  if (!response.ok || payload.error) {
    const message =
      payload.error?.message || `Resend failed with status ${response.status}.`;
    console.error("[email] resend send failed", {
      to,
      type: input.type ?? "unspecified",
      message,
    });
    return {
      status: "skipped",
      reason: message,
    };
  }

  await persistEmailLog(input, payload.id ?? null);

  return {
    status: "sent",
    providerMessageId: payload.id ?? null,
  };
}
