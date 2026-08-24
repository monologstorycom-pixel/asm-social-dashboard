import { db } from "@/lib/db";
import { safeRoute, queryObject, readJson } from "@/lib/http";
import { buildPostWhere, metricJson, sortPosts } from "@/lib/post-query";
import { createPostSchema, postFiltersSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return safeRoute(async () => {
    const filters = postFiltersSchema.parse(queryObject(request));
    const candidates = await db.contentPost.findMany({
      where: buildPostWhere(filters),
      include: {
        socialAccount: true,
        assets: { orderBy: { slideNumber: "asc" } },
        metrics: { orderBy: { capturedAt: "desc" }, take: 1 },
      },
    });
    // ponytail: metric sorting is in-memory for V1; use a latest-metric SQL view when pagination volume outgrows one process.
    const sorted = sortPosts(candidates, filters.sort, filters.order);
    const start = (filters.page - 1) * filters.pageSize;
    const items = sorted.slice(start, start + filters.pageSize).map(({ metrics, ...post }) => ({
      ...post,
      latestMetric: metrics[0] ? metricJson(metrics[0]) : null,
    }));
    return Response.json({ items, pagination: { page: filters.page, pageSize: filters.pageSize, total: candidates.length }, sort: { field: filters.sort, order: filters.order } });
  });
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    const input = createPostSchema.parse(await readJson(request));
    const item = await db.contentPost.create({
      data: { ...input, publishedAt: input.publishedAt ? new Date(input.publishedAt) : null },
      include: { socialAccount: true, assets: true },
    });
    return Response.json({ item }, { status: 201 });
  });
}
