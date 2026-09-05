import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "./db";
import { HttpError } from "./http";
import { MetaInsightsClient } from "./meta";
import type { PublishResult } from "./operations-api";
import {
  analyticsSourceFilters,
  buildReconciliationReport,
  computeEarlyVelocity,
  mapMediaToAssets,
  mapMetaMediaToPost,
  publishingRecommendation,
  type MetaMedia,
  resolveDataMode,
  syncMetricWindows,
  META_WINDOWS,
  type DataMode,
} from "./operations";

export type OperationsDb = Pick<PrismaClient, "socialAccount" | "contentPost" | "postMetric" | "contentPlanItem" | "contentPlanAsset" | "$transaction">;

export async function recordPublishResult(contentId: string, body: PublishResult, client: OperationsDb = db) {
  return client.$transaction(async (tx) => {
    const plan = await tx.contentPlanItem.findUnique({ where: { contentId }, include: { contentPost: true, assets: true } });
    if (!plan) throw new HttpError(404, "Content plan item not found");
    if (plan.approvalAttemptId !== body.approvalAttemptId) throw new HttpError(409, "Publish result does not match the approved attempt");
    if (!body.success) {
      if (plan.status === "published" || plan.status === "measuring") throw new HttpError(409, "Published result cannot be replaced by failure");
      const updated = await tx.contentPlanItem.updateMany({
        where: { id: plan.id, approvalAttemptId: body.approvalAttemptId, status: { notIn: ["published", "measuring"] } },
        data: { publishStatus: "failed", publisherState: "failed", publisherError: body.error },
      });
      if (updated.count !== 1) throw new HttpError(409, "Publish state changed concurrently; retry with fresh data");
      return tx.contentPlanItem.findUniqueOrThrow({ where: { id: plan.id } });
    }
    if (plan.contentPost?.instagramMediaId) {
      if (plan.contentPost.instagramMediaId !== body.instagramMediaId) throw new HttpError(409, "A different publication is already recorded");
      return plan;
    }
    if (plan.status !== "scheduled" || !plan.approvedAt || !plan.scheduledAt || !plan.contentPostId) throw new HttpError(409, "Publish success requires a scheduled approved plan with a linked post");
    const publishedAt = new Date(body.publishedAt);
    if (publishedAt < plan.scheduledAt) throw new HttpError(409, "publishedAt cannot precede scheduledAt");
    const updated = await tx.contentPlanItem.updateMany({
      where: { id: plan.id, status: "scheduled", approvalAttemptId: body.approvalAttemptId, approvalVersion: plan.approvalVersion },
      data: { status: "published", publishedAt, publishStatus: "published", publisherState: "published", publisherError: null },
    });
    if (updated.count !== 1) throw new HttpError(409, "Publish state changed concurrently; retry with fresh data");
    await tx.contentPost.update({ where: { id: plan.contentPostId }, data: {
      status: "published", source: "live", instagramMediaId: body.instagramMediaId, permalink: body.permalink, publicUrl: body.publicUrl ?? body.permalink, publishedAt,
    } });
    for (const asset of body.assetPublicUrls ?? []) await tx.contentPlanAsset.updateMany({
      where: { contentPlanId: plan.id, slideNumber: asset.slideNumber }, data: { publicUrl: asset.publicUrl },
    });
    return tx.contentPlanItem.findUniqueOrThrow({
      where: { id: plan.id }, include: { contentPost: true, assets: { orderBy: { slideNumber: "asc" } } },
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

export async function importLiveMetaMedia(
  accountId = process.env.META_IG_USER_ID,
  capturedAt = new Date(),
  client: OperationsDb = db,
  meta = new MetaInsightsClient(),
) {
  if (!accountId) throw new HttpError(503, "META_IG_USER_ID is not configured");
  const [profile, media] = await Promise.all([meta.getAccountProfile(accountId), meta.listAccountMedia(accountId, 820)]);
  if (!profile.name?.trim() || !profile.username?.trim()) throw new HttpError(502, "Meta returned an invalid account profile");
  const detail = await Promise.all(media.map((item) => meta.getMediaDetail(item.id)));
  const samples: Array<{ item: MetaMedia; post: ReturnType<typeof mapMetaMediaToPost>; metrics: Awaited<ReturnType<MetaInsightsClient["getMediaMetrics"]>>; assets: ReturnType<typeof mapMediaToAssets> }> = [];
  for (const item of detail) {
    const assets = mapMediaToAssets("placeholder", item);
    samples.push({ item, post: mapMetaMediaToPost(item), metrics: await meta.getMediaMetrics(item.id), assets });
  }
  return client.$transaction(async (tx) => {
    const profileData = {
      accountName: profile.name.trim(), username: profile.username.trim(), profilePictureUrl: profile.profile_picture_url,
      followersCount: profile.followers_count, mediaCount: profile.media_count,
    };
    const account = await tx.socialAccount.upsert({
      where: { platform_platformAccountId: { platform: "instagram", platformAccountId: accountId } },
      create: { platform: "instagram", platformAccountId: accountId, ...profileData },
      update: { active: true, ...profileData },
    });
    let imported = 0;
    let snapshots = 0;
    let existingSnapshots = 0;
    let assets = 0;
    for (const [index, sample] of samples.entries()) {
      const existing = await tx.contentPost.findUnique({ where: { instagramMediaId: sample.item.id }, select: { id: true, source: true } });
      if (existing?.source === "demo") throw new HttpError(409, "A demo post already uses a real Meta media ID; import stopped without overwriting demo");
      const post = await tx.contentPost.upsert({
        where: { instagramMediaId: sample.item.id },
        create: { socialAccountId: account.id, ...sample.post },
        update: { socialAccountId: account.id, ...sample.post },
      });
      if (!existing) imported += 1;
      for (const asset of sample.assets) {
        const existingAsset = await tx.postAsset.findUnique({ where: { contentPostId_slideNumber: { contentPostId: post.id, slideNumber: asset.slideNumber } } });
        if (existingAsset) {
          if (existingAsset.assetUrl !== asset.assetUrl) await tx.postAsset.update({ where: { id: existingAsset.id }, data: { assetUrl: asset.assetUrl } });
        } else {
          await tx.postAsset.create({ data: { contentPostId: post.id, ...asset } });
        }
        assets += 1;
      }
      const prior = await tx.postMetric.findUnique({
        where: { contentPostId_source_snapshotWindow: { contentPostId: post.id, source: "meta", snapshotWindow: "ad_hoc" } },
        select: { id: true },
      });
      if (prior) {
        await tx.postMetric.deleteMany({ where: { id: prior.id } });
        await tx.postMetric.create({ data: {
          contentPostId: post.id, capturedAt: new Date(capturedAt.getTime() + index), source: "meta", snapshotWindow: "ad_hoc", ...sample.metrics,
        } });
        existingSnapshots += 1;
        continue;
      }
      await tx.postMetric.create({ data: {
        contentPostId: post.id, capturedAt: new Date(capturedAt.getTime() + index), source: "meta", snapshotWindow: "ad_hoc", ...sample.metrics,
      } });
      snapshots += 1;
    }
    return { media: media.length, imported, snapshots, existingSnapshots, assets, capturedAt: capturedAt.toISOString() };
  });
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
