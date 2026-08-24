import { db } from "@/lib/db";
import { HttpError, queryObject, readJson, safeRoute } from "@/lib/http";
import { analyticsWhere, resolveAnalyticsMode } from "@/lib/operations-db";
import { metricJson } from "@/lib/post-query";
import { analyticsModeSchema, idSchema, updatePostSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return safeRoute(async () => {
    const id = idSchema.parse((await context.params).id);
    const requested = analyticsModeSchema.parse(queryObject(request).dataMode);
    const target = await db.contentPost.findUnique({ where: { id }, select: { socialAccountId: true } });
    if (!target) throw new HttpError(404, "Post not found");
    const mode = await resolveAnalyticsMode(requested, target.socialAccountId);
    const sources = analyticsWhere(mode.dataMode);
    const item = await db.contentPost.findUnique({
      where: { id, ...sources.post },
      include: {
        socialAccount: true,
        assets: { orderBy: { slideNumber: "asc" } },
        metrics: { where: sources.metric, orderBy: { capturedAt: "asc" } },
        calendarEntry: true,
        experiments: { include: { experiment: true } },
      },
    });
    if (!item) throw new HttpError(404, "Post not found");
    return Response.json({ dataMode: mode.dataMode, source: mode.dataMode === "demo" ? "demo" : mode.dataMode === "live" ? "meta" : "mixed", item: { ...item, metrics: item.metrics.map(metricJson) } });
  });
}

export async function PATCH(request: Request, context: Context) {
  return safeRoute(async () => {
    const id = idSchema.parse((await context.params).id);
    const input = updatePostSchema.parse(await readJson(request));
    const item = await db.contentPost.update({
      where: { id },
      data: { ...input, ...(input.publishedAt !== undefined && { publishedAt: input.publishedAt ? new Date(input.publishedAt) : null }) },
      include: { socialAccount: true, assets: { orderBy: { slideNumber: "asc" } } },
    });
    return Response.json({ item });
  });
}
