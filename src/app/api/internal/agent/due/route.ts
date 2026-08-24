import { z } from "zod";

import { contentIdSchema, contentPlanJson } from "@/lib/content-plan-api";
import { db } from "@/lib/db";
import { HttpError, readJson, safeRoute } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";

const claimSchema = z.object({ Content_ID: contentIdSchema }).strict();

export async function GET(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const items = await db.contentPlanItem.findMany({ where: { status: "approved_for_creation" }, orderBy: [{ date: "asc" }, { createdAt: "asc" }], take: 100 });
    return Response.json({ items: items.map(contentPlanJson) });
  });
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const { Content_ID } = claimSchema.parse(await readJson(request));
    const updated = await db.contentPlanItem.updateMany({ where: { contentId: Content_ID, status: "approved_for_creation" }, data: { status: "creating" } });
    if (updated.count !== 1) throw new HttpError(409, "Item is not available to claim");
    const item = await db.contentPlanItem.findUniqueOrThrow({ where: { contentId: Content_ID } });
    return Response.json({ item: contentPlanJson(item) });
  });
}
