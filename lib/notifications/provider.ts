type WhatsAppSendPayload = {
  to: string;
  body: string;
};

export type WhatsAppSendResult =
  | {
      status: "sent";
      providerMessageId?: string | null;
    }
  | {
      status: "skipped";
      reason: string;
    };

interface WhatsAppProvider {
  sendMessage(payload: WhatsAppSendPayload): Promise<WhatsAppSendResult>;
}

class NoopWhatsAppProvider implements WhatsAppProvider {
  async sendMessage(): Promise<WhatsAppSendResult> {
    return {
      status: "skipped",
      reason: "WhatsApp provider is not configured.",
    };
  }
}

class TwilioWhatsAppProvider implements WhatsAppProvider {
  async sendMessage(payload: WhatsAppSendPayload): Promise<WhatsAppSendResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const from = process.env.TWILIO_WHATSAPP_FROM?.trim();

    if (!accountSid || !authToken || !from) {
      return {
        status: "skipped",
        reason: "Twilio WhatsApp credentials are incomplete.",
      };
    }

    const body = new URLSearchParams({
      From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
      To: payload.to.startsWith("whatsapp:") ? payload.to : `whatsapp:${payload.to}`,
      Body: payload.body,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Twilio WhatsApp send failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as { sid?: string };

    return {
      status: "sent",
      providerMessageId: data.sid ?? null,
    };
  }
}

class MetaWhatsAppProvider implements WhatsAppProvider {
  async sendMessage(payload: WhatsAppSendPayload): Promise<WhatsAppSendResult> {
    const apiKey = process.env.WHATSAPP_API_KEY?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

    if (!apiKey || !phoneNumberId) {
      return {
        status: "skipped",
        reason: "WhatsApp Cloud API credentials are incomplete.",
      };
    }

    const to = payload.to.startsWith("+") ? payload.to.slice(1) : payload.to;
    const response = await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: {
            body: payload.body,
          },
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meta WhatsApp send failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      messages?: Array<{ id?: string }>;
    };

    return {
      status: "sent",
      providerMessageId: data.messages?.[0]?.id ?? null,
    };
  }
}

function getWhatsAppProvider(): WhatsAppProvider {
  const provider = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();

  if (!provider || provider === "noop") {
    if (
      process.env.WHATSAPP_API_KEY?.trim() &&
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
    ) {
      return new MetaWhatsAppProvider();
    }

    return new NoopWhatsAppProvider();
  }

  if (provider === "twilio") {
    return new TwilioWhatsAppProvider();
  }

  if (provider === "meta" || provider === "whatsapp_cloud") {
    return new MetaWhatsAppProvider();
  }

  return new NoopWhatsAppProvider();
}

export async function sendWhatsAppMessage(payload: WhatsAppSendPayload) {
  return getWhatsAppProvider().sendMessage(payload);
}
