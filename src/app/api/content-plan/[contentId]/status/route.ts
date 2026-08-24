import { z } from "zod";


import { contentIdSchema, contentPlanJson, contentPlanStatusSchema } from "@/lib/content-plan-api";
import { db } from "@/lib/db";
import { HttpError, readJson, safeRoute } from "@/lib/http";
import { assertGeneralTransition } from "@/lib/operations";

type Context = { params: Promise<{ contentId: string }> };
const bodySchema = z.object({ status: contentPlanStatusSchema }).strict();

export async function PATCH(request: Request, context: Context) {
  return safeRoute(async () => {
    const contentId = contentIdSchema.parse((await context.params).contentId);
    const { status } = bodySchema.parse(await readJson(request));
    const item = await db.$transaction(async (tx) => {
      const current = await tx.contentPlanItem.findUnique({ where: { contentId }, include: { assets: { where: { isFinal: true } }, contentPost: { include: { metrics: { where: { source: "meta" }, take: 1 } } } } });
      if (!current) throw new HttpError(404, "Content plan item not found");
      if (current.status === status) return current;
      assertGeneralTransition(current.status, status, {
        approvedAt: current.approvedAt,
        scheduledAt: current.scheduledAt,
        publishedAt: current.publishedAt,
        instagramMediaId: current.contentPost?.instagramMediaId,
        permalink: current.contentPost?.permalink,
        publicUrl: current.contentPost?.publicUrl,
        liveMetricCount: current.contentPost?.metrics.length ?? 0,
        qaStatus: current.qaStatus,
        finalAssets: current.assets.length,
      });
      const updated = await tx.contentPlanItem.updateMany({ where: { contentId, status: current.status }, data: { status } });
      if (updated.count !== 1) throw new HttpError(409, "Content plan status changed concurrently; retry with fresh data");
      return tx.contentPlanItem.findUniqueOrThrow({ where: { contentId } });
    });
    return Response.json({ item: contentPlanJson(item) });
  });
}
