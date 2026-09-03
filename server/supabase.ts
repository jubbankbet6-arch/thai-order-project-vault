export type LiveOrderItem = {
  id?: number;
  upsert_key?: string | null;
  order_number?: string | null;
  sku?: string | null;
  th_name?: string | null;
  emoji?: string | null;
  display_for_packer?: string | null;
  telegram_final_mapped?: string | null;
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
  cod_amount: number | null;
  expected_cod: number | null;
  sku: string | null;
  th_name: string | null;
  emoji: string | null;
  display_for_packer: string | null;
  telegram_status: string | null;
  order_status: string | null;
  audit_status: string | null;
  audit_flags: string | null;
  cod_check_status: string | null;
  is_ready_to_pack: boolean;
  telegram_message: string | null;
  telegram_chat_id: string | null;
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

const orderSelect = [
  "id", "upsert_key", "order_number", "order_date", "order_time", "created_at", "updated_at",
  "customer_name", "facebook_name", "phone", "full_address", "address_display_packer",
  "page_name", "page_id", "cod_amount", "expected_cod", "sku", "th_name", "emoji",
  "display_for_packer", "telegram_status", "order_status", "audit_status", "audit_flags",
  "cod_check_status", "is_ready_to_pack", "telegram_message", "telegram_chat_id",
].join(",");

const itemSelect = [
  "id", "upsert_key", "order_number", "sku", "th_name", "emoji", "display_for_packer",
  "telegram_final_mapped", "quantity", "qty", "unit_price", "expected_cod", "cod_amount",
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
    cod_amount: number(row.cod_amount),
    expected_cod: number(row.expected_cod),
    sku: text(row.sku),
    th_name: text(row.th_name),
    emoji: text(row.emoji),
    display_for_packer: text(row.display_for_packer) ?? text(row.final_display_for_packer),
    telegram_status: text(row.telegram_status),
    order_status: text(row.order_status),
    audit_status: text(row.audit_status),
    audit_flags: text(row.audit_flags),
    cod_check_status: text(row.cod_check_status),
    is_ready_to_pack: bool(row.is_ready_to_pack),
    telegram_message: text(row.telegram_message),
    telegram_chat_id: text(row.telegram_chat_id),
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

  const orders = rawOrders.map(row => {
    const orderNumber = text(row.order_number);
    const upsertKey = text(row.upsert_key);
    const linkedItems = [...(orderNumber ? itemsByOrder.get(orderNumber) ?? [] : []), ...(upsertKey ? itemsByOrder.get(upsertKey) ?? [] : [])];
    const uniqueItems = Array.from(new Map(linkedItems.map(item => [item.id ?? `${item.sku}-${item.quantity}`, item])).values());
    return normalizeOrder(row, uniqueItems);
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
