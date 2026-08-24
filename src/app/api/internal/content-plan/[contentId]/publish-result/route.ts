import { publishResultSchema } from "@/lib/operations-api";
import { contentIdSchema, contentPlanJson } from "@/lib/content-plan-api";
import { readJson, safeRoute } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";
import { recordPublishResult } from "@/lib/operations-db";

type Context = { params: Promise<{ contentId: string }> };

export async function POST(request: Request, context: Context) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const contentId = contentIdSchema.parse((await context.params).contentId);
    const body = publishResultSchema.parse(await readJson(request));
    const item = await recordPublishResult(contentId, body);
    return Response.json({ item: contentPlanJson(item) });
  });
}
