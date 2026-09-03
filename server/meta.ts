import { createHmac, timingSafeEqual } from "node:crypto";

export type MetaAttachment = { type: string; url?: string; payload?: Record<string, unknown> };

function pageToken(pageId: string) {
  const configured = process.env.META_PAGES_JSON;
  if (configured) {
    try {
      const pages = JSON.parse(configured) as Array<{ pageId: string; pageAccessToken: string }>;
      const page = pages.find(item => item.pageId === pageId);
      if (page?.pageAccessToken) return page.pageAccessToken;
    } catch { /* Keep the single-page fallback below. */ }
  }
  if (pageId === process.env.META_PAGE_ID) return process.env.META_PAGE_ACCESS_TOKEN;
  return undefined;
}

export function verifyMetaSignature(rawBody: string, signature: string | undefined) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function sendMetaMessage(input: { pageId: string; recipientId: string; text?: string; imageUrl?: string }) {
  const accessToken = pageToken(input.pageId);
  if (!accessToken) throw new Error(`No Meta page token configured for page ${input.pageId}`);
  if (!input.text?.trim() && !input.imageUrl) throw new Error("Message text or image is required");
  const message: Record<string, unknown> = {};
  if (input.text?.trim()) message.text = input.text.trim();
  if (input.imageUrl) message.attachment = { type: "image", payload: { url: input.imageUrl, is_reusable: false } };
  const response = await fetch(`https://graph.facebook.com/v26.0/${encodeURIComponent(input.pageId)}/messages?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipient: { id: input.recipientId }, messaging_type: "RESPONSE", message }),
  });
  const result = await response.json() as { message_id?: string; recipient_id?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || `Meta Send API returned HTTP ${response.status}`);
  return result;
}

export function extractMetaMessages(body: any) {
  const events: Array<{ providerMessageId?: string; pageId: string; threadId: string; senderId: string; text?: string; attachments?: MetaAttachment[]; occurredAt: Date }> = [];
  if (body?.object !== "page" && body?.object !== "instagram") return events;
  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    const pageId = String(entry.id ?? "");
    for (const event of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const message = event.message;
      if (!message || message.is_echo) continue;
      const senderId = String(event.sender?.id ?? "");
      if (!pageId || !senderId) continue;
      events.push({
        providerMessageId: message.mid ? String(message.mid) : undefined,
        pageId,
        threadId: senderId,
        senderId,
        text: message.text ? String(message.text) : undefined,
        attachments: Array.isArray(message.attachments) ? message.attachments.map((attachment: any) => ({ type: String(attachment.type ?? "file"), url: attachment.payload?.url ? String(attachment.payload.url) : undefined, payload: attachment.payload })) : undefined,
        occurredAt: new Date(Number(event.timestamp) || Date.now()),
      });
    }
  }
  return events;
}
