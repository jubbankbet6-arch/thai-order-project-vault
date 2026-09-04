// n8n Code node: 🌌 HERMES_CHAT_CHUNK_SPLITTER
// Mode: Run Once for All Items
// Input: one or more large Facebook API response chunks from the HTTP node.
// Output: one normalized message item per Meta message for the two processors.
// No API calls and no page-name guessing happen here.

// Page registry is built dynamically from the current n8n input items.
// Match page_id exactly; never infer from names, email, length, or position.
let MASTERCONFIG = [];
let PAGE_BY_ID = new Map();

const output = [];
const seen = new Set();
const now = new Date().toISOString();

function cleanText(value) {
  return String(value ?? "")
    .replace(/udfe[0-9a-fA-F]{0,4}/gi, "")
    .replace(/\\?ud[0-9a-fA-F]+/gi, "")
    .replace(/\\n/g, "\n")
    .replace(/\\\s*n/gi, "\n")
    .trim();
}

function attachmentList(message) {
  if (Array.isArray(message?.attachments?.data)) return message.attachments.data;
  return Array.isArray(message?.attachments) ? message.attachments : [];
}

function imageUrls(attachments) {
  const urls = [];
  for (const attachment of attachments) {
    const candidates = [
      attachment?.url,
      attachment?.file_url,
      attachment?.payload?.url,
      attachment?.image_data?.url,
      attachment?.target?.url,
    ];
    for (const url of candidates) {
      if (typeof url === "string" && /^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
    }
  }
  return urls;
}

function findMessages(value, context = {}) {
  if (Array.isArray(value)) {
    for (const item of value) findMessages(item, context);
    return;
  }
  if (!value || typeof value !== "object") return;

  const candidatePageId = String(context.pageId ?? value.page_id ?? value.pageId ?? "");
  const configPage = PAGE_BY_ID.get(candidatePageId);
  const pageId = configPage?.page_id ?? candidatePageId;
  const pageName = configPage?.page_name ?? context.pageName ?? value.page_name ?? value.pageName ?? null;
  const conversationId = String(context.conversationId ?? value.conversation_id ?? value.thread_id ?? value.id ?? "");
  const participants = Array.isArray(value.participants?.data) ? value.participants.data : context.participants ?? [];
  const messages = Array.isArray(value.messages?.data) ? value.messages.data : null;

  if (messages) {
    const pageParticipant = participants.find(p => String(p?.id ?? "") === pageId);
    const customerParticipant = participants.find(p => String(p?.id ?? "") !== "" && String(p?.id ?? "") !== pageId);
    for (const message of messages) {
      const messageId = String(message?.id ?? "");
      const from = message?.from ?? {};
      const fromId = String(from.id ?? "");
      const text = cleanText(message?.message ?? message?.text ?? "");
      const attachments = attachmentList(message);
      const urls = imageUrls(attachments);
      const isEcho = message?.is_echo === true;
      const isPage = isEcho || Boolean(pageId && fromId && pageId === fromId);
      const occurredAt = message?.created_time ?? value.updated_time ?? context.fetchedAt ?? now;
      const dedupeKey = messageId ? `meta:${messageId}` : `meta:${pageId}:${conversationId}:${occurredAt}:${text}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      output.push({ json: {
        record_type: "message",
        page_id: pageId || null,
        page_name: pageName ?? pageParticipant?.name ?? null,
        conversation_id: conversationId || null,
        conversation_key: conversationId || null,
        thread_id: conversationId || null,
        customer_id: customerParticipant?.id ?? null,
        customer_name: customerParticipant?.name ?? null,
        source_message_id: messageId || null,
        message_id: messageId || null,
        dedupe_key: dedupeKey,
        message_text: text,
        message_type: urls.length ? "image" : attachments.length ? "attachment" : "text",
        attachments,
        attachments_json: attachments,
        image_urls: urls,
        has_image: urls.length > 0,
        attachment_count: attachments.length,
        shares: message?.shares ?? null,
        sticker: message?.sticker ?? null,
        message_from: from,
        message_from_id: fromId || null,
        message_from_name: from.name ?? null,
        message_from_is_page: isPage,
        message_is_echo: isEcho,
        speaker_hint: isPage ? "page" : "customer",
        message_created_time: message?.created_time ?? null,
        occurred_at: occurredAt,
        fetched_at: context.fetchedAt ?? now,
        raw_payload: { page_id: pageId, conversation_id: conversationId, message: message },
      } });
    }
    return;
  }

  const nextContext = {
    pageId: pageId || context.pageId,
    pageName: pageName || context.pageName,
    conversationId: conversationId || context.conversationId,
    participants,
    fetchedAt: context.fetchedAt ?? value.fetched_at ?? now,
  };
  for (const [key, child] of Object.entries(value)) {
    if (key === "raw_message" || key === "raw_conversation") continue;
    findMessages(child, nextContext);
  }
}

const inputItems = $input.all();

// Accept either one config object per item or a single item containing an array.
for (const item of inputItems) {
  const value = item.json ?? {};
  const candidates = Array.isArray(value) ? value : Array.isArray(value.data) && !value.facebook_response ? value.data : [value];
  for (const candidate of candidates) {
    const pageId = String(candidate?.page_id ?? candidate?.pageId ?? "");
    if (!pageId || !candidate || typeof candidate !== "object") continue;
    if (!MASTERCONFIG.some(page => String(page.page_id) === pageId)) MASTERCONFIG.push({
      page_index: candidate.page_index ?? candidate.row_number ?? null,
      page_id: pageId,
      page_name: candidate.page_name ?? candidate.pageName ?? null,
      system_status: String(candidate.system_status ?? candidate.status ?? "ON").toUpperCase(),
      assigned_agent: candidate.assigned_agent ?? candidate.admin_name ?? null,
      assigned_hashtag: candidate.assigned_hashtag ?? candidate.assigned_Hashtag ?? null,
    });
  }
}
PAGE_BY_ID = new Map(MASTERCONFIG.map(page => [String(page.page_id), page]));

for (const item of inputItems) {
  const source = item.json ?? {};
  const graph = source.facebook_response ?? source.body ?? source;
  findMessages(graph, {
    pageId: source.source_page_id ?? source.page_id ?? source.pageId ?? source.page_id_inherited,
    pageName: source.source_page_name ?? source.page_name ?? source.pageName,
    fetchedAt: source.fetched_at ?? now,
  });
}

return output;

// Wiring:
// 🌌 HERMES_FETCH_FACEBOOK_ALL → 🌌 HERMES_CHAT_CHUNK_SPLITTER
// → 💬 CUSTOMER_CHAT_PROCESSOR → chat_customer_messages
// → 🟣 PAGE_CHAT_PROCESSOR → chat_page_messages
