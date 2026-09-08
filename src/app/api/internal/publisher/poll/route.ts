import { automationSwitches } from "@/lib/automation";
import { db } from "@/lib/db";
import { HttpError, safeRoute } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const due = await db.contentPlanItem.findMany({
      where: { publishStatus: "scheduled", publisherState: "scheduled", scheduledAt: { lte: new Date() }, approvalAttemptId: { not: null } },
      select: { contentId: true },
      orderBy: { scheduledAt: "asc" },
      take: 10,
    });
    if (!automationSwitches().autoPublish) return Response.json({ locked: true, reason: "AUTO_PUBLISH is off", due: due.length, published: 0, failed: 0 });
    const token = process.env.INTERNAL_API_TOKEN;
    if (!token) throw new HttpError(503, "Internal API authentication is not configured");
    const base = new URL(request.url).origin;
    let published = 0, failed = 0;
    for (const item of due) {
      const res = await fetch(`${base}/api/internal/publisher/due`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ Content_ID: item.contentId }) });
      res.ok ? published++ : failed++;
    }
    return Response.json({ locked: false, due: due.length, published, failed });
  });
}
