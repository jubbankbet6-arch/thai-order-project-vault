// n8n Code node: 🧾 CUSTOMER_CHAT_EVIDENCE_PREPARE
// Mode: Run Once for All Items
// Input: 🌌 HERMES_CHAT_RAW_ALL or the normalized chat splitter
// Destination: chat_customer_evidence, Supabase REST Upsert on dedupe_key
// This is chat evidence only; it does not create or replace order evidence.

const output = [];
const seen = new Set();

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

for (const item of $input.all()) {
  const r = item.json ?? {};
  const pageId = String(r.page_id ?? r.Page_ID ?? r.pageId ?? "").trim();
  const conversationKey = String(r.conversation_key ?? r.conversation_id ?? r.thread_id ?? r.threadId ?? "").trim();
  const from = r.message_from ?? r.from ?? {};
  const senderId = String(r.message_from_id ?? r.sender_id ?? from.id ?? r.customer_id ?? "").trim();
  const sourceMessageId = String(r.source_message_id ?? r.message_id ?? r.id ?? "").trim();
  const text = String(r.message_text ?? r.message ?? r.text ?? "");
  const occurredAt = r.occurred_at ?? r.message_created_time ?? r.created_time ?? r.time ?? null;
  const attachments = arrayValue(r.attachments_json ?? r.attachments);
  const imageUrls = arrayValue(r.image_urls).map(String).filter(url => /^https?:\/\//i.test(url));

  // Evidence is customer-only and uses explicit sender/page identity.
  if (!pageId || !conversationKey || !senderId) continue;
  if (r.speaker === "page" || r.speaker_type === "page" || r.is_echo === true || r.message_is_echo === true || senderId === pageId) continue;
  if (!sourceMessageId && !text.trim() && attachments.length === 0 && imageUrls.length === 0) continue;

  const dedupeKey = String(r.dedupe_key || (sourceMessageId
    ? `meta:${sourceMessageId}`
    : `meta:${pageId}:${conversationKey}:${occurredAt ?? ""}:${text}:${JSON.stringify(attachments)}`));
  if (seen.has(dedupeKey)) continue;
  seen.add(dedupeKey);

  output.push({ json: {
    source_message_id: sourceMessageId || null,
    dedupe_key: dedupeKey,
    page_id: pageId,
    page_name: r.page_name ?? r.Page_Name ?? r.pageName ?? null,
    conversation_key: conversationKey,
    customer_id: r.customer_id ?? senderId,
    customer_name: r.customer_name ?? r.message_from_name ?? r.sender_name ?? from.name ?? null,
    sender_id: senderId,
    sender_name: r.message_from_name ?? r.sender_name ?? from.name ?? null,
    speaker_type: "customer",
    message_text: text,
    message_type: r.message_type ?? (imageUrls.length || attachments.length ? "attachment" : "text"),
    attachments_json: attachments,
    image_urls: imageUrls,
    has_image: imageUrls.length > 0 || attachments.some(a => /image/i.test(String(a?.mime_type ?? a?.type ?? ""))),
    attachment_count: attachments.length,
    shares_json: r.shares_json ?? r.shares ?? null,
    sticker_json: r.sticker_json ?? r.sticker ?? null,
    occurred_at: occurredAt,
    source_created_at: r.source_created_at ?? r.message_created_time ?? r.created_time ?? null,
    last_seen_at: new Date().toISOString(),
    raw_payload: r.raw_payload ?? r,
    ingestion_source: "meta_n8n_polling"
  } });
}

return output;

// HTTP Request JSON body should pass the complete $json object.
// URL: /rest/v1/chat_customer_evidence?on_conflict=dedupe_key
// Headers: Prefer: resolution=merge-duplicates,return=minimal
