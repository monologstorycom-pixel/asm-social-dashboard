import { db } from "@/lib/db";
import { HttpError, readJson, safeRoute } from "@/lib/http";
import { metricJson } from "@/lib/post-query";
import { idSchema, metricSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return safeRoute(async () => {
    const contentPostId = idSchema.parse((await context.params).id);
    const exists = await db.contentPost.count({ where: { id: contentPostId } });
    if (!exists) throw new HttpError(404, "Post not found");
    const items = await db.postMetric.findMany({ where: { contentPostId }, orderBy: { capturedAt: "asc" } });
    return Response.json({ items: items.map(metricJson) });
  });
}

export async function POST(request: Request, context: Context) {
  return safeRoute(async () => {
    const contentPostId = idSchema.parse((await context.params).id);
    const input = metricSchema.parse(await readJson(request));
    const item = await db.postMetric.create({ data: { ...input, contentPostId, capturedAt: new Date(input.capturedAt) } });
    return Response.json({ item: metricJson(item) }, { status: 201 });
  });
}
