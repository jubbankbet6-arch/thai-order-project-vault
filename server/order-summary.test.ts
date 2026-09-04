import { describe, expect, it } from "vitest";
import { generateOrderSummary } from "./order-summary";

describe("generateOrderSummary", () => {
  it("creates an ORD number and extracts common Thai order fields", () => {
    const result = generateOrderSummary({
      rawText: "ชื่อ: สมชาย ใจดี\nโทร: 081-234-5678\nบ้านเลขที่ 99/1 หมู่ 2 ต.บางรัก อ.เมือง จ.นนทบุรี 11000\nสินค้า: MANGO_GREEN 2 คอต\nCOD: 1,250",
    }, new Date("2026-09-04T02:22:58.000Z"));

    expect(result.orderNumber).toBe("ORD-040926-092258");
    expect(result.customerName).toBe("สมชาย ใจดี");
    expect(result.phone).toBe("0812345678");
    expect(result.address).toContain("99/1");
    expect(result.product).toContain("MANGO_GREEN");
    expect(result.cod).toBe("1,250");
    expect(result.copyText).toContain("ORD-040926-092258");
  });

  it("allows admin overrides for ambiguous pasted content", () => {
    const result = generateOrderSummary({
      rawText: "ส่งที่ 12/4 ถนนสุขุมวิท กรุงเทพฯ 10110",
      customerName: "ลูกค้าหน้าร้าน",
      product: "SKU-RED 1 คอต",
      cod: "450",
    });

    expect(result.customerName).toBe("ลูกค้าหน้าร้าน");
    expect(result.product).toBe("SKU-RED 1 คอต");
    expect(result.cod).toBe("450");
    expect(result.copyText).toContain("450 บาท");
  });

  it("maps Thai product aliases to the standard label used by the mapping workflow", () => {
    const result = generateOrderSummary({
      rawText: "ชื่อ Hz บ้านเลขที่ 58 ถนนลงหาดบางแสน ต.แสนสุข อ.เมือง จ.ชลบุรี 20130 เบอร์ 0930002488✅ เซียร่าเขียว 1",
    }, new Date("2026-09-04T08:32:14.000Z"));

    expect(result.product).toBe("🟩 SEVIOS_GREEN(ซีวอสเขียว) 1 คอต");
    expect(result.copyText).toContain("🟩 SEVIOS_GREEN(ซีวอสเขียว) 1 คอต");
  });
});
