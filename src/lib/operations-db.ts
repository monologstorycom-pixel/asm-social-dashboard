import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "./db";
import { HttpError } from "./http";
import { MetaInsightsClient } from "./meta";
import type { PublishResult } from "./operations-api";
import {
  analyticsSourceFilters,
  buildReconciliationReport,
  computeEarlyVelocity,
  publishingRecommendation,
  resolveDataMode,
  syncMetricWindows,
  META_WINDOWS,
  type DataMode,
} from "./operations";

export type OperationsDb = Pick<PrismaClient, "contentPost" | "postMetric" | "contentPlanItem" | "contentPlanAsset" | "$transaction">;

export async function recordPublishResult(contentId: string, body: PublishResult, client: OperationsDb = db) {
  return client.$transaction(async (tx) => {
    const plan = await tx.contentPlanItem.findUnique({ where: { contentId }, include: { contentPost: true, assets: true } });
    if (!plan) throw new HttpError(404, "Content plan item not found");
    if (plan.approvalAttemptId !== body.approvalAttemptId) throw new HttpError(409, "Publish result does not match the approved attempt");
    if (!body.success) {
      if (plan.status === "published" || plan.status === "measuring") throw new HttpError(409, "Published result cannot be replaced by failure");
      return tx.contentPlanItem.update({ where: { id: plan.id }, data: { publishStatus: "failed", publisherState: "failed", publisherError: body.error } });
    }
    if (plan.contentPost?.instagramMediaId) {
      if (plan.contentPost.instagramMediaId !== body.instagramMediaId) throw new HttpError(409, "A different publication is already recorded");
      return plan;
    }
    if (plan.status !== "scheduled" || !plan.approvedAt || !plan.scheduledAt || !plan.contentPostId) throw new HttpError(409, "Publish success requires a scheduled approved plan with a linked post");
    const publishedAt = new Date(body.publishedAt);
    if (publishedAt < plan.scheduledAt) throw new HttpError(409, "publishedAt cannot precede scheduledAt");
    await tx.contentPost.update({ where: { id: plan.contentPostId }, data: {
      status: "published", source: "live", instagramMediaId: body.instagramMediaId, permalink: body.permalink, publicUrl: body.publicUrl ?? body.permalink, publishedAt,
    } });
    for (const asset of body.assetPublicUrls ?? []) await tx.contentPlanAsset.updateMany({
      where: { contentPlanId: plan.id, slideNumber: asset.slideNumber }, data: { publicUrl: asset.publicUrl },
    });
    return tx.contentPlanItem.update({
      where: { id: plan.id },
      data: { status: "published", publishedAt, publishStatus: "published", publisherState: "published", publisherError: null },
      include: { contentPost: true, assets: { orderBy: { slideNumber: "asc" } } },
    });
  });
}

export async function resolveAnalyticsMode(requested: DataMode, accountId?: string, client: OperationsDb = db) {
  const hasLiveMeta = requested === "auto" && await client.postMetric.count({
    where: { source: "meta", ...(accountId && { contentPost: { socialAccountId: accountId } }) },
  }) > 0;
  return resolveDataMode(requested, hasLiveMeta);
}

export function analyticsWhere(dataMode: Exclude<DataMode, "auto">) {
  const { postSource, metricSources } = analyticsSourceFilters(dataMode);
  return {
    post: postSource ? { source: postSource } : {},
    metric: metricSources ? { source: { in: metricSources } } : {},
  } as const;
}

export async function syncPublishedPlan(contentId: string, now = new Date(), client: OperationsDb = db, meta = new MetaInsightsClient()) {
  const plan = await client.contentPlanItem.findUnique({
    where: { contentId },
    include: { contentPost: { include: { metrics: { where: { source: "meta" }, orderBy: { capturedAt: "asc" } } } } },
  });
  if (!plan) throw new HttpError(404, "Content plan item not found");
  const post = plan.contentPost;
  if (!post?.publishedAt || !post.instagramMediaId || !(["published", "measuring"] as string[]).includes(plan.status)) {
    throw new HttpError(409, "Meta sync requires a published plan linked to an Instagram media ID");
  }
  const completed = new Set(post.metrics.map((metric) => metric.snapshotWindow).filter(Boolean) as string[]);
  return syncMetricWindows({
    post: { id: post.id, publishedAt: post.publishedAt, instagramMediaId: post.instagramMediaId },
    now,
    completed,
    fetchMetrics: (mediaId) => meta.getMediaMetrics(mediaId),
    storeSnapshot: async (window, metrics, capturedAt) => {
      const previous = post.metrics.at(-1);
      const uniqueCapturedAt = new Date(capturedAt.getTime() + META_WINDOWS.indexOf(window));
      try {
        await client.$transaction(async (tx) => {
          await tx.postMetric.create({ data: {
            contentPostId: post.id,
            capturedAt: uniqueCapturedAt,
            source: "meta",
            snapshotWindow: window,
            earlyEngagementVelocity: previous ? computeEarlyVelocity(metrics.engagementTotal, uniqueCapturedAt, previous.engagementTotal, previous.capturedAt) : null,
            ...metrics,
          } });
          await tx.contentPlanItem.updateMany({ where: { id: plan.id, status: "published" }, data: { status: "measuring" } });
        });
        return true;
      } catch (error) {
        if (typeof error === "object" && error && "code" in error && error.code === "P2002") return false;
        throw error;
      }
    },
    markMeasuring: async () => undefined,
  });
}

export async function syncAllDue(now = new Date(), client: OperationsDb = db, meta = new MetaInsightsClient()) {
  const plans = await client.contentPlanItem.findMany({
    where: { status: { in: ["published", "measuring"] }, contentPost: { is: { source: "live", instagramMediaId: { not: null }, publishedAt: { not: null } } } },
    select: { contentId: true },
    orderBy: { publishedAt: "asc" },
  });
  const results = [];
  for (const plan of plans) results.push({ Content_ID: plan.contentId, ...(await syncPublishedPlan(plan.contentId, now, client, meta)) });
  return results;
}

export async function getPublishingIntelligence(contentId: string, client: OperationsDb = db) {
  const plan = await client.contentPlanItem.findUnique({ where: { contentId }, include: { contentPost: true } });
  if (!plan) throw new HttpError(404, "Content plan item not found");
  if (!plan.contentPost) return publishingRecommendation({ testPublishWindow: plan.testPublishWindow, comparable: [] });
  const comparable = await client.postMetric.findMany({
    where: {
      source: "meta",
      contentPost: {
        source: "live",
        socialAccountId: plan.contentPost.socialAccountId,
        publishedAt: { not: null },
        contentPillar: plan.contentPost.contentPillar,
        contentType: plan.contentPost.contentType,
      },
    },
    distinct: ["contentPostId"],
    orderBy: { capturedAt: "desc" },
    select: { engagementRate: true, contentPost: { select: { publishedAt: true } } },
    take: 20,
  });
  const samples = comparable.flatMap((row) => row.contentPost.publishedAt ? [{ publishedAt: row.contentPost.publishedAt, engagementRate: Number(row.engagementRate) }] : []);
  return publishingRecommendation({ testPublishWindow: plan.testPublishWindow, comparable: samples });
}

export async function reconciliationReport(limit = 100, client: OperationsDb = db) {
  const plans = await client.contentPlanItem.findMany({ take: limit, orderBy: { updatedAt: "desc" } });
  return plans.map((plan) => ({ Content_ID: plan.contentId, ...buildReconciliationReport(plan) })).filter((row) => row.issues.length);
}

/** Applies only the explicit bounded fields returned by reconciliationReport; callers must require separate approval. */
export async function applyBoundedRepair(contentId: string, repairs: Array<{ field: "status" | "publisherState" | "publishStatus"; value: string }>, client: OperationsDb = db) {
  if (!repairs.length || repairs.length > 3) throw new HttpError(400, "A bounded repair requires one to three allowed fields");
  const data = Object.fromEntries(repairs.map(({ field, value }) => [field, value]));
  return client.contentPlanItem.update({ where: { contentId }, data });
}
