import { scheduleSchema } from "@/lib/operations-api";
import { contentIdSchema, contentPlanJson } from "@/lib/content-plan-api";
import { db } from "@/lib/db";
import { HttpError, readJson, safeRoute } from "@/lib/http";
import { authorizeInternalRequest, parsePublishWindow, validateScheduledAt } from "@/lib/operations";
import { assertApprovedAssetIdentity, preflightAssets } from "@/lib/publisher-recovery";

type Context = { params: Promise<{ contentId: string }> };

export async function POST(request: Request, context: Context) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const contentId = contentIdSchema.parse((await context.params).contentId);
    const body = scheduleSchema.parse(await readJson(request));
    const snapshot = await db.contentPlanItem.findUnique({ where: { contentId }, include: { assets: { where: { isFinal: true }, orderBy: { slideNumber: "asc" } } } });
    if (!snapshot) throw new HttpError(404, "Content plan item not found");
    const scheduledAt = new Date(body.scheduled_at);
    if (snapshot.status === "scheduled" && snapshot.scheduledAt?.getTime() === scheduledAt.getTime()) return Response.json({ item: contentPlanJson(snapshot) });
    if (snapshot.status !== "approved" || !snapshot.approvedAt || !snapshot.approvalAttemptId) throw new HttpError(409, "Scheduling requires an approved attempt");
    validateScheduledAt(scheduledAt, parsePublishWindow(snapshot.testPublishWindow, snapshot.date));
    if (snapshot.assets.some((asset) => !asset.publicUrl)) throw new HttpError(409, "Scheduling requires public URLs for all approved assets");
    const assets = snapshot.assets.map((asset) => ({ slideNumber: asset.slideNumber, publicUrl: asset.publicUrl!, mimeType: asset.mimeType, sha256: asset.sha256 }));
    assertApprovedAssetIdentity(snapshot.approvedAssetSetHash, snapshot.contentId, snapshot.assetRevision, snapshot.approvedCandidate ?? "", assets);
    await preflightAssets(assets);

    const item = await db.$transaction(async (tx) => {
      const current = await tx.contentPlanItem.findUnique({ where: { contentId }, include: { assets: { where: { isFinal: true }, orderBy: { slideNumber: "asc" } } } });
      if (!current || current.approvalAttemptId !== snapshot.approvalAttemptId || current.approvalVersion !== snapshot.approvalVersion || current.assetRevision !== snapshot.assetRevision || current.approvedAssetSetHash !== snapshot.approvedAssetSetHash) throw new HttpError(409, "Content changed during asset preflight; retry with fresh data");
      const currentAssets = current.assets.map((asset) => ({ slideNumber: asset.slideNumber, publicUrl: asset.publicUrl ?? "", mimeType: asset.mimeType, sha256: asset.sha256 }));
      assertApprovedAssetIdentity(current.approvedAssetSetHash, current.contentId, current.assetRevision, current.approvedCandidate ?? "", currentAssets);
      const updated = await tx.contentPlanItem.updateMany({ where: { id: current.id, status: "approved", approvalAttemptId: current.approvalAttemptId, approvalVersion: current.approvalVersion, assetRevision: current.assetRevision, approvedAssetSetHash: current.approvedAssetSetHash }, data: { status: "scheduled", scheduledAt, publisherState: "scheduled", publishStatus: "scheduled" } });
      if (updated.count !== 1) throw new HttpError(409, "Content schedule changed concurrently; retry with fresh data");
      await tx.contentPost.update({ where: { id: current.contentPostId! }, data: { status: "scheduled", scheduledAt } });
      return tx.contentPlanItem.findUniqueOrThrow({ where: { id: current.id } });
    });
    return Response.json({ item: contentPlanJson(item) });
  });
}
