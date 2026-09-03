import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createVaultFile,
  createVaultProject,
  getVaultFile,
  getVaultProject,
  getVaultStats,
  listVaultFiles,
  listVaultProjects,
  updateVaultFile,
} from "./db";
import { fetchLiveOrder, fetchLiveOrders, fetchLiveThreads, getLiveOrderStats } from "./supabase";
import { generateOrderSummary } from "./order-summary";

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
    projects: protectedProcedure.query(({ ctx }) => listVaultProjects(ctx.user.id)),
    project: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const project = await getVaultProject(ctx.user.id, input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบโปรเจกต์นี้" });
      return project;
    }),
    files: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), search: z.string().optional() })).query(async ({ ctx, input }) => {
      const project = await getVaultProject(ctx.user.id, input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบโปรเจกต์นี้" });
      return listVaultFiles(ctx.user.id, input.projectId, input.search);
    }),
    file: protectedProcedure.input(z.object({ fileId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const file = await getVaultFile(ctx.user.id, input.fileId);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบไฟล์นี้" });
      return file;
    }),
    stats: protectedProcedure.query(({ ctx }) => getVaultStats(ctx.user.id)),
    createProject: protectedProcedure.input(projectInput).mutation(({ ctx, input }) => createVaultProject(ctx.user.id, input)),
    createFile: protectedProcedure.input(fileInput).mutation(async ({ ctx, input }) => {
      const project = await getVaultProject(ctx.user.id, input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบโปรเจกต์นี้" });
      try {
        return await createVaultFile(ctx.user.id, input);
      } catch (error) {
        if (String(error).toLowerCase().includes("duplicate")) throw new TRPCError({ code: "CONFLICT", message: "มีไฟล์ path นี้อยู่แล้วในโปรเจกต์" });
        throw error;
      }
    }),
    updateFile: protectedProcedure.input(fileInput.extend({ fileId: z.number().int().positive(), isFavorite: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      const saved = await updateVaultFile(ctx.user.id, input.fileId, input);
      if (!saved) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบไฟล์นี้หรือโปรเจกต์ไม่ตรงกัน" });
      return saved;
    }),
  }),
  orders: router({
    generateSummary: protectedProcedure.input(z.object({ rawText: z.string().max(20_000), customerName: z.string().max(180).optional(), product: z.string().max(500).optional(), cod: z.string().max(40).optional() })).mutation(({ input }) => generateOrderSummary(input)),
    live: protectedProcedure.input(z.object({ search: z.string().optional() }).optional()).query(async ({ input }) => {
      const orders = await fetchLiveOrders(input?.search);
      return { orders, stats: getLiveOrderStats(orders), source: ["bb_order", "bb_order_items_fix"] as const, fetchedAt: new Date().toISOString() };
    }),
    liveDetail: protectedProcedure.input(z.object({ orderNumber: z.string().trim().min(1) })).query(({ input }) => fetchLiveOrder(input.orderNumber)),
    threads: protectedProcedure.input(z.object({ search: z.string().optional() }).optional()).query(({ input }) => fetchLiveThreads(input?.search)),
  }),
});

export type AppRouter = typeof appRouter;
