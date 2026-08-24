import { db } from "@/lib/db";
import { HttpError, queryObject, safeRoute } from "@/lib/http";
import { metricJson } from "@/lib/post-query";
import { compareQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  return safeRoute(async () => {
    const { ids } = compareQuerySchema.parse(queryObject(request));
    const posts = await db.contentPost.findMany({
      where: { id: { in: ids } },
      include: { socialAccount: true, assets: { orderBy: { slideNumber: "asc" } }, metrics: { orderBy: { capturedAt: "asc" } } },
    });
    if (posts.length !== ids.length) throw new HttpError(404, "One or more posts were not found");
    const byId = new Map(posts.map((post) => [post.id, post]));
    const items = ids.map((id) => {
      const post = byId.get(id)!;
      const metrics = post.metrics.map(metricJson);
      return { ...post, metrics, latestMetric: metrics.at(-1) ?? null };
    });
    return Response.json({ items });
  });
}
