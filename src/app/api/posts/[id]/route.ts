import { db } from "@/lib/db";
import { HttpError, readJson, safeRoute } from "@/lib/http";
import { metricJson } from "@/lib/post-query";
import { idSchema, updatePostSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return safeRoute(async () => {
    const id = idSchema.parse((await context.params).id);
    const item = await db.contentPost.findUnique({
      where: { id },
      include: {
        socialAccount: true,
        assets: { orderBy: { slideNumber: "asc" } },
        metrics: { orderBy: { capturedAt: "asc" } },
        calendarEntry: true,
        experiments: { include: { experiment: true } },
      },
    });
    if (!item) throw new HttpError(404, "Post not found");
    return Response.json({ item: { ...item, metrics: item.metrics.map(metricJson) } });
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
