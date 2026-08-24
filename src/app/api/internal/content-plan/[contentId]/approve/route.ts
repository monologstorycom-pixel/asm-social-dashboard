import { randomUUID } from "node:crypto";

import { approvalSchema } from "@/lib/operations-api";
import { contentIdSchema, contentPlanJson } from "@/lib/content-plan-api";
import { db } from "@/lib/db";
import { HttpError, readJson, safeRoute } from "@/lib/http";
import { APPROVAL_COMMAND, authorizeInternalRequest, validateApprovalCommand } from "@/lib/operations";

type Context = { params: Promise<{ contentId: string }> };

export async function POST(request: Request, context: Context) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const contentId = contentIdSchema.parse((await context.params).contentId);
    const body = approvalSchema.parse(await readJson(request));
    validateApprovalCommand(body.command);
    const item = await db.$transaction(async (tx) => {
      const current = await tx.contentPlanItem.findUnique({ where: { contentId }, include: { assets: true, contentPost: true } });
      if (!current) throw new HttpError(404, "Content plan item not found");
      if (current.status === "approved" && current.approvalCommand === APPROVAL_COMMAND) {
        if (current.approvalReference !== body.reference) throw new HttpError(409, "Approved request may only be retried with the same reference");
        return current;
      }
      if (current.status !== "ready_for_review") throw new HttpError(409, "Approval requires ready_for_review");
      if (current.qaStatus !== "passed" || !current.contentPostId || !current.finalCaption || !current.assets.length || !current.assets.every((asset) => asset.isFinal)) throw new HttpError(409, "Approval requires passed QA, a linked post, caption, and final assets");
      return tx.contentPlanItem.update({
        where: { id: current.id },
        data: { status: "approved", approvedAt: new Date(), approvalCommand: APPROVAL_COMMAND, approvalReference: body.reference, approvalAttemptId: randomUUID(), approvalVersion: { increment: 1 }, approvalStatus: "approved", publisherState: "ready", publisherError: null },
        include: { assets: { orderBy: { slideNumber: "asc" } }, contentPost: true },
      });
    });
    return Response.json({ item: contentPlanJson(item) });
  });
}
