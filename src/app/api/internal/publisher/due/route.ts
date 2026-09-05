import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, readJson, safeRoute } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";
import { MetaPublisherClient } from "@/lib/meta-publisher";
import { recordPublishResult } from "@/lib/operations-db";

const publishSchema = z.object({ Content_ID: z.string().trim().min(1).max(191) }).strict();

export async function GET(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const nowValue = new URL(request.url).searchParams.get("now");
    const now = nowValue ? new Date(nowValue) : new Date();
    if (Number.isNaN(now.getTime())) return Response.json({ error: "Invalid now datetime" }, { status: 400 });
    const plans = await db.contentPlanItem.findMany({
      where: { status: "scheduled", scheduledAt: { lte: now }, approvalAttemptId: { not: null } },
      include: { assets: { where: { isFinal: true }, orderBy: { slideNumber: "asc" } }, contentPost: { include: { socialAccount: true } } },
      orderBy: { scheduledAt: "asc" },
    });
    const items = plans.map((plan) => ({
      Content_ID: plan.contentId,
      approvalAttemptId: plan.approvalAttemptId,
      approvalVersion: plan.approvalVersion,
      scheduled_at: plan.scheduledAt?.toISOString(),
      caption: plan.finalCaption,
      expectedAccount: plan.contentPost ? { id: plan.contentPost.socialAccount.id, platform: plan.contentPost.socialAccount.platform, username: plan.contentPost.socialAccount.username, platformAccountId: plan.contentPost.socialAccount.platformAccountId } : null,
      assets: plan.assets.map((asset) => ({ slideNumber: asset.slideNumber, localPath: asset.localPath, publicUrl: asset.publicUrl, sha256: asset.sha256, mimeType: asset.mimeType, role: asset.assetRole })),
    }));
    return Response.json({ asOf: now.toISOString(), items });
  });
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    if (process.env.META_PUBLISH_ENV !== "staging") throw new HttpError(503, "Publishing is locked; META_PUBLISH_ENV must be staging");
    const stagingAccountId = process.env.META_STAGING_IG_USER_ID;
    if (!stagingAccountId || !/^\d+$/.test(stagingAccountId)) throw new HttpError(503, "META_STAGING_IG_USER_ID is not configured");
    const { Content_ID } = publishSchema.parse(await readJson(request));
    const plan = await db.contentPlanItem.findUnique({
      where: { contentId: Content_ID },
      include: { assets: { where: { isFinal: true }, orderBy: { slideNumber: "asc" } }, contentPost: { include: { socialAccount: true } } },
    });
    if (!plan || !plan.contentPost || !plan.approvalAttemptId) throw new HttpError(404, "Publishable content plan item not found");
    if (plan.status !== "scheduled" || !plan.scheduledAt || plan.scheduledAt > new Date()) throw new HttpError(409, "Content is not due for publishing");
    if (plan.contentPost.socialAccount.platform !== "instagram" || plan.contentPost.socialAccount.platformAccountId !== stagingAccountId) throw new HttpError(403, "Target is not the configured staging Instagram account");
    if (!plan.finalCaption || plan.assets.some((asset) => !asset.publicUrl) || !plan.assets.length) throw new HttpError(409, "Publishing requires a caption and public URLs for all final assets");

    const publisher = new MetaPublisherClient();
    try {
      const { mediaId } = await publisher.publish(stagingAccountId, plan.finalCaption, plan.assets.map((asset) => ({ publicUrl: asset.publicUrl!, mimeType: asset.mimeType })));
      const media = await publisher.getPublishedMedia(mediaId);
      if (!media.permalink || !media.timestamp) throw new HttpError(502, "Meta published media response is incomplete");
      await recordPublishResult(Content_ID, { success: true, approvalAttemptId: plan.approvalAttemptId, instagramMediaId: mediaId, publishedAt: new Date(media.timestamp).toISOString(), permalink: media.permalink });
      return Response.json({ Content_ID, instagramMediaId: mediaId, permalink: media.permalink });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown publishing error";
      await recordPublishResult(Content_ID, { success: false, approvalAttemptId: plan.approvalAttemptId, error: message });
      throw error;
    }
  });
}
