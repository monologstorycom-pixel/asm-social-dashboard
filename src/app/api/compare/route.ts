import { db } from "@/lib/db";
import { HttpError, queryObject, safeRoute } from "@/lib/http";
import { analyticsWhere, resolveAnalyticsMode } from "@/lib/operations-db";
import { metricJson } from "@/lib/post-query";
import { compareQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  return safeRoute(async () => {
    const { ids, dataMode: requested } = compareQuerySchema.parse(queryObject(request));
    const targetAccounts = await db.contentPost.findMany({ where: { id: { in: ids } }, select: { socialAccountId: true } });
    if (targetAccounts.length !== ids.length) throw new HttpError(404, "One or more posts were not found");
    const accountId = new Set(targetAccounts.map(({ socialAccountId }) => socialAccountId)).size === 1 ? targetAccounts[0].socialAccountId : undefined;
    const mode = await resolveAnalyticsMode(requested, accountId);
    const sources = analyticsWhere(mode.dataMode);
    const posts = await db.contentPost.findMany({
      where: { id: { in: ids }, ...sources.post },
      include: { socialAccount: true, assets: { orderBy: { slideNumber: "asc" } }, metrics: { where: sources.metric, orderBy: { capturedAt: "asc" } } },
    });
    if (posts.length !== ids.length) throw new HttpError(404, "One or more posts were not found");
    const byId = new Map(posts.map((post) => [post.id, post]));
    const items = ids.map((id) => {
      const post = byId.get(id)!;
      const metrics = post.metrics.map(metricJson);
      return { ...post, metrics, latestMetric: metrics.at(-1) ?? null };
    });
    return Response.json({ dataMode: mode.dataMode, source: mode.dataMode === "demo" ? "demo" : mode.dataMode === "live" ? "meta" : "mixed", items });
  });
}
