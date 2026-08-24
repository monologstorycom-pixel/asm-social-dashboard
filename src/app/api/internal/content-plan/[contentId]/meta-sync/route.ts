import { z } from "zod";

import { contentIdSchema } from "@/lib/content-plan-api";
import { queryObject, safeRoute } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";
import { syncPublishedPlan } from "@/lib/operations-db";

type Context = { params: Promise<{ contentId: string }> };
const querySchema = z.object({ now: z.iso.datetime().optional() }).strict();

export async function POST(request: Request, context: Context) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const contentId = contentIdSchema.parse((await context.params).contentId);
    const { now } = querySchema.parse(queryObject(request));
    const asOf = now ? new Date(now) : new Date();
    return Response.json({ Content_ID: contentId, asOf: asOf.toISOString(), ...(await syncPublishedPlan(contentId, asOf)) });
  });
}
