import { safeRoute } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";
import { syncAllDue } from "@/lib/operations-db";

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const asOf = new Date();
    const items = await syncAllDue(asOf);
    return Response.json({ asOf: asOf.toISOString(), items });
  });
}
