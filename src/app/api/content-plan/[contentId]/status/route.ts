import { z } from "zod";

import { canTransitionContentPlan } from "@/lib/content-plan";
import { contentIdSchema, contentPlanJson, contentPlanStatusSchema } from "@/lib/content-plan-api";
import { db } from "@/lib/db";
import { HttpError, readJson, safeRoute } from "@/lib/http";

type Context = { params: Promise<{ contentId: string }> };
const bodySchema = z.object({ status: contentPlanStatusSchema }).strict();

export async function PATCH(request: Request, context: Context) {
  return safeRoute(async () => {
    const contentId = contentIdSchema.parse((await context.params).contentId);
    const { status } = bodySchema.parse(await readJson(request));
    const item = await db.$transaction(async (tx) => {
      const current = await tx.contentPlanItem.findUnique({ where: { contentId } });
      if (!current) throw new HttpError(404, "Content plan item not found");
      if (!canTransitionContentPlan(current.status, status)) throw new HttpError(409, `Cannot transition status from ${current.status} to ${status}`);
      if (current.status === status) return current;
      const updated = await tx.contentPlanItem.updateMany({ where: { contentId, status: current.status }, data: { status } });
      if (updated.count !== 1) throw new HttpError(409, "Content plan status changed concurrently; retry with fresh data");
      return tx.contentPlanItem.findUniqueOrThrow({ where: { contentId } });
    });
    return Response.json({ item: contentPlanJson(item) });
  });
}
