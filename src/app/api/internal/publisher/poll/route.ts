import { automationSwitches, PUBLISH_RETRY_MAX_ATTEMPTS, publisherClaimStates } from "@/lib/automation";
import { db } from "@/lib/db";
import { HttpError, safeRoute } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";
import { assertSchedulerSuccess } from "@/lib/publisher-recovery";

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const now = new Date();
    const due = await db.contentPlanItem.findMany({
      where: { status: "scheduled", scheduledAt: { lte: now }, approvalAttemptId: { not: null }, OR: publisherClaimStates(now) },
      select: { contentId: true },
      orderBy: { scheduledAt: "asc" },
      take: 10,
    });
    const exhausted = await db.contentPlanItem.findMany({
      where: { status: "scheduled", scheduledAt: { lte: now }, publisherState: "failed", publisherRetryCount: { gte: PUBLISH_RETRY_MAX_ATTEMPTS } },
      select: { contentId: true, publisherRetryCount: true, publisherError: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
      take: 10,
    });
    for (const item of exhausted) console.error(JSON.stringify({ stage: "publisher_retry_exhausted", interventionRequired: true, ...item, updatedAt: item.updatedAt.toISOString() }));
    if (!automationSwitches().autoPublish) return Response.json({ locked: true, reason: "AUTO_PUBLISH is off", due: due.length, published: 0, failed: 0 });
    const token = process.env.INTERNAL_API_TOKEN;
    if (!token) throw new HttpError(503, "Internal API authentication is not configured");
    const base = new URL(request.url).origin;
    let published = 0, failed = 0;
    for (const item of due) {
      const res = await fetch(`${base}/api/internal/publisher/due`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ Content_ID: item.contentId }) });
      if (res.ok) published++;
      else failed++;
    }
    const result = { locked: false, due: due.length, published, failed };
    assertSchedulerSuccess(result);
    return Response.json(result);
  });
}
