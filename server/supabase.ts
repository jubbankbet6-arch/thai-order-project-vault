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
  latestAt: string | null;
  latestOrderNumber: string;
  customerName: string | null;
  preview: string;
  orderCount: number;
  sentCount: number;
  orders: LiveOrder[];
  chatTimeline: string[];
};

const orderSelect = [
  "id", "upsert_key", "order_number", "order_date", "order_time", "created_at", "updated_at",
  "customer_name", "facebook_name", "phone", "full_address", "address_display_packer",
  "page_name", "page_id", "thread_id", "threadId", "cod_amount", "expected_cod", "sku", "th_name", "emoji", "label_display",
  "display_for_packer", "telegram_status", "order_status", "audit_status", "audit_flags",
  "cod_check_status", "is_ready_to_pack", "telegram_message", "telegram_chat_id", "clean_text", "single_cleaned_block", "telegram_body",
].join(",");

const itemSelect = [
  "id", "upsert_key", "order_number", "order_date", "order_time", "created_at", "updated_at",
  "customer_name", "facebook_name", "phone", "full_address", "address_display_packer", "addressclean",
  "page_name", "page_id", "thread_id", "threadId", "sku", "th_name", "emoji", "label_display", "display_for_packer",
  "telegram_final_mapped", "quantity", "qty", "unit_price", "expected_cod", "cod_amount", "telegram_status",
  "order_status", "audit_status", "audit_flags", "cod_check_status", "is_ready_to_pack", "telegram_message",
  "telegram_chat_id", "clean_text", "single_cleaned_block", "telegram_body",
].join(",");

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
    telegram_chat_id: text(row.telegram_chat_id),
    source_text: text(row.clean_text) ?? text(row.single_cleaned_block),
    raw_text_with_phone: text(row.raw_text_with_phone ?? bodyField(row, "raw_text_with_phone")),
    raw_text_with_phone_timed: text(row.raw_text_with_phone_timed ?? bodyField(row, "raw_text_with_phone_timed")),
    full_chunk_text: text(row.full_chunk_text ?? bodyField(row, "full_chunk_text")),
    chat_timeline: timeline(row.chat_timeline ?? bodyField(row, "chat_timeline")),
    items,
  };
}

export async function fetchLiveOrders(search?: string) {
  const [rawOrders, rawItems] = await Promise.all([
    getRows<Record<string, unknown>>("bb_order", orderSelect, 1000),
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

export async function fetchLiveThreads(search?: string) {
  const orders = (await fetchLiveOrders(search)).filter(order => Boolean(order.page_id || order.page_name));
  const storedMessages = await listStoredChatMessages();
  const groups = new Map<string, LiveThread>();
  for (const order of orders) {
    const key = `${order.page_id ?? order.page_name ?? "unknown"}::${order.thread_id ?? order.threadId ?? order.customer_name ?? order.order_number}`;
    const existing = groups.get(key);
    const itemPreview = order.items.map(item => item.display_for_packer || item.th_name || item.sku).filter(Boolean).join(", ");
    const thread: LiveThread = existing ?? {
      key,
      pageName: order.page_name ?? order.page_id ?? "เพจไม่ทราบ",
      pageId: order.page_id,
      threadId: order.thread_id ?? order.threadId,
      latestAt: order.updated_at ?? order.created_at ?? order.order_time,
      latestOrderNumber: order.order_number,
      customerName: order.customer_name,
      chatTimeline: [],
      preview: order.source_text ?? itemPreview ?? order.display_for_packer ?? "มีออเดอร์ใหม่",
      orderCount: 0,
      sentCount: 0,
      orders: [],
    };
    thread.orders.push(order);
    for (const line of order.chat_timeline.length ? order.chat_timeline : timeline(order.raw_text_with_phone_timed)) {
      if (!thread.chatTimeline.includes(line)) thread.chatTimeline.push(line);
    }
    thread.orderCount += 1;
    if (String(order.telegram_status ?? "").toUpperCase() === "SENT") thread.sentCount += 1;
    if ((Date.parse(String(order.updated_at ?? order.created_at ?? "")) || 0) > (Date.parse(String(thread.latestAt ?? "")) || 0)) {
      thread.latestAt = order.updated_at ?? order.created_at ?? order.order_time;
      thread.latestOrderNumber = order.order_number;
      thread.customerName = order.customer_name;
      thread.preview = order.source_text ?? itemPreview ?? order.display_for_packer ?? thread.preview;
    }
    groups.set(key, thread);
  }
  for (const message of storedMessages) {
    const key = `${message.pageId}::${message.threadId}`;
    const messageAt = message.occurredAt?.toISOString?.() ?? String(message.occurredAt ?? "");
    const existing = groups.get(key);
    const thread: LiveThread = existing ?? {
      key,
      pageName: message.pageName ?? message.pageId,
      pageId: message.pageId,
      threadId: message.threadId,
      latestAt: messageAt,
      latestOrderNumber: "",
      customerName: null,
      chatTimeline: [],
      preview: message.text ?? "มีรูปภาพแนบ",
      orderCount: 0,
      sentCount: 0,
      orders: [],
    };
    if ((Date.parse(messageAt) || 0) > (Date.parse(String(thread.latestAt ?? "")) || 0)) {
      thread.latestAt = messageAt;
      thread.preview = message.text ?? "มีรูปภาพแนบ";
    }
    if (message.direction === "outbound") thread.sentCount += 1;
    groups.set(key, thread);
  }
  return Array.from(groups.values()).sort((a, b) => (Date.parse(String(b.latestAt ?? "")) || 0) - (Date.parse(String(a.latestAt ?? "")) || 0));
}
