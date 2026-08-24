import { db } from "@/lib/db";
import { HttpError, queryObject, readJson, safeRoute } from "@/lib/http";
import { analyticsWhere, resolveAnalyticsMode } from "@/lib/operations-db";
import { authorizeInternalRequest } from "@/lib/operations";
import { metricJson } from "@/lib/post-query";
import { analyticsModeSchema, idSchema, metricSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return safeRoute(async () => {
    const contentPostId = idSchema.parse((await context.params).id);
    const target = await db.contentPost.findUnique({ where: { id: contentPostId }, select: { socialAccountId: true } });
    if (!target) throw new HttpError(404, "Post not found");
    const mode = await resolveAnalyticsMode(analyticsModeSchema.parse(queryObject(request).dataMode), target.socialAccountId);
    const sources = analyticsWhere(mode.dataMode);
    const visible = await db.contentPost.count({ where: { id: contentPostId, ...sources.post } });
    if (!visible) throw new HttpError(404, "Post not found in selected data mode");
    const items = await db.postMetric.findMany({ where: { contentPostId, ...sources.metric }, orderBy: { capturedAt: "asc" } });
    return Response.json({ dataMode: mode.dataMode, source: mode.dataMode === "demo" ? "demo" : mode.dataMode === "live" ? "meta" : "mixed", items: items.map(metricJson) });
  });
}

export async function POST(request: Request, context: Context) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const contentPostId = idSchema.parse((await context.params).id);
    const input = metricSchema.parse(await readJson(request));
    const item = await db.postMetric.create({ data: { ...input, contentPostId, capturedAt: new Date(input.capturedAt) } });
    return Response.json({ item: metricJson(item) }, { status: 201 });
  });
}
