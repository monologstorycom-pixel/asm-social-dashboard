import { z } from "zod";

import { queryObject, safeRoute } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";
import { reconciliationReport } from "@/lib/operations-db";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).strict();

export async function GET(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const { limit } = querySchema.parse(queryObject(request));
    const items = await reconciliationReport(limit);
    return Response.json({ readOnly: true, count: items.length, items });
  });
}
