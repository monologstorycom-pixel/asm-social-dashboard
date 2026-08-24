import { contentIdSchema } from "@/lib/content-plan-api";
import { safeRoute } from "@/lib/http";
import { getPublishingIntelligence } from "@/lib/operations-db";

type Context = { params: Promise<{ contentId: string }> };

export async function GET(_request: Request, context: Context) {
  return safeRoute(async () => {
    const contentId = contentIdSchema.parse((await context.params).contentId);
    return Response.json({ Content_ID: contentId, recommendation: await getPublishingIntelligence(contentId) });
  });
}
