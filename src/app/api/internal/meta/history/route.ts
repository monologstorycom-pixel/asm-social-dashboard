import { safeRoute } from "@/lib/http";
import { importHistoricalMetaMedia } from "@/lib/operations-db";
import { authorizeInternalRequest } from "@/lib/operations";
import { HttpError } from "@/lib/http";

export const maxDuration = 300;

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const url = new URL(request.url);
    const maxPages = Number(url.searchParams.get("maxPages") ?? "5");
    const restart = url.searchParams.get("restart") === "true";
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new HttpError(400, "maxPages must be between 1 and 20");
    return Response.json(await importHistoricalMetaMedia(undefined, undefined, undefined, { maxPages, restart }));
  });
}
