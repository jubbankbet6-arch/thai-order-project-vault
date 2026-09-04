// n8n Code node: 🌌 HERMES_FETCH_FACEBOOK_ALL
// Mode: Run Once for All Items
// Reads page_id/access_token from 🔮BB_EMPIRE_DATABASE; never returns access_token.
// Uses bounded parallel requests so 7 pages do not wait one-by-one.

const configItems = $("🔮BB_EMPIRE_DATABASE").all();
const now = new Date();
const since = new Date(now.getTime() - 5 * 60 * 60 * 1000);
const PAGE_CONCURRENCY = 4;
const fields = "id,updated_time,message_count,unread_count,participants,can_reply,messages.limit(30){id,message,created_time,from{id,name},is_echo,attachments{mime_type,name,file_url,url},shares{name,link},sticker}";

function errorText(error) {
  const value = error ?? {};
  const details = value.response?.data ?? value.response?.body ?? value.body ?? value.cause?.response?.data;
  if (details) return typeof details === "string" ? details : JSON.stringify(details);
  if (value.message) return String(value.message);
  try { return JSON.stringify(value); } catch { return "Unknown Facebook API error"; }
}

const pages = configItems
  .map(item => item.json)
  .map(page => ({
    page_index: String(page.page_index ?? page.pageIndex ?? page.row_number ?? ""),
    page_id: String(page.page_id ?? page.pageId ?? ""),
    page_name: page.page_name ?? page.pageName ?? null,
    system_status: String(page.system_status ?? page.status ?? "OFF").toUpperCase(),
    access_token: String(page.access_token ?? page.page_access_token ?? page.pageAccessToken ?? page.token ?? ""),
    assigned_agent: page.assigned_agent ?? page.assignedAgent ?? null,
    assigned_hashtag: page.assigned_hashtag ?? page.assigned_Hashtag ?? null,
  }))
  .filter(page => page.page_id && page.system_status === "ON" && page.access_token);

if (!pages.length) throw new Error("ไม่พบเพจที่มี page_id, Token และสถานะ ON จาก 🔮BB_EMPIRE_DATABASE");

async function fetchPage(page) {
  try {
    const response = await this.helpers.httpRequest({
      method: "GET",
      url: `https://graph.facebook.com/v20.0/${encodeURIComponent(page.page_id)}/conversations`,
      qs: {
        fields,
        limit: "30",
        since: since.toISOString(),
        until: now.toISOString(),
        access_token: page.access_token,
      },
      json: true,
    });
    return {
      json: {
        page_index: page.page_index,
        page_id: page.page_id,
        page_name: page.page_name,
        system_status: page.system_status,
        assigned_agent: page.assigned_agent,
        assigned_hashtag: page.assigned_hashtag,
        fetched_at: now.toISOString(),
        fetch_status: "success",
        facebook_response: response,
      },
    };
  } catch (error) {
    return {
      json: {
        page_index: page.page_index,
        page_id: page.page_id,
        page_name: page.page_name,
        system_status: page.system_status,
        fetched_at: now.toISOString(),
        fetch_status: "error",
        fetch_error: errorText(error),
        facebook_response: { data: [] },
      },
    };
  }
}

const output = [];
for (let start = 0; start < pages.length; start += PAGE_CONCURRENCY) {
  const batch = pages.slice(start, start + PAGE_CONCURRENCY);
  const results = await Promise.all(batch.map(page => fetchPage.call(this, page)));
  output.push(...results);
}

return output;

// Security: access_token is used only inside this node and is never returned.
// Existing order workflow stays separate; connect this output to HERMES_CHAT_RAW_ALL.
