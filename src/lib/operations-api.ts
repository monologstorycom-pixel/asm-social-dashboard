import { z } from "zod";

export const artifactSchema = z.object({
  socialAccountId: z.uuid(),
  caption: z.string().trim().min(1).max(10000),
  finalBrief: z.string().trim().min(1).max(20000),
  qaStatus: z.enum(["passed", "failed"]),
  qaResult: z.string().trim().min(1).max(191),
  qaNotes: z.string().trim().max(10000).optional(),
  assets: z.array(z.object({
    slideNumber: z.number().int().min(1).max(100),
    localPath: z.string().trim().min(1).max(4096).optional(),
    publicUrl: z.url().optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mimeType: z.string().trim().regex(/^(image|video)\/[a-z0-9.+-]+$/i).max(100),
    role: z.string().trim().min(1).max(50),
    final: z.boolean().default(true),
  }).refine((asset) => Boolean(asset.localPath || asset.publicUrl), { message: "localPath or publicUrl is required" })).min(1).max(100),
}).strict().refine((body) => new Set(body.assets.map((asset) => asset.slideNumber)).size === body.assets.length, { message: "slideNumber values must be unique", path: ["assets"] });

export const approvalSchema = z.object({
  command: z.string(),
  reference: z.string().trim().min(1).max(191),
}).strict();

export const scheduleSchema = z.object({ scheduled_at: z.iso.datetime() }).strict();

export const publishResultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    approvalAttemptId: z.uuid(),
    instagramMediaId: z.string().trim().min(1).max(191),
    publishedAt: z.iso.datetime(),
    permalink: z.url().optional(),
    publicUrl: z.url().optional(),
    assetPublicUrls: z.array(z.object({ slideNumber: z.number().int().min(1), publicUrl: z.url() })).max(100).optional(),
  }).refine((body) => Boolean(body.permalink || body.publicUrl), { message: "permalink or publicUrl is required" }),
  z.object({ success: z.literal(false), approvalAttemptId: z.uuid(), error: z.string().trim().min(1).max(2000) }),
]);
export type PublishResult = z.infer<typeof publishResultSchema>;

export const dataModeSchema = z.enum(["auto", "demo", "live", "all"]).default("auto");
