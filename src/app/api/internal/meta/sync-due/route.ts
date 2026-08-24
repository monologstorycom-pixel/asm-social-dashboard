import { z } from "zod";

import { safeRoute, queryObject } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";
import { syncAllDue } from "@/lib/operations-db";

const querySchema = z.object({ now: z.iso.datetime().optional() }).strict();

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const { now } = querySchema.parse(queryObject(request));
    const asOf = now ? new Date(now) : new Date();
    const items = await syncAllDue(asOf);
    return Response.json({ asOf: asOf.toISOString(), items });
  });
}
