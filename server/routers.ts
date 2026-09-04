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
import { fetchExternalChatMessages, fetchLiveOrder, fetchLiveOrders, fetchLiveProductMappings, fetchLiveThreads, getLiveOrderStats, syncProductAliasToMaster } from "./supabase";
import { generateOrderSummary } from "./order-summary";
import { verifyVaultAccessCode } from "./vault-access";
import { sendMetaMessage } from "./meta";

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
      const aliases = await listProductAliases(ctx.user.id);
      let mappedProduct = input.product;
      if (!mappedProduct && input.pageId && input.threadId) {
        const thread = (await fetchLiveThreads()).find(item => item.pageId === input.pageId && item.threadId === input.threadId);
        const order = thread?.orders[0];
        const item = order?.items[0];
        mappedProduct = item?.label_display ?? item?.telegram_final_mapped ?? order?.label_display ?? undefined;
      }
      const summary = generateOrderSummary({ ...input, product: mappedProduct, productAliases: aliases });
      await createAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name, action: "order_summary_created", entityType: "order_draft", entityId: summary.orderNumber, metadata: { hasCustomer: summary.customerName !== "ไม่ระบุชื่อ", hasPhone: Boolean(summary.phone), hasAddress: Boolean(summary.address), hasProduct: summary.product !== "ไม่ระบุสินค้า", hasCod: summary.cod !== "ไม่ระบุ" } });
      return summary;
    }),
    live: protectedProcedure.input(z.object({ search: z.string().optional() }).optional()).query(async ({ input }) => {
      const orders = await fetchLiveOrders(input?.search);
      return { orders, stats: getLiveOrderStats(orders), source: ["bb_order", "bb_order_items_fix"] as const, fetchedAt: new Date().toISOString() };
    }),
    liveDetail: protectedProcedure.input(z.object({ orderNumber: z.string().trim().min(1) })).query(({ input }) => fetchLiveOrder(input.orderNumber)),
    threads: protectedProcedure.input(z.object({ search: z.string().optional() }).optional()).query(({ input }) => fetchLiveThreads(input?.search)),
  }),
  productAliases: router({
    list: adminProcedure.query(({ ctx }) => listProductAliases(ctx.user.id)),
    catalog: adminProcedure.query(() => fetchLiveProductMappings()),
    create: adminProcedure.input(z.object({ alias: z.string().trim().min(1).max(180), canonicalSku: z.string().trim().min(1).max(120), canonicalLabel: z.string().trim().min(1).max(255) })).mutation(async ({ ctx, input }) => { const aliases = await createProductAlias(ctx.user.id, input); const sync = await syncProductAliasToMaster(input); return { aliases, sync }; }),
    update: adminProcedure.input(z.object({ id: z.number().int().positive(), alias: z.string().trim().min(1).max(180), canonicalSku: z.string().trim().min(1).max(120), canonicalLabel: z.string().trim().min(1).max(255), isActive: z.boolean() })).mutation(async ({ ctx, input }) => { const aliases = await updateProductAlias(ctx.user.id, input.id, input); const sync = input.isActive ? await syncProductAliasToMaster(input) : { synced: false, sku: input.canonicalSku, aliasCount: 0 }; return { aliases, sync }; }),
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
    sendReply: adminProcedure.input(z.object({ pageId: z.string().min(1), threadId: z.string().min(1), recipientId: z.string().min(1), text: z.string().max(4_000).optional(), imageUrl: z.string().url().optional() })).mutation(async ({ ctx, input }) => {
      const result = await sendMetaMessage(input);
      await saveChatMessage({ providerMessageId: result.message_id, pageId: input.pageId, threadId: input.threadId, senderId: input.pageId, senderType: "admin", direction: "outbound", text: input.text, attachments: input.imageUrl ? [{ type: "image", url: input.imageUrl }] : undefined, adminUserId: ctx.user.id });
      await createAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name, action: "message_sent", entityType: "chat_message", entityId: result.message_id, pageId: input.pageId, threadId: input.threadId, metadata: { hasText: Boolean(input.text), hasImage: Boolean(input.imageUrl) } });
      return { ok: true, messageId: result.message_id };
    }),
    audit: adminProcedure.query(() => listAuditLogs()),
  }),
});

export type AppRouter = typeof appRouter;
