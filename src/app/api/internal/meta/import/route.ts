import { safeRoute } from "@/lib/http";
import { importLiveMetaMedia } from "@/lib/operations-db";
import { authorizeInternalRequest } from "@/lib/operations";

export const maxDuration = 300;

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    return Response.json(await importLiveMetaMedia());
  });
}
