import { parseContentPlanCsv } from "@/lib/content-plan";
import { contentPlanImportOutcome, readCsvPayload } from "@/lib/content-plan-api";
import { db } from "@/lib/db";
import { HttpError, safeRoute } from "@/lib/http";

export async function POST(request: Request) {
  return safeRoute(async () => {
    const parsed = parseContentPlanCsv(await readCsvPayload(request));
    const fatal = parsed.errors.find(({ row }) => row <= 1);
    if (fatal) throw new HttpError(400, fatal.message);
    const contentIds = [...new Set(parsed.rows.map(({ contentId }) => contentId))];
    const existing = contentIds.length ? await db.contentPlanItem.findMany({ where: { contentId: { in: contentIds } }, select: { contentId: true } }) : [];
    const outcome = contentPlanImportOutcome(parsed.entries, new Set(existing.map(({ contentId }) => contentId)));
    return Response.json({ summary: outcome.summary, rows: outcome.preview, errors: parsed.errors });
  });
}
