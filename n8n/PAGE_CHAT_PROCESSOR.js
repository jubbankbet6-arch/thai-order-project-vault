// n8n Code node: 🟣 PAGE_CHAT_PROCESSOR
// Mode: Run Once for All Items
// Input: 🌌 HERMES_CHAT_RAW_ALL. Output maps to chat_page_messages.

const output = [];
const seen = new Set();
for (const item of $input.all()) {
  const row = item.json;
  if (row.record_type !== "message") continue;
  const pageId = String(row.page_id ?? "");
  const fromId = String(row.message_from_id ?? "");
  const isPage = row.message_is_echo === true || fromId === pageId;
  if (!isPage) continue;
  const dedupeKey = String(row.dedupe_key ?? `meta:${pageId}:${row.conversation_key}:${row.source_message_id ?? ""}`);
  if (seen.has(dedupeKey)) continue;
  seen.add(dedupeKey);
  output.push({ json: {
    source_message_id: row.source_message_id ?? null,
    dedupe_key: dedupeKey,
    page_id: pageId, page_name: row.page_name ?? null,
    conversation_key: row.conversation_key ?? row.conversation_id ?? null,
    page_sender_id: fromId || null, page_sender_name: row.message_from_name ?? null,
    speaker_type: "page", side: "right",
    message_text: row.message_text ?? "", message_type: row.message_type ?? "text",
    attachments_json: row.attachments ?? [], image_urls: row.image_urls ?? [], has_image: row.has_image === true, attachment_count: row.attachment_count ?? 0, shares_json: row.shares ?? null, sticker_json: row.sticker ?? null,
    occurred_at: row.occurred_at ?? row.message_created_time ?? null,
    source_created_at: row.message_created_time ?? null, synced_at: row.fetched_at ?? new Date().toISOString(),
    raw_payload: { page_id: row.page_id, conversation_id: row.conversation_id, message_id: row.message_id, message: row.message_text, from: row.message_from, is_echo: row.message_is_echo, attachments: row.attachments, shares: row.shares, sticker: row.sticker },
  } });
}
return output;

// Supabase destination: chat_page_messages; operation Upsert; conflict column: dedupe_key.
