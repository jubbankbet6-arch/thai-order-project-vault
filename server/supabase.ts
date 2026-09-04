import { listStoredChatMessages } from "./db";

export type LiveOrderItem = {
  id?: number;
  upsert_key?: string | null;
  order_number?: string | null;
  sku?: string | null;
  th_name?: string | null;
  emoji?: string | null;
  display_for_packer?: string | null;
  telegram_final_mapped?: string | null;
  label_display?: string | null;
  product_name?: string | null;
  quantity?: number | null;
  qty?: number | null;
  unit_price?: number | null;
  expected_cod?: number | null;
  cod_amount?: number | null;
};

export type LiveOrder = {
  id: number;
  upsert_key: string | null;
  order_number: string;
  order_date: string | null;
  order_time: string | null;
  created_at: string | null;
  updated_at: string | null;
  customer_name: string | null;
  facebook_name: string | null;
  phone: string | null;
  full_address: string | null;
  address_display_packer: string | null;
  page_name: string | null;
  page_id: string | null;
  thread_id: string | null;
  threadId: string | null;
  cod_amount: number | null;
  expected_cod: number | null;
  sku: string | null;
  th_name: string | null;
  emoji: string | null;
  display_for_packer: string | null;
  label_display: string | null;
  telegram_status: string | null;
  order_status: string | null;
  audit_status: string | null;
  audit_flags: string | null;
  cod_check_status: string | null;
  is_ready_to_pack: boolean;
  telegram_message: string | null;
  telegram_copy_text: string | null;
  telegram_chat_id: string | null;
  source_text: string | null;
  raw_text_with_phone: string | null;
  raw_text_with_phone_timed: string | null;
  full_chunk_text: string | null;
  chat_timeline: string[];
  items: LiveOrderItem[];
};

export type LiveOrderStats = {
  total: number;
  mapped: number;
  review: number;
  codCheck: number;
  sent: number;
  pages: number;
};

export type LiveThread = {
  key: string;
  pageName: string;
  pageId: string | null;
  threadId: string | null;
  customerId: string | null;
  latestAt: string | null;
  latestOrderNumber: string;
  customerName: string | null;
  preview: string;
  orderCount: number;
  unread: boolean;
  sentCount: number;
  messageCount: number;
  orders: LiveOrder[];
  chatTimeline: string[];
  searchText: string;
};

export type LiveProductMapping = {
  sku: string;
  label: string;
  price: number | null;
  emoji: string | null;
  aliases?: string | null;
};

export type ExternalChatMessage = {
  id: number;
  providerMessageId: string | null;
  pageId: string;
  pageName: string | null;
  threadId: string;
  senderId: string;
  senderName: string | null;
  customerName: string | null;
  senderType: "customer" | "page";
  side: "left" | "right";
  direction: "inbound" | "outbound";
  text: string | null;
  attachmentsJson: string | null;
  adminUserId?: number | null;
  occurredAt: string | null;
  createdAt: string | null;
};

const orderSelect = [
  "id", "upsert_key", "order_number", "order_date", "order_time", "created_at", "updated_at",
  "customer_name", "facebook_name", "phone", "full_address", "address_display_packer",
  "page_name", "page_id", "thread_id", "threadId", "cod_amount", "expected_cod", "sku", "th_name", "emoji", "label_display",
  "display_for_packer", "telegram_status", "order_status", "audit_status", "audit_flags",
  "cod_check_status", "is_ready_to_pack", "telegram_message", "telegram_copy_text", "telegram_chat_id", "clean_text", "single_cleaned_block", "telegram_body",
].join(",");

const itemSelect = [
  "id", "upsert_key", "order_number", "order_date", "order_time", "created_at", "updated_at",
  "customer_name", "facebook_name", "phone", "full_address", "address_display_packer", "addressclean",
  "page_name", "page_id", "thread_id", "threadId", "sku", "th_name", "emoji", "label_display", "display_for_packer",
  "telegram_final_mapped", "product_name", "quantity", "qty", "unit_price", "expected_cod", "cod_amount", "telegram_status",
  "order_status", "audit_status", "audit_flags", "cod_check_status", "is_ready_to_pack", "telegram_message",
  "telegram_chat_id", "telegram_message", "telegram_copy_text", "clean_text", "single_cleaned_block", "telegram_body",
].join(",");

const recentOrderCache = new Map<string, { expiresAt: number; value: LiveOrder[] }>();
const ORDER_CACHE_TTL_MS = 30_000;

function config() {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new Error("Supabase secrets are not configured");
  return { baseUrl, key };
}

async function getRows<T>(table: string, select: string, limit: number) {
  const { baseUrl, key } = config();
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  url.searchParams.set("select", select);
  url.searchParams.set("limit", String(limit));
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`Supabase ${table} returned HTTP ${response.status}`);
  return response.json() as Promise<T[]>;
}

function text(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function number(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown) {
  return value === true || value === "true" || value === 1;
}

function timeline(value: unknown) {
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(/\n(?=\d{1,2}\/\d{1,2}\/\d{2,4})/).map(item => item.trim()).filter(Boolean);
  return [];
}

function bodyField(row: Record<string, unknown>, field: string) {
  const body = row.telegram_body;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>)[field] : undefined;
}

function sortNewest(a: { created_at?: string | null; order_time?: string | null }, b: { created_at?: string | null; order_time?: string | null }) {
  const aTime = Date.parse(String(a.created_at ?? a.order_time ?? "")) || 0;
  const bTime = Date.parse(String(b.created_at ?? b.order_time ?? "")) || 0;
  return bTime - aTime;
}

function normalizeItem(row: Record<string, unknown>): LiveOrderItem {
  return {
    id: number(row.id) ?? undefined,
    upsert_key: text(row.upsert_key),
    order_number: text(row.order_number),
    sku: text(row.sku),
    th_name: text(row.th_name),
    emoji: text(row.emoji),
    display_for_packer: text(row.display_for_packer),
    telegram_final_mapped: text(row.telegram_final_mapped),
    label_display: text(row.label_display),
    product_name: text(row.product_name),
    quantity: number(row.quantity),
    qty: number(row.qty),
    unit_price: number(row.unit_price),
    expected_cod: number(row.expected_cod),
    cod_amount: number(row.cod_amount),
  };
}

function normalizeOrder(row: Record<string, unknown>, items: LiveOrderItem[]): LiveOrder {
  const orderNumber = text(row.order_number) ?? `#${text(row.id) ?? "unknown"}`;
  return {
    id: number(row.id) ?? 0,
    upsert_key: text(row.upsert_key),
    order_number: orderNumber,
    order_date: text(row.order_date),
    order_time: text(row.order_time),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
    customer_name: text(row.customer_name) ?? text(row.facebook_name),
    facebook_name: text(row.facebook_name),
    phone: text(row.phone) ?? text(row.extracted_phone),
    full_address: text(row.full_address) ?? text(row.address_display_packer),
    address_display_packer: text(row.address_display_packer),
    page_name: text(row.page_name),
    page_id: text(row.page_id),
    thread_id: text(row.thread_id),
    threadId: text(row.threadId),
    cod_amount: number(row.cod_amount),
    expected_cod: number(row.expected_cod),
    sku: text(row.sku),
    th_name: text(row.th_name),
    emoji: text(row.emoji),
    display_for_packer: text(row.display_for_packer) ?? text(row.final_display_for_packer),
    label_display: text(row.label_display),
    telegram_status: text(row.telegram_status),
    order_status: text(row.order_status),
    audit_status: text(row.audit_status),
    audit_flags: text(row.audit_flags),
    cod_check_status: text(row.cod_check_status),
    is_ready_to_pack: bool(row.is_ready_to_pack),
    telegram_message: text(row.telegram_message),
    telegram_copy_text: text(row.telegram_copy_text),
    telegram_chat_id: text(row.telegram_chat_id),
    source_text: text(row.clean_text) ?? text(row.single_cleaned_block),
    raw_text_with_phone: text(row.raw_text_with_phone ?? bodyField(row, "raw_text_with_phone")),
    raw_text_with_phone_timed: text(row.raw_text_with_phone_timed ?? bodyField(row, "raw_text_with_phone_timed")),
    full_chunk_text: text(row.full_chunk_text ?? bodyField(row, "full_chunk_text")),
    chat_timeline: timeline(row.chat_timeline ?? bodyField(row, "chat_timeline") ?? row.raw_text_with_phone_timed ?? row.full_chunk_text ?? row.clean_text ?? row.telegram_copy_text ?? row.telegram_message),
    items,
  };
}

async function getRowsWithFallback<T>(preferredTable: string, fallbackTable: string, select: string, limit: number) {
  try {
    return await getRows<T>(preferredTable, select, limit);
  } catch (error) {
    if (!/404|42P01|relation|does not exist/i.test(String(error))) throw error;
    return getRows<T>(fallbackTable, select, limit);
  }
}

export async function fetchLiveOrders(search?: string) {
  const [rawOrders, rawItems] = await Promise.all([
    getRowsWithFallback<Record<string, unknown>>("bb_orders", "bb_order", orderSelect, 1000),
    getRows<Record<string, unknown>>("bb_order_items_fix", itemSelect, 3000),
  ]);
  const items = rawItems.map(normalizeItem);
  const itemsByOrder = new Map<string, LiveOrderItem[]>();
  for (const item of items) {
    const keys = [item.order_number, item.upsert_key].filter(Boolean) as string[];
    for (const key of keys) itemsByOrder.set(key, [...(itemsByOrder.get(key) ?? []), item]);
  }

  const rawOrderByKey = new Map<string, Record<string, unknown>>();
  for (const row of rawOrders) {
    const key = text(row.order_number) ?? text(row.upsert_key) ?? `id:${text(row.id)}`;
    rawOrderByKey.set(key, row);
  }
  const primaryOrderRows = new Map<string, Record<string, unknown>>();
  for (const row of rawItems) {
    const key = text(row.order_number) ?? text(row.upsert_key) ?? `id:${text(row.id)}`;
    if (!primaryOrderRows.has(key)) primaryOrderRows.set(key, row);
  }
  // The detail table has the more complete customer payload. Keep unmatched
  // bb_order rows as a fallback so no historical order silently disappears.
  for (const row of rawOrders) {
    const key = text(row.order_number) ?? text(row.upsert_key) ?? `id:${text(row.id)}`;
    if (!primaryOrderRows.has(key)) primaryOrderRows.set(key, row);
  }

  const orders = Array.from(primaryOrderRows.entries()).map(([key, row]) => {
    const supplement = rawOrderByKey.get(key);
    const merged = { ...(supplement ?? {}), ...row };
    for (const [field, value] of Object.entries(merged)) {
      if ((value === null || value === undefined || value === "") && supplement?.[field] !== null && supplement?.[field] !== undefined && supplement?.[field] !== "") {
        merged[field] = supplement[field];
      }
    }
    const linkedItems = itemsByOrder.get(key) ?? [];
    const uniqueItems = Array.from(new Map(linkedItems.map(item => [item.id ?? `${item.sku}-${item.quantity}`, item])).values());
    return normalizeOrder(merged, uniqueItems);
  }).sort(sortNewest);

  const query = search?.trim().toLowerCase();
  if (!query) return orders;
  return orders.filter(order => [order.order_number, order.customer_name, order.facebook_name, order.phone, order.sku, order.th_name, order.page_name].some(value => String(value ?? "").toLowerCase().includes(query)));
}

export function getLiveOrderStats(orders: LiveOrder[]): LiveOrderStats {
  const pages = new Set(orders.map(order => order.page_name).filter(Boolean));
  const mapped = orders.filter(order => order.is_ready_to_pack || /ready|mapped|พร้อม|แมป|ผ่าน/i.test(`${order.audit_status ?? ""} ${order.order_status ?? ""}`)).length;
  const codCheck = orders.filter(order => {
    const status = String(order.cod_check_status ?? "").toUpperCase();
    return status !== "" && status !== "PASS";
  }).length;
  return {
    total: orders.length,
    mapped,
    review: Math.max(orders.length - mapped, 0),
    codCheck,
    sent: orders.filter(order => String(order.telegram_status ?? "").toUpperCase() === "SENT").length,
    pages: pages.size,
  };
}

export async function fetchLiveOrder(orderNumber: string) {
  const orders = await fetchLiveOrders(orderNumber);
  return orders.find(order => order.order_number === orderNumber) ?? null;
}

export async function fetchOrdersForThread(pageId: string, threadId: string): Promise<LiveOrder[]> {
  const cacheKey = `${pageId}::${threadId}`;
  const cached = recentOrderCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const { baseUrl, key } = config();
  const request = async (table: string) => {
    const url = new URL(`${baseUrl}/rest/v1/${table}`);
    url.searchParams.set("select", orderSelect);
    url.searchParams.set("page_id", `eq.${pageId}`);
    url.searchParams.set("thread_id", `eq.${threadId}`);
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", "20");
    return fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  };
  let response = await request("bb_orders");
  if (!response.ok && /404|42P01|relation|does not exist/i.test(await response.text())) response = await request("bb_order");
  if (!response.ok) throw new Error(`Supabase order thread lookup returned HTTP ${response.status}`);
  const rows = await response.json() as Array<Record<string, unknown>>;
  const result = rows.map(row => normalizeOrder(row, [])).sort(sortNewest);
  recentOrderCache.set(cacheKey, { expiresAt: Date.now() + ORDER_CACHE_TTL_MS, value: result });
  return result;
}

export function clearRecentOrderCache() {
  recentOrderCache.clear();
}

export async function fetchLiveProductMappings(): Promise<LiveProductMapping[]> {
  const rows = await getRows<Record<string, unknown>>("product_master", "sku,label_display,display_for_packer,name_standard,unit_price,emoji,alias", 1000);
  return rows.map(row => ({
    sku: String(row.sku ?? ""),
    label: String(row.label_display ?? row.display_for_packer ?? row.name_standard ?? row.sku ?? ""),
    price: number(row.unit_price),
    emoji: text(row.emoji),
    aliases: text(row.alias),
  })).filter(item => item.sku && item.label).sort((a, b) => a.sku.localeCompare(b.sku));
}

function jsonText(value: unknown) {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

export async function fetchExternalChatMessages(pageId?: string, threadId?: string, limit = 2000): Promise<ExternalChatMessage[]> {
  const { baseUrl, key } = config();
  async function readTable(table: string) {
    const select = table === "chat_customer_messages"
      ? "id,source_message_id,page_id,page_name,conversation_key,customer_id,customer_name,message_text,attachments_json,occurred_at,synced_at"
      : "id,source_message_id,page_id,page_name,conversation_key,page_sender_id,page_sender_name,message_text,attachments_json,occurred_at,synced_at";
    const params = new URLSearchParams({ select, order: "occurred_at.desc", limit: String(limit) });
    if (pageId) params.set("page_id", `eq.${pageId}`);
    if (threadId) params.set("conversation_key", `eq.${threadId}`);
    const response = await fetch(`${baseUrl}/rest/v1/${table}?${params}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error(`Supabase ${table} returned HTTP ${response.status}`);
    return response.json() as Promise<Array<Record<string, unknown>>>;
  }
  try {
    const [customers, pages] = await Promise.all([readTable("chat_customer_messages"), readTable("chat_page_messages")]);
    const pageNames = new Map(pages.map(row => [String(row.page_id ?? ""), text(row.page_name)]));
    const rows: Array<Record<string, unknown> & { senderId: unknown; senderName: unknown; senderType: "customer" | "page"; side: "left" | "right"; direction: "inbound" | "outbound" }> = [
      ...customers.map(row => ({ ...row, page_name: pageNames.get(String(row.page_id ?? "")) ?? row.page_name, senderId: row.customer_id, senderName: row.customer_name, customerName: row.customer_name, senderType: "customer" as const, side: "left" as const, direction: "inbound" as const })),
      ...pages.map(row => ({ ...row, senderId: row.page_sender_id ?? row.page_id, senderName: row.page_sender_name, customerName: null, senderType: "page" as const, side: "right" as const, direction: "outbound" as const })),
    ];
    return rows.map((row, index) => ({
      id: Number(row.id ?? index + 1), providerMessageId: text(row.source_message_id), pageId: String(row.page_id ?? ""), pageName: text(row.page_name),
      threadId: String(row.conversation_key ?? ""), senderId: String(row.senderId ?? ""), senderName: text(row.senderName), customerName: text(row.customerName), senderType: row.senderType, side: row.side, direction: row.direction,
      text: text(row.message_text), attachmentsJson: jsonText(row.attachments_json), occurredAt: text(row.occurred_at), createdAt: text(row.synced_at),
    })).sort((a, b) => (Date.parse(String(b.occurredAt ?? "")) || 0) - (Date.parse(String(a.occurredAt ?? "")) || 0));
  } catch (error) {
    if (/404|42P01|relation|does not exist/i.test(String(error))) return [];
    throw error;
  }
}

export async function syncProductAliasToMaster(input: { alias: string; canonicalSku: string }) {
  const { baseUrl, key } = config();
  const filter = encodeURIComponent(input.canonicalSku);
  const response = await fetch(`${baseUrl}/rest/v1/product_master?select=id,sku,alias&sku=eq.${filter}&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`Supabase product_master lookup returned HTTP ${response.status}`);
  const rows = await response.json() as Array<{ id: number; sku: string; alias: string | null }>;
  const row = rows[0];
  if (!row) throw new Error(`ไม่พบ SKU ${input.canonicalSku} ใน product_master`);
  const aliases = String(row.alias ?? "").split(/[,\n|]+/).map(value => value.trim()).filter(Boolean);
  if (!aliases.some(value => value.toLowerCase() === input.alias.trim().toLowerCase())) aliases.push(input.alias.trim());
  const update = await fetch(`${baseUrl}/rest/v1/product_master?id=eq.${row.id}`, { method: "PATCH", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ alias: aliases.join(", ") }) });
  if (!update.ok) throw new Error(`Supabase product_master update returned HTTP ${update.status}`);
  return { synced: true, sku: row.sku, aliasCount: aliases.length };
}

export async function fetchLiveThreads(search?: string) {
  const externalMessages = await fetchExternalChatMessages();
  const allMessages = externalMessages;
  const groups = new Map<string, LiveThread>();
  const latestDirections = new Map<string, { inbound: number; outbound: number }>();
  for (const message of allMessages) {
    const key = `${message.pageId}::${message.threadId}`;
    const messageAt = String(message.occurredAt ?? "");
    const existing = groups.get(key);
    const thread: LiveThread = existing ?? {
      key,
      pageName: message.pageName ?? message.pageId,
      pageId: message.pageId,
      threadId: message.threadId,
      customerId: message.senderType === "customer" ? message.senderId : null,
      latestAt: messageAt,
      latestOrderNumber: "",
      customerName: message.customerName ?? (message.senderType === "customer" ? message.senderName : null),
      chatTimeline: [],
      preview: message.text ?? "มีรูปภาพแนบ",
      orderCount: 0,
      unread: false,
      sentCount: 0,
      messageCount: 0,
      orders: [],
      searchText: "",
    };
    if (!thread.customerName && message.customerName) thread.customerName = message.customerName;
    if (!thread.customerId && message.senderType === "customer" && message.senderId) thread.customerId = message.senderId;
    if ((Date.parse(messageAt) || 0) > (Date.parse(String(thread.latestAt ?? "")) || 0)) {
      thread.latestAt = messageAt;
      thread.preview = message.text ?? "มีรูปภาพแนบ";
    }
    if (message.direction === "outbound") thread.sentCount += 1;
    thread.messageCount += 1;
    thread.searchText = `${thread.searchText} ${message.text ?? ""}`.trim();
    const directionState = latestDirections.get(key) ?? { inbound: 0, outbound: 0 };
    const timestamp = Date.parse(messageAt) || 0;
    if (message.senderType === "customer") directionState.inbound = Math.max(directionState.inbound, timestamp);
    if (message.senderType === "page") directionState.outbound = Math.max(directionState.outbound, timestamp);
    latestDirections.set(key, directionState);
    groups.set(key, thread);
  }
  groups.forEach((thread, key) => {
    const directionState = latestDirections.get(key);
    thread.unread = Boolean(directionState && directionState.inbound > directionState.outbound);
  });
  const orders = await fetchLiveOrders(search);
  for (const order of orders) {
    const key = `${order.page_id ?? ""}::${order.thread_id ?? order.threadId ?? ""}`;
    const thread = groups.get(key);
    if (!thread) continue;
    thread.orders.push(order);
    thread.orderCount += 1;
    if (!thread.latestOrderNumber) thread.latestOrderNumber = order.order_number;
  }
  return Array.from(groups.values()).sort((a, b) => (Date.parse(String(b.latestAt ?? "")) || 0) - (Date.parse(String(a.latestAt ?? "")) || 0));
}
