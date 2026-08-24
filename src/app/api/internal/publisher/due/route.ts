import { db } from "@/lib/db";
import { safeRoute } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";

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
