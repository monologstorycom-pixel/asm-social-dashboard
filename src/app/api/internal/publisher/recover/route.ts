import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, readJson, safeRoute } from "@/lib/http";
import { MetaPublisherClient } from "@/lib/meta-publisher";
import { authorizeInternalRequest } from "@/lib/operations";
import { recoverFailedPublication, type RecoveryStore } from "@/lib/publisher-recovery";

const schema = z.object({ Content_ID: z.string().trim().min(1).max(191), retryKey: z.string().trim().min(8).max(191), replacements: z.array(z.object({ slideNumber: z.number().int().min(1), publicUrl: z.url(), expectedSha256: z.string().regex(/^[a-f0-9]{64}$/), revision: z.number().int().min(1), candidate: z.string().trim().min(1).max(100) }).strict()).max(10).default([]) }).strict();

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    if (process.env.RECOVERY_ENABLED !== "true") throw new HttpError(503, "Recovery is disabled by RECOVERY_ENABLED");
    const body = schema.parse(await readJson(request));
    const store: RecoveryStore = {
      load: async (contentId) => {
        const plan = await db.contentPlanItem.findUnique({ where: { contentId }, include: { assets: { where: { isFinal: true }, orderBy: { slideNumber: "asc" } }, contentPost: { include: { socialAccount: true } } } });
        if (!plan?.contentPost) return null;
        return { contentId: plan.contentId, status: plan.status, publisherState: plan.publisherState, approvalAttemptId: plan.approvalAttemptId, revision: plan.assetRevision, candidate: plan.approvedCandidate ?? "", approvedAssetSetHash: plan.approvedAssetSetHash, assets: plan.assets.flatMap((a) => a.publicUrl ? [{ slideNumber: a.slideNumber, publicUrl: a.publicUrl, mimeType: a.mimeType, sha256: a.sha256 }] : []), targetAccountId: plan.contentPost.socialAccount.platformAccountId, publisherError: plan.publisherError, leaseId: plan.publisherLeaseId };
      },
      findRecentPublication: async (plan) => {
        const linked = await db.contentPlanItem.findUnique({ where: { contentId: plan.contentId }, select: { contentPost: { select: { instagramMediaId: true } } } });
        if (linked?.contentPost?.instagramMediaId) return { mediaId: linked.contentPost.instagramMediaId };
        const recent = await publisher.listRecentMedia(plan.targetAccountId, 25);
        const match = recent.find((media) => media.caption?.includes(plan.contentId));
        return match ? { mediaId: match.id } : null;
      },
      beginRetry: async (contentId, retryKey) => (await db.contentPlanItem.updateMany({ where: { contentId, publisherState: "failed", OR: [{ publisherRetryKey: null }, { publisherRetryKey: { not: retryKey } }], publisherRetryCount: 0 }, data: { publisherState: "publishing", publisherRetryKey: retryKey, publisherRetryCount: { increment: 1 }, publisherLeaseId: null, publisherLeaseUntil: null, publisherError: null } })).count === 1,
      applyReplacements: async (plan, replacements) => { await db.$transaction(async (tx) => { for (const replacement of replacements) { const updated = await tx.contentPlanAsset.updateMany({ where: { contentPlan: { contentId: plan.contentId }, slideNumber: replacement.slideNumber, revision: replacement.revision, candidate: replacement.candidate, sha256: replacement.expectedSha256 }, data: { publicUrl: replacement.publicUrl } }); if (updated.count !== 1) throw new HttpError(409, "Replacement asset changed concurrently"); } }); },
      complete: async (contentId, mediaId, permalink) => { await db.$transaction(async (tx) => { const plan = await tx.contentPlanItem.update({ where: { contentId }, data: { publisherState: "published", publishStatus: "published", status: "published", publisherError: null, publisherLeaseId: null, publisherLeaseUntil: null, publishedAt: new Date() } }); if (plan.contentPostId) await tx.contentPost.update({ where: { id: plan.contentPostId }, data: { status: "published", instagramMediaId: mediaId, permalink, publicUrl: permalink, publishedAt: new Date() } }); }); },
      fail: async (contentId, error) => { await db.contentPlanItem.update({ where: { contentId }, data: { publisherState: "failed", publishStatus: "failed", publisherError: error, publisherLeaseId: null, publisherLeaseUntil: null } }); },
      audit: async (event) => { const plan = await db.contentPlanItem.findUniqueOrThrow({ where: { contentId: String(event.contentId) } }); await db.publisherAudit.create({ data: { contentPlanId: plan.id, action: "publisher_recovery", approvalAttemptId: plan.approvalAttemptId, assetRevision: plan.assetRevision, retryKey: String(event.retryKey), details: JSON.parse(JSON.stringify(event)) } }); },
    };
    const publisher = new MetaPublisherClient();
    return Response.json(await recoverFailedPublication({ ...body, store, publish: async (accountId, assets) => { const result = await publisher.publish(accountId, (await db.contentPlanItem.findUniqueOrThrow({ where: { contentId: body.Content_ID }, select: { finalCaption: true } })).finalCaption ?? "", assets); const media = await publisher.getPublishedMedia(result.mediaId); if (!media.permalink) throw new HttpError(502, "Meta published media response is incomplete"); return { mediaId: result.mediaId, permalink: media.permalink }; }, contentId: body.Content_ID }));
  });
}
