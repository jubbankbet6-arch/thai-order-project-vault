import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createVaultFile,
  createVaultProject,
  getVaultFile,
  getVaultProject,
  getVaultStats,
  listVaultFiles,
  listVaultProjects,
  updateVaultFile,
  createAuditLog,
  listAuditLogs,
  listChatMessages,
  saveChatMessage,
  listProductAliases,
  createProductAlias,
  updateProductAlias,
} from "./db";
import { fetchConversationEvidence, fetchCustomerChatEvidence, fetchDailyChatOrderSummary, fetchExternalChatMessages, fetchLiveOrder, fetchLiveOrders, fetchOrdersForThread, fetchLiveProductMappings, fetchLiveThreads, fetchStockProducts, fetchStockWarnings, getLiveOrderStats, syncProductAliasToMaster, updateProductMapAlias, updateStockProduct } from "./supabase";
import { generateOrderSummary } from "./order-summary";
import { verifyVaultAccessCode } from "./vault-access";
import { sendMetaMessage } from "./meta";
import { storagePut } from "./storage";

const projectInput = z.object({
  name: z.string().trim().min(1).max(180),
  description: z.string().max(5000).optional(),
  category: z.string().max(80).optional(),
});

const fileInput = z.object({
  projectId: z.number().int().positive(),
  path: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(180),
  language: z.string().trim().min(1).max(40),
  kind: z.enum(["code", "sql", "workflow", "document", "config", "other"]),
  content: z.string().max(2_000_000),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  vault: router({
    verifyAccessCode: adminProcedure.input(z.object({ code: z.string().min(1).max(128) })).mutation(({ input }) => ({ ok: verifyVaultAccessCode(input.code) })),
    projects: adminProcedure.query(({ ctx }) => listVaultProjects(ctx.user.id)),
    project: adminProcedure.input(z.object({ projectId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const project = await getVaultProject(ctx.user.id, input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบโปรเจกต์นี้" });
      return project;
    }),
    files: adminProcedure.input(z.object({ projectId: z.number().int().positive(), search: z.string().optional() })).query(async ({ ctx, input }) => {
      const project = await getVaultProject(ctx.user.id, input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบโปรเจกต์นี้" });
      return listVaultFiles(ctx.user.id, input.projectId, input.search);
    }),
    file: adminProcedure.input(z.object({ fileId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const file = await getVaultFile(ctx.user.id, input.fileId);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบไฟล์นี้" });
      return file;
    }),
    stats: adminProcedure.query(({ ctx }) => getVaultStats(ctx.user.id)),
    createProject: adminProcedure.input(projectInput).mutation(({ ctx, input }) => createVaultProject(ctx.user.id, input)),
    createFile: adminProcedure.input(fileInput).mutation(async ({ ctx, input }) => {
      const project = await getVaultProject(ctx.user.id, input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบโปรเจกต์นี้" });
      try {
        return await createVaultFile(ctx.user.id, input);
      } catch (error) {
        if (String(error).toLowerCase().includes("duplicate")) throw new TRPCError({ code: "CONFLICT", message: "มีไฟล์ path นี้อยู่แล้วในโปรเจกต์" });
        throw error;
      }
    }),
    updateFile: adminProcedure.input(fileInput.extend({ fileId: z.number().int().positive(), isFavorite: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      const saved = await updateVaultFile(ctx.user.id, input.fileId, input);
      if (!saved) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบไฟล์นี้หรือโปรเจกต์ไม่ตรงกัน" });
      return saved;
    }),
  }),
  orders: router({
    generateSummary: adminProcedure.input(z.object({ rawText: z.string().max(20_000), customerName: z.string().max(180).optional(), product: z.string().max(500).optional(), cod: z.string().max(40).optional(), pageId: z.string().optional(), threadId: z.string().optional() })).mutation(async ({ ctx, input }) => {
      const startedAt = performance.now();
      const aliasesStartedAt = performance.now();
      const aliases = await listProductAliases(ctx.user.id);
      const aliasesMs = performance.now() - aliasesStartedAt;
      let mappedProduct = input.product;
      if (!mappedProduct && input.pageId && input.threadId) {
        const ordersStartedAt = performance.now();
        const order = (await fetchOrdersForThread(input.pageId, input.threadId))[0];
        const ordersMs = performance.now() - ordersStartedAt;
        const item = order?.items[0];
        mappedProduct = item?.label_display ?? item?.telegram_final_mapped ?? order?.label_display ?? undefined;
        console.info(`[NIGHTOPS] order-summary data lookup ${Math.round(ordersMs)}ms (aliases ${Math.round(aliasesMs)}ms)`);
      }
      const parseStartedAt = performance.now();
      const summary = generateOrderSummary({ ...input, product: mappedProduct, productAliases: aliases });
      const parseMs = performance.now() - parseStartedAt;
      const catalog = await fetchLiveProductMappings();
      const productMatch = catalog.find(item => `${item.label} ${item.sku} ${item.aliases ?? ""}`.toLowerCase().includes(summary.product.toLowerCase().replace(/\s+\d+(?:\.\d+)?\s*คอต.*$/i, "").trim()));
      const unitPrice = productMatch?.price ?? null;
      const auditStartedAt = performance.now();
      const preAuditMs = performance.now() - startedAt;
      const auditMs = performance.now() - auditStartedAt;
      const total = performance.now() - startedAt;
      await createAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name, action: "order_summary_created", entityType: "order_draft", entityId: summary.orderNumber, pageId: input.pageId, threadId: input.threadId, metadata: { hasCustomer: summary.customerName !== "ไม่ระบุชื่อ", hasPhone: Boolean(summary.phone), hasAddress: Boolean(summary.address), hasProduct: summary.product !== "ไม่ระบุสินค้า", hasCod: summary.cod !== "ไม่ระบุ", timingMs: { total: Math.round(total), parse: Math.round(parseMs), dataLookup: Math.round(Math.max(preAuditMs - parseMs, 0)), audit: Math.round(auditMs) } } });
      console.info(`[NIGHTOPS] order-summary total ${Math.round(total)}ms (pre-audit ${Math.round(preAuditMs)}ms, parse ${Math.round(parseMs)}ms, audit ${Math.round(auditMs)}ms)`);
      return { ...summary, unitPrice, copyText: unitPrice == null ? summary.copyText : `${summary.copyText}\nราคากลาง ${unitPrice.toLocaleString("th-TH")} บาท`, timingMs: { total: Math.round(total), parse: Math.round(parseMs), dataLookup: Math.round(Math.max(preAuditMs - parseMs, 0)), audit: Math.round(auditMs) } };
    }),
    summaryTimings: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional()).query(async ({ input }) => {
      const rows = await listAuditLogs(input?.limit ?? 20, "order_summary_created");
      return rows.map(row => ({ id: row.id, orderNumber: row.entityId, pageId: row.pageId, threadId: row.threadId, createdAt: row.createdAt, metadata: row.metadataJson ? JSON.parse(row.metadataJson) : {} }));
    }),
    live: protectedProcedure.input(z.object({ search: z.string().optional() }).optional()).query(async ({ input }) => {
      const orders = await fetchLiveOrders(input?.search);
      return { orders, stats: getLiveOrderStats(orders), source: ["bb_orders"] as const, fetchedAt: new Date().toISOString() };
    }),
    liveDetail: protectedProcedure.input(z.object({ orderNumber: z.string().trim().min(1) })).query(({ input }) => fetchLiveOrder(input.orderNumber)),
    forThread: protectedProcedure.input(z.object({ pageId: z.string().min(1), threadId: z.string().min(1) })).query(({ input }) => fetchOrdersForThread(input.pageId, input.threadId)),
    chatEvidence: protectedProcedure.input(z.object({ pageId: z.string().min(1), threadId: z.string().min(1) })).query(({ input }) => fetchConversationEvidence(input.pageId, input.threadId)),
    dailyChatSummary: protectedProcedure.input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).query(({ input }) => fetchDailyChatOrderSummary(input.date)),
    confirmations: adminProcedure.query(async () => (await listAuditLogs(500, "chat_order_confirmed")).map(row => ({ id: row.id, pageId: row.pageId, threadId: row.threadId, createdAt: row.createdAt, metadata: row.metadataJson ? JSON.parse(row.metadataJson) : {} }))),
    confirmFromChat: adminProcedure.input(z.object({ pageId: z.string().min(1), threadId: z.string().min(1), customerName: z.string().max(180).optional(), customerId: z.string().max(180).optional(), evidenceText: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => { const entityId = `${input.pageId}:${input.threadId}`; await createAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name, action: "chat_order_confirmed", entityType: "chat_order_confirmation", entityId, pageId: input.pageId, threadId: input.threadId, metadata: { status: "confirmed", customerName: input.customerName ?? null, customerId: input.customerId ?? null, evidenceText: input.evidenceText ?? null, confirmedAt: new Date().toISOString() } }); return { ok: true, entityId, status: "confirmed" as const }; }),
    threads: protectedProcedure.input(z.object({ search: z.string().optional() }).optional()).query(({ input }) => fetchLiveThreads(input?.search)),
  }),
  productAliases: router({
    list: adminProcedure.query(({ ctx }) => listProductAliases(ctx.user.id)),
    catalog: adminProcedure.query(() => fetchLiveProductMappings()),
    create: adminProcedure.input(z.object({ alias: z.string().trim().min(1).max(180), canonicalSku: z.string().trim().min(1).max(120), canonicalLabel: z.string().trim().min(1).max(255) })).mutation(async ({ ctx, input }) => { const aliases = await createProductAlias(ctx.user.id, input); const sync = await syncProductAliasToMaster(input); return { aliases, sync }; }),
    update: adminProcedure.input(z.object({ id: z.number().int().positive(), alias: z.string().trim().min(1).max(180), canonicalSku: z.string().trim().min(1).max(120), canonicalLabel: z.string().trim().min(1).max(255), isActive: z.boolean() })).mutation(async ({ ctx, input }) => { const aliases = await updateProductAlias(ctx.user.id, input.id, input); const sync = input.isActive ? await syncProductAliasToMaster(input) : { synced: false, sku: input.canonicalSku, aliasCount: 0 }; return { aliases, sync }; }),
  }),
  stock: router({
    products: protectedProcedure.query(() => fetchStockProducts()),
    warnings: protectedProcedure.query(() => fetchStockWarnings()),
    mappingSummary: protectedProcedure.query(async () => {
      const [products, warnings] = await Promise.all([fetchStockProducts(), fetchStockWarnings()]);
      const mapped = products.filter(item => Boolean(item.aliases?.trim()));
      return { total: products.length, mapped: mapped.length, missingAlias: products.length - mapped.length, duplicateSku: warnings.filter(item => item.kind === "duplicate_sku").length, missingSku: warnings.filter(item => item.kind === "missing_sku").length, products, warnings, checkedAt: new Date().toISOString() };
    }),
    update: adminProcedure.input(z.object({ id: z.number().int().positive(), stockQty: z.number().min(0).optional(), stockStatus: z.string().trim().max(80).optional(), labelDisplay: z.string().trim().max(255).optional(), unitPrice: z.number().min(0).optional() })).mutation(({ input }) => updateStockProduct(input.id, input)),
    updateAlias: adminProcedure.input(z.object({ sku: z.string().trim().min(1).max(120), alias: z.string().trim().max(2000) })).mutation(({ input }) => updateProductMapAlias(input.sku, input.alias)),
  }),
  chat: router({
    messages: protectedProcedure.input(z.object({ pageId: z.string().min(1), threadId: z.string().min(1) })).query(async ({ input }) => {
      const [local, external] = await Promise.all([listChatMessages(input.pageId, input.threadId), fetchExternalChatMessages(input.pageId, input.threadId)]);
      return [...local, ...external].sort((a, b) => {
        const aTime = a.occurredAt instanceof Date ? a.occurredAt.getTime() : Date.parse(String(a.occurredAt ?? ""));
        const bTime = b.occurredAt instanceof Date ? b.occurredAt.getTime() : Date.parse(String(b.occurredAt ?? ""));
        return bTime - aTime;
      });
    }),
    sendReply: adminProcedure.input(z.object({ pageId: z.string().min(1), threadId: z.string().min(1), recipientId: z.string().min(1), text: z.string().max(4_000).optional(), imageUrl: z.string().url().optional(), stickerId: z.string().max(255).optional() })).mutation(async ({ ctx, input }) => {
      try {
        const result = await sendMetaMessage(input);
        await saveChatMessage({ providerMessageId: result.message_id, pageId: input.pageId, threadId: input.threadId, senderId: input.pageId, senderType: "admin", direction: "outbound", text: input.text, attachments: input.imageUrl ? [{ type: "image", url: input.imageUrl }] : input.stickerId ? [{ type: "sticker", stickerId: input.stickerId }] : undefined, adminUserId: ctx.user.id });
        await createAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name, action: "message_sent", entityType: "chat_message", entityId: result.message_id, pageId: input.pageId, threadId: input.threadId, metadata: { hasText: Boolean(input.text), hasImage: Boolean(input.imageUrl), hasSticker: Boolean(input.stickerId), deliveryStatus: "sent" } });
        return { ok: true, status: "sent" as const, messageId: result.message_id };
      } catch (error) {
        const errorText = String(error instanceof Error ? error.message : error);
        const trace = errorText.match(/trace=([^,)]+)/i)?.[1] ?? null;
        const code = errorText.match(/code=(-?\d+)/i)?.[1] ?? null;
        const subcode = errorText.match(/subcode=(-?\d+)/i)?.[1] ?? null;
        const safePayload = { recipient: { id: input.recipientId }, messaging_type: "RESPONSE", message: input.text?.trim() ? { text: input.text.trim() } : input.imageUrl ? { attachment: { type: "image", payload: { url: input.imageUrl, is_reusable: false } } } : input.stickerId ? { sticker_id: input.stickerId } : {} };
        await createAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name, action: "meta_send_error", entityType: "meta_message", pageId: input.pageId, threadId: input.threadId, metadata: { httpStatus: null, metaCode: code ? Number(code) : null, metaSubcode: subcode ? Number(subcode) : null, fbtraceId: trace, payload: safePayload, error: errorText.slice(0, 1000) } });
        await createAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name, action: "message_send_failed", entityType: "chat_message", pageId: input.pageId, threadId: input.threadId, metadata: { hasText: Boolean(input.text), hasImage: Boolean(input.imageUrl), hasSticker: Boolean(input.stickerId), deliveryStatus: "failed", error: errorText.slice(0, 500) } });
        throw error;
      }
    }),
    simulateSend: adminProcedure.input(z.object({ pageId: z.string().min(1), threadId: z.string().min(1), recipientId: z.string().min(1), kind: z.enum(["text", "image"]), text: z.string().max(4_000).optional(), imageUrl: z.string().url().optional() })).mutation(({ input }) => {
      const message = input.kind === "text" ? { text: input.text?.trim() || "ข้อความทดสอบ NIGHTOPS" } : { attachment: { type: "image", payload: { url: input.imageUrl || "https://example.com/test-image.jpg", is_reusable: false } } };
      return { dryRun: true, payload: { recipient: { id: input.recipientId }, messaging_type: "RESPONSE", message }, note: "จำลอง Payload เท่านั้น ยังไม่ได้เรียก Meta API และไม่มีข้อความถูกส่ง" };
    }),
    uploadImage: adminProcedure.input(z.object({ fileName: z.string().min(1).max(512), contentType: z.string().regex(/^image\/(jpeg|png|gif|webp)$/i), base64: z.string().min(1).max(8_000_000) })).mutation(async ({ ctx, input }) => {
      const bytes = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
      if (bytes.length > 6_000_000) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "รูปภาพต้องมีขนาดไม่เกิน 6 MB" });
      const cleanedName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const extension = cleanedName.includes(".") ? cleanedName.slice(cleanedName.lastIndexOf(".")).slice(0, 12) : ".img";
      const stem = cleanedName.replace(/\.[^.]*$/, "").slice(0, 160) || "image";
      const uploaded = await storagePut(`chat-uploads/${ctx.user.id}/${stem}${extension}`, bytes, input.contentType);
      return uploaded;
    }),
    deliveryHealth: adminProcedure.query(async () => {
      const logs = await listAuditLogs(200);
      const failed = logs.filter(log => log.action === "message_send_failed");
      const sent = logs.filter(log => log.action === "message_sent");
      return { failed, sent, checkedAt: new Date().toISOString() };
    }),
    metaErrors: adminProcedure.query(async () => (await listAuditLogs(200, "meta_send_error")).map(log => ({ id: log.id, pageId: log.pageId, threadId: log.threadId, createdAt: log.createdAt, metadata: log.metadataJson ? JSON.parse(log.metadataJson) : {} }))),
    audit: adminProcedure.query(() => listAuditLogs()),
  }),
});

export type AppRouter = typeof appRouter;
