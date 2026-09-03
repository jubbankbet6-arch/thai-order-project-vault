export type OrderSummaryInput = {
  rawText: string;
  customerName?: string;
  product?: string;
  cod?: string;
  orderNumber?: string;
};

export type OrderSummary = {
  orderNumber: string;
  customerName: string;
  phone: string;
  address: string;
  product: string;
  cod: string;
  copyText: string;
};

function clean(value: string | undefined) {
  return String(value ?? "").replace(/[\t ]+/g, " ").trim();
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

function thaiOrderNumber(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  return `ORD-${get("day")}${get("month")}${get("year")}-${get("hour")}${get("minute")}${get("second")}`;
}

function parseAddress(lines: string[]) {
  return lines.filter(line => {
    if (!line) return false;
    if (/^(ชื่อ|ลูกค้า|ผู้รับ|โทร|เบอร์|phone|tel|cod|ยอด|สินค้า|product|sku|order|เลขที่|หมายเหตุ)\s*[:：]/i.test(line)) return false;
    if (/^0\d{8,9}$/.test(line.replace(/[ -]/g, ""))) return false;
    return true;
  }).join(" ").replace(/\s+/g, " ").trim();
}

export function generateOrderSummary(input: OrderSummaryInput, now = new Date()): OrderSummary {
  const rawText = clean(input.rawText);
  const lines = rawText.split(/\r?\n/).map(clean).filter(Boolean);
  const phone = firstMatch(rawText, [/(0\d{8,9})/, /(?:โทร|เบอร์|phone|tel)\s*[:：]?\s*([0-9 -]{9,13})/i]).replace(/[ -]/g, "");
  const customerName = clean(input.customerName) || firstMatch(rawText, [/(?:ชื่อ|ลูกค้า|ผู้รับ|customer)\s*[:：-]\s*([^\n]+)/i]) || lines.find(line => /[ก-๙]{2,}/.test(line) && !/(ตำบล|ต\.|อำเภอ|อ\.|จังหวัด|จ\.|ถนน|หมู่|แขวง|เขต|บ้านเลขที่)/.test(line) && !/\d{5}/.test(line)) || "ไม่ระบุชื่อ";
  const cod = clean(input.cod) || firstMatch(rawText, [/(?:COD|เก็บปลายทาง|ยอด(?:รวม)?|ราคา)\s*[:：]?\s*([\d,]+(?:\.\d+)?)\s*(?:บาท|฿)?/i]) || "ไม่ระบุ";
  const product = clean(input.product) || firstMatch(rawText, [/(?:สินค้า|product|sku)\s*[:：-]\s*([^\n]+)/i]) || lines.find(line => /(?:คอต|คอตตอน|กล่อง|ชิ้น|SKU|MOND|CAVALLO|MILANO|SEVIOS|MANGO|GREEN|RED|BLUE|PURPLE)/i.test(line)) || "ไม่ระบุสินค้า";
  const address = parseAddress(lines.filter(line => line !== customerName && !line.replace(/[ -]/g, "").includes(phone)));
  const orderNumber = clean(input.orderNumber) || thaiOrderNumber(now);
  const copyText = [orderNumber, customerName, phone || "ไม่ระบุเบอร์โทร", address || "ไม่ระบุที่อยู่", product, cod === "ไม่ระบุ" ? cod : `${cod} บาท`].join("\n");
  return { orderNumber, customerName, phone, address, product, cod, copyText };
}
