import { scheduleSchema } from "@/lib/operations-api";
import { contentIdSchema, contentPlanJson } from "@/lib/content-plan-api";
import { db } from "@/lib/db";
import { HttpError, readJson, safeRoute } from "@/lib/http";
import { authorizeInternalRequest, parsePublishWindow, validateScheduledAt } from "@/lib/operations";

type Context = { params: Promise<{ contentId: string }> };

export async function POST(request: Request, context: Context) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const contentId = contentIdSchema.parse((await context.params).contentId);
    const body = scheduleSchema.parse(await readJson(request));
    const item = await db.$transaction(async (tx) => {
      const current = await tx.contentPlanItem.findUnique({ where: { contentId } });
      if (!current) throw new HttpError(404, "Content plan item not found");
      const scheduledAt = new Date(body.scheduled_at);
      if (current.status === "scheduled" && current.scheduledAt?.getTime() === scheduledAt.getTime()) return current;
      if (current.status !== "approved" || !current.approvedAt || !current.approvalAttemptId) throw new HttpError(409, "Scheduling requires an approved attempt");
      validateScheduledAt(scheduledAt, parsePublishWindow(current.testPublishWindow, current.date));
      const updated = await tx.contentPlanItem.updateMany({
        where: { id: current.id, status: "approved", approvalAttemptId: current.approvalAttemptId, approvalVersion: current.approvalVersion },
        data: { status: "scheduled", scheduledAt, publisherState: "scheduled", publishStatus: "scheduled" },
      });
      if (updated.count !== 1) throw new HttpError(409, "Content schedule changed concurrently; retry with fresh data");
      await tx.contentPost.update({ where: { id: current.contentPostId! }, data: { status: "scheduled", scheduledAt } });
      return tx.contentPlanItem.findUniqueOrThrow({ where: { id: current.id } });
    });
    return Response.json({ item: contentPlanJson(item) });
  });
}
