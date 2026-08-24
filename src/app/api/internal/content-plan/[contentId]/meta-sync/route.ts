import { contentIdSchema } from "@/lib/content-plan-api";
import { safeRoute } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";
import { syncPublishedPlan } from "@/lib/operations-db";

type Context = { params: Promise<{ contentId: string }> };

export async function POST(request: Request, context: Context) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const contentId = contentIdSchema.parse((await context.params).contentId);
    const asOf = new Date();
    return Response.json({ Content_ID: contentId, asOf: asOf.toISOString(), ...(await syncPublishedPlan(contentId, asOf)) });
  });
}
