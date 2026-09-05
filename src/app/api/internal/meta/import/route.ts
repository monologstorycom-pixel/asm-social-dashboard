import { safeRoute, queryObject } from "@/lib/http";
import { importLiveMetaMediaPage } from "@/lib/operations-db";
import { authorizeInternalRequest } from "@/lib/operations";

export const maxDuration = 300;

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const params = queryObject(request);
    const pageSize = params.limit ? Math.min(Number(params.limit), 100) : 100;
    const cursor = typeof params.after === "string" && params.after ? params.after : undefined;
    return Response.json(await importLiveMetaMediaPage(undefined, new Date(), undefined, undefined, cursor, pageSize));
  });
}
