// n8n Code node: 🌌 HERMES_FETCH_FACEBOOK_ALL
// Mode: Run Once for All Items
// Reads page_id/access_token from 🔮BB_EMPIRE_DATABASE; never returns access_token.

const configItems = $("🔮BB_EMPIRE_DATABASE").all();
const now = new Date();
const since = new Date(now.getTime() - 5 * 60 * 60 * 1000);
const fields = "id,updated_time,message_count,unread_count,participants,can_reply,messages.limit(50){id,message,created_time,from{id,name},is_echo,attachments{mime_type,name,file_url,url},shares{name,link},sticker}";

function errorText(error) {
  const value = error ?? {};
  const details = value.response?.data ?? value.response?.body ?? value.body ?? value.cause?.response?.data;
  if (details) return typeof details === "string" ? details : JSON.stringify(details);
  if (value.message) return String(value.message);
  try { return JSON.stringify(value); } catch { return "Unknown Facebook API error"; }
}

const pages = configItems.map(item => item.json).map(page => ({
  page_index: String(page.page_index ?? page.pageIndex ?? page.row_number ?? ""),
  page_id: String(page.page_id ?? page.pageId ?? ""),
  page_name: page.page_name ?? page.pageName ?? null,
  system_status: String(page.system_status ?? page.status ?? "OFF").toUpperCase(),
  access_token: String(page.access_token ?? page.page_access_token ?? page.pageAccessToken ?? page.token ?? ""),
  assigned_agent: page.assigned_agent ?? page.assignedAgent ?? null,
  assigned_hashtag: page.assigned_hashtag ?? page.assigned_Hashtag ?? null,
})).filter(page => page.page_id && page.system_status === "ON" && page.access_token);

if (!pages.length) throw new Error("ไม่พบเพจที่มี page_id, Token และสถานะ ON จาก 🔮BB_EMPIRE_DATABASE");

const output = [];
for (const page of pages) {
  try {
    const response = await this.helpers.httpRequest({
      method: "GET",
      url: `https://graph.facebook.com/v20.0/${encodeURIComponent(page.page_id)}/conversations`,
      qs: { fields, limit: "30", since: since.toISOString(), until: now.toISOString(), access_token: page.access_token },
      json: true,
    });
    output.push({ json: { page_index: page.page_index, page_id: page.page_id, page_name: page.page_name, system_status: page.system_status, assigned_agent: page.assigned_agent, assigned_hashtag: page.assigned_hashtag, fetched_at: now.toISOString(), fetch_status: "success", facebook_response: response } });
  } catch (error) {
    output.push({ json: { page_index: page.page_index, page_id: page.page_id, page_name: page.page_name, system_status: page.system_status, fetched_at: now.toISOString(), fetch_status: "error", fetch_error: errorText(error), facebook_response: { data: [] } } });
  }
}
return output;

// Security: keep access_token only inside this node and n8n credentials/secure data.
// If an API error occurs, inspect fetch_error; do not print the token.

// Expected output: one item per configured page, with facebook_response.data[].
// Connect this output to 🌌 HERMES_CHAT_RAW_ALL and leave the existing order branch unchanged.

// n8n Code nodes may require the node name to be exact, including emoji.
// If renamed, change the $(
