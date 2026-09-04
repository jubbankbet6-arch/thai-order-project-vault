// n8n Code node: 🌌 HERMES_CHAT_RAW_ALL
// Mode: Run Once for All Items
// Input: one item per page from 🌌 HERMES_FETCH_FACEBOOK_ALL.
// This node does not filter COD or speaker; it preserves every message and timestamp.

const output = [];
const now = new Date().toISOString();

function cleanText(value) {
  return String(value ?? "").replace(/udfe[0-9a-fA-F]{0,4}/gi, "").replace(/\\?ud[0-9a-fA-F]+/gi, "").replace(/\\n/g, "\n").replace(/\\\s*n/gi, "\n").trim();
}
function attachmentsOf(message) {
  if (Array.isArray(message.attachments?.data)) return message.attachments.data;
  return Array.isArray(message.attachments) ? message.attachments : [];
}
function imageUrlsOf(attachments) {
  const urls = [];
  for (const attachment of attachments) {
    const candidates = [
      attachment.url,
      attachment.file_url,
      attachment.payload?.url,
      attachment.image_data?.url,
      attachment.target?.url,
    ];
    for (const url of candidates) {
      if (typeof url === "string" && /^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
    }
  }
  return urls;
}

for (const item of $input.all()) {
  const source = item.json ?? {};
  const graph = source.facebook_response ?? source.body ?? source;
  const pageId = String(source.page_id ?? source.pageId ?? graph.page_id ?? "");
  const pageName = source.page_name ?? source.pageName ?? null;
  const conversations = Array.isArray(graph.data) ? graph.data : Array.isArray(graph.conversations) ? graph.conversations : [];

  for (const conversation of conversations) {
    const conversationId = String(conversation.id ?? "");
    const participants = Array.isArray(conversation.participants?.data) ? conversation.participants.data : [];
    // HTTP Request nodes can return only Facebook's body and drop the input
    // config. Recover the page context from the participant with a long Meta
    // Page ID; this matches the real Graph response shape.
    const inferredPage = participants.find(participant => String(participant.id ?? "").length > 10);
    const conversationPageId = pageId || String(inferredPage?.id ?? "");
    const conversationPageName = pageName || inferredPage?.name || null;
    const messages = Array.isArray(conversation.messages?.data) ? conversation.messages.data : [];

    if (!messages.length) {
      output.push({ json: { record_type: "conversation", page_id: conversationPageId, page_name: conversationPageName, page_index: source.page_index ?? null, conversation_id: conversationId, conversation_key: conversationId, conversation_updated_time: conversation.updated_time ?? null, conversation_message_count: conversation.message_count ?? 0, conversation_unread_count: conversation.unread_count ?? 0, can_reply: conversation.can_reply ?? null, participants, fetched_at: source.fetched_at ?? now, fetch_status: source.fetch_status ?? "success", raw_conversation: conversation } });
      continue;
    }

    for (const message of messages) {
      const messageId = String(message.id ?? "");
      const fromId = String(message.from?.id ?? "");
      const occurredAt = message.created_time ?? conversation.updated_time ?? source.fetched_at ?? now;
      const text = cleanText(message.message ?? message.text ?? "");
      const attachments = attachmentsOf(message);
      const imageUrls = imageUrlsOf(attachments);
      const isEcho = message.is_echo === true;
      const speakerHint = isEcho || (conversationPageId && fromId === conversationPageId) ? "page" : "customer";
      const dedupeKey = ["meta", conversationPageId, conversationId, messageId || occurredAt, text.slice(0, 100)].join(":");

      output.push({ json: {
        record_type: "message",
        page_id: conversationPageId, page_name: conversationPageName, page_index: source.page_index ?? null,
        conversation_id: conversationId, conversation_key: conversationId,
        conversation_updated_time: conversation.updated_time ?? null,
        conversation_message_count: conversation.message_count ?? null,
        conversation_unread_count: conversation.unread_count ?? null,
        can_reply: conversation.can_reply ?? null, participants,
        message_id: messageId || null, source_message_id: messageId || null, dedupe_key: dedupeKey,
        message_text: text, message_type: imageUrls.length ? "image" : attachments.length ? "attachment" : "text", attachments,
        attachment_count: attachments.length, has_image: imageUrls.length > 0, image_urls: imageUrls,
        shares: message.shares ?? null, sticker: message.sticker ?? null,
        message_from: message.from ?? null, message_from_id: fromId || null, message_from_name: message.from?.name ?? null,
        message_is_echo: isEcho, speaker_hint: speakerHint,
        message_created_time: message.created_time ?? null, occurred_at: occurredAt,
        fetched_at: source.fetched_at ?? now, fetch_status: source.fetch_status ?? "success",
        raw_conversation: conversation, raw_message: message,
      } });
    }
  }
}

// n8n stops a branch when a Code node returns zero items. Return a harmless
// status item on an empty API window; downstream processors skip non-message
// records, so this prevents a false workflow stop without inventing a chat.
if (!output.length) {
  output.push({
    json: {
      record_type: "sync_status",
      status: "empty",
      message_count: 0,
      fetched_at: now,
      note: "Facebook API returned no conversations/messages in this window",
    },
  });
}

return output;

// Downstream processors decide the final speaker/table. Keep raw_message for audit and troubleshooting.
