import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { APPROVAL_COMMAND, parsePublishWindow, type PublishWindow } from "@/lib/operations";
import { approvedAssetIdentity, assertApprovedAssetIdentity, preflightAssets } from "@/lib/publisher-recovery";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type AutomationDb = Pick<PrismaClient, "contentPlanItem" | "contentPost" | "postMetric" | "$transaction">;

export const AUTO_APPROVAL_ENV = "AUTO_APPROVAL";
export const AUTO_SCHEDULE_ENV = "AUTO_SCHEDULE";
export const AUTO_PUBLISH_ENV = "AUTO_PUBLISH";

export function enabled(value: string | undefined) { return value === "true" || value === "1" || value === "yes"; }
export function automationSwitches(env: Record<string, string | undefined> = process.env) {
  return { autoApproval: enabled(env[AUTO_APPROVAL_ENV]), autoSchedule: enabled(env[AUTO_SCHEDULE_ENV]), autoPublish: enabled(env[AUTO_PUBLISH_ENV]) };
}

type Comparable = { publishedAt: Date; engagementRate: number };
type PlanLike = { id?: string; contentId: string; date: Date; day: string; testPublishWindow: string; pillar: string; format: string; topicTag: string; contentPostId?: string | null };

function clampMinute(minute: number, window: PublishWindow) {
  const start = window.start.getTime();
  const end = window.end.getTime();
  return new Date(Math.min(end, Math.max(start, start + minute * 60_000)));
}

export function recommendScheduledAt(plan: PlanLike, comparable: Comparable[]) {
  const window = parsePublishWindow(plan.testPublishWindow, plan.date);
  const minutes = Math.max(0, Math.floor((window.end.getTime() - window.start.getTime()) / 60_000));
  if (comparable.length >= 10) {
    const weighted = comparable.reduce((sum, row) => {
      const minutesInDay = ((row.publishedAt.getUTCHours() + 7) % 24) * 60 + row.publishedAt.getUTCMinutes();
      return sum + minutesInDay * row.engagementRate;
    }, 0) / Math.max(1, comparable.reduce((sum, row) => sum + row.engagementRate, 0));
    const startMinutes = ((window.start.getUTCHours() + 7) % 24) * 60 + window.start.getUTCMinutes();
    return {
      scheduledAt: clampMinute(Math.round(weighted - startMinutes), window),
      reason: `Dipilih dari ${comparable.length} sample Meta H+24 sejenis; prioritas menit dengan engagement_rate historis terbaik dalam pagar ${plan.testPublishWindow}.`,
      dataMode: "live_meta" as const,
      confidence: comparable.length >= 20 ? "high" as const : "medium" as const,
      sampleCount: comparable.length,
    };
  }
  const seed = [...plan.contentId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const scheduledAt = clampMinute(minutes ? seed % (minutes + 1) : 0, window);
  return {
    scheduledAt,
    reason: `Exploration terukur: sample Meta H+24 belum cukup (${comparable.length}/10), menit dibagi deterministik dalam pagar ${plan.testPublishWindow}.`,
    dataMode: "exploration" as const,
    confidence: "low" as const,
    sampleCount: comparable.length,
  };
}

async function comparableSamples(plan: PlanLike, tx: Tx) {
  if (!plan.contentPostId) return [];
  const current = await tx.contentPost.findUnique({ where: { id: plan.contentPostId }, select: { socialAccountId: true, contentPillar: true, contentType: true, topic: true } });
  if (!current) return [];
  const rows = await tx.postMetric.findMany({
    where: { source: "meta", snapshotWindow: "h24", contentPost: { socialAccountId: current.socialAccountId, contentPillar: current.contentPillar, contentType: current.contentType, OR: [{ topic: current.topic }, { contentPlan: { pillar: plan.pillar } }, { contentPlan: { topicTag: plan.topicTag } }] } },
    select: { engagementRate: true, contentPost: { select: { publishedAt: true } } },
    take: 50,
  });
  return rows.flatMap((row) => row.contentPost.publishedAt ? [{ publishedAt: row.contentPost.publishedAt, engagementRate: Number(row.engagementRate) }] : []);
}

export async function autoApproveAndSchedule(contentId: string, client: AutomationDb = db, env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch) {
  const switches = automationSwitches(env);
  const snapshot = await client.contentPlanItem.findUnique({ where: { contentId }, include: { assets: { orderBy: { slideNumber: "asc" } }, contentPost: true } });
  if (!snapshot) throw new HttpError(404, "Content plan item not found");
  const gatesOk = snapshot.status === "ready_for_review" && snapshot.qaStatus === "passed" && snapshot.contentPostId && snapshot.finalCaption && snapshot.assets.length > 0 && snapshot.assets.every((asset) => asset.isFinal && asset.publicUrl) && snapshot.contentPost?.socialAccountId;
  if (!gatesOk) return { item: snapshot, autoApproved: false, autoScheduled: false, reason: "Auto workflow skipped: QA, caption, final asset, or target account gate incomplete." };
  const identities = new Set(snapshot.assets.map((asset) => `${asset.revision}:${asset.candidate}`));
  if (identities.size !== 1 || snapshot.assets.some((asset) => asset.revision !== snapshot.assetRevision)) throw new HttpError(409, "Auto approval requires one explicit artifact revision and candidate");
  const candidate = snapshot.assets[0].candidate;
  const assets = snapshot.assets.map((asset) => ({ slideNumber: asset.slideNumber, publicUrl: asset.publicUrl!, mimeType: asset.mimeType, sha256: asset.sha256 }));
  const approvedAssetSetHash = approvedAssetIdentity(snapshot.contentId, snapshot.assetRevision, candidate, assets);
  await preflightAssets(assets, fetcher);

  return client.$transaction(async (tx) => {
    let current = await tx.contentPlanItem.findUnique({ where: { contentId }, include: { assets: { orderBy: { slideNumber: "asc" } }, contentPost: true } });
    if (!current) throw new HttpError(404, "Content plan item not found");
    const currentAssets = current.assets.map((asset) => ({ slideNumber: asset.slideNumber, publicUrl: asset.publicUrl ?? "", mimeType: asset.mimeType, sha256: asset.sha256 }));
    assertApprovedAssetIdentity(approvedAssetSetHash, current.contentId, current.assetRevision, candidate, currentAssets);
    let autoApproved = false;
    if (switches.autoApproval && current.status === "ready_for_review") {
      const updated = await tx.contentPlanItem.updateMany({ where: { id: current.id, status: "ready_for_review", approvalVersion: snapshot.approvalVersion, assetRevision: snapshot.assetRevision }, data: { status: "approved", approvedAt: new Date(), approvalCommand: APPROVAL_COMMAND, approvalReference: `auto:${current.contentId}`, approvalAttemptId: randomUUID(), approvalVersion: { increment: 1 }, approvalStatus: "auto_approved", publisherState: "ready", publisherError: null, autoApprovalStatus: "auto_approved", approvedAssetSetHash, approvedCandidate: candidate } });
      if (updated.count !== 1) throw new HttpError(409, "Content approval changed concurrently; retry with fresh data");
      current = await tx.contentPlanItem.findUniqueOrThrow({ where: { id: current.id }, include: { assets: { orderBy: { slideNumber: "asc" } }, contentPost: true } });
      autoApproved = true;
    }
    if (!switches.autoSchedule || current.status !== "approved" || !current.approvedAt || !current.approvalAttemptId) return { item: current, autoApproved, autoScheduled: false, reason: switches.autoSchedule ? "Auto schedule skipped: item is not approved." : "AUTO_SCHEDULE is off." };
    const approvedAssets = current.assets.map((asset) => ({ slideNumber: asset.slideNumber, publicUrl: asset.publicUrl ?? "", mimeType: asset.mimeType, sha256: asset.sha256 }));
    assertApprovedAssetIdentity(current.approvedAssetSetHash, current.contentId, current.assetRevision, current.approvedCandidate ?? "", approvedAssets);
    const recommendation = recommendScheduledAt(current, await comparableSamples(current, tx));
    const updated = await tx.contentPlanItem.updateMany({ where: { id: current.id, status: "approved", approvalAttemptId: current.approvalAttemptId, approvalVersion: current.approvalVersion }, data: { status: "scheduled", scheduledAt: recommendation.scheduledAt, publishStatus: "scheduled", publisherState: "scheduled", scheduleReason: recommendation.reason, scheduleDataMode: recommendation.dataMode, scheduleConfidence: recommendation.confidence, scheduleSampleCount: recommendation.sampleCount } });
    if (updated.count !== 1) throw new HttpError(409, "Content schedule changed concurrently; retry with fresh data");
    await tx.contentPost.update({ where: { id: current.contentPostId! }, data: { status: "scheduled", scheduledAt: recommendation.scheduledAt } });
    return { item: await tx.contentPlanItem.findUniqueOrThrow({ where: { id: current.id }, include: { assets: { orderBy: { slideNumber: "asc" } }, contentPost: true } }), autoApproved, autoScheduled: true, recommendation };
  });
}

export async function claimPublishLease(contentId: string, client: AutomationDb = db, now = new Date()) {
  const leaseId = randomUUID();
  const leaseUntil = new Date(now.getTime() + 4 * 60_000);
  const item = await client.contentPlanItem.findUnique({ where: { contentId }, include: { assets: { where: { isFinal: true }, orderBy: { slideNumber: "asc" } }, contentPost: { include: { socialAccount: true } } } });
  if (!item || !item.contentPost || !item.approvalAttemptId) throw new HttpError(404, "Publishable content plan item not found");
  if (item.status !== "scheduled" || !item.scheduledAt || item.scheduledAt > now) throw new HttpError(409, "Content is not due for publishing");
  if (item.qaStatus !== "passed" || !item.finalCaption || !item.assets.length || item.assets.some((asset) => !asset.publicUrl)) throw new HttpError(409, "Publishing requires passed QA, caption, target account, and public URLs for all final assets");
  const updated = await client.contentPlanItem.updateMany({ where: { id: item.id, status: "scheduled", publisherState: "scheduled", approvalAttemptId: item.approvalAttemptId, OR: [{ publisherLeaseUntil: null }, { publisherLeaseUntil: { lt: now } }] }, data: { publisherState: "publishing", publisherLeaseId: leaseId, publisherLeaseUntil: leaseUntil, publisherError: null } });
  if (updated.count !== 1) throw new HttpError(409, "Publish job already claimed");
  return { ...(await client.contentPlanItem.findUniqueOrThrow({ where: { id: item.id }, include: { assets: { where: { isFinal: true }, orderBy: { slideNumber: "asc" } }, contentPost: { include: { socialAccount: true } } } })), leaseId };
}
