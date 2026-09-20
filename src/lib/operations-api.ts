import { z } from "zod";
import { HttpError } from "@/lib/http";

export function assertStableAssetUrl(publicUrl: string, contentId: string, revision: number, candidate: string, slideNumber: number, env: Record<string, string | undefined> = process.env) {
  const configured = env.ASSET_PUBLIC_BASE_URL;
  if (!configured) throw new HttpError(500, "ASSET_PUBLIC_BASE_URL is required for permanent asset storage");
  const base = new URL(configured);
  if (base.protocol !== "https:") throw new HttpError(500, "ASSET_PUBLIC_BASE_URL must use HTTPS");
  const asset = new URL(publicUrl);
  if (asset.origin !== base.origin) throw new HttpError(400, "publicUrl must use the ASSET_PUBLIC_BASE_URL origin");
  if (asset.username || asset.password || asset.search || asset.hash) throw new HttpError(400, "publicUrl must be a deterministic permanent asset URL");
  const baseParts = base.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const parts = asset.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const expected = [...baseParts, contentId, String(revision), candidate];
  if (parts.length !== expected.length + 1 || expected.some((part, index) => parts[index] !== part) || !new RegExp(`^${slideNumber}\\.[a-z0-9]+$`, "i").test(parts.at(-1) || "")) {
    throw new HttpError(400, "publicUrl must use deterministic /Content_ID/revision/candidate/slide.ext storage path");
  }
}

export const artifactSchema = z.object({
  socialAccountId: z.uuid(),
  caption: z.string().trim().min(1).max(10000),
  finalBrief: z.string().trim().min(1).max(20000),
  qaStatus: z.enum(["passed", "failed"]),
  qaResult: z.string().trim().min(1).max(191),
  qaNotes: z.string().trim().max(10000).optional(),
  revision: z.number().int().min(1),
  candidate: z.string().trim().min(1).max(100),
  assets: z.array(z.object({
    slideNumber: z.number().int().min(1).max(100),
    localPath: z.string().trim().min(1).max(4096).optional(),
    publicUrl: z.url().optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mimeType: z.string().trim().regex(/^(image|video)\/[a-z0-9.+-]+$/i).max(100),
    role: z.string().trim().min(1).max(50),
    final: z.boolean().default(true),
  }).refine((asset) => Boolean(asset.localPath || asset.publicUrl), { message: "localPath or publicUrl is required" })).min(1).max(100),
}).strict()
  .refine((body) => new Set(body.assets.map((asset) => asset.slideNumber)).size === body.assets.length, { message: "slideNumber values must be unique", path: ["assets"] })
  .refine((body) => body.qaStatus !== "passed" || body.assets.every((asset) => Boolean(asset.publicUrl)), { message: "publicUrl is required for every QA-passed asset", path: ["assets"] });

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
