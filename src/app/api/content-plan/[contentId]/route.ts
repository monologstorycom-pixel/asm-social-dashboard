import { db } from "@/lib/db";
import { contentIdSchema, contentPlanJson } from "@/lib/content-plan-api";
import { HttpError, safeRoute } from "@/lib/http";

type Context = { params: Promise<{ contentId: string }> };

export async function GET(_request: Request, context: Context) {
  return safeRoute(async () => {
    const contentId = contentIdSchema.parse((await context.params).contentId);
    const item = await db.contentPlanItem.findUnique({ where: { contentId }, include: { assets: { orderBy: { slideNumber: "asc" } }, contentPost: true } });
    if (!item) throw new HttpError(404, "Content plan item not found");
    return Response.json({ item: contentPlanJson(item) });
  });
}
