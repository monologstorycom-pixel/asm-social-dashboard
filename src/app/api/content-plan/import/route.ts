import { parseContentPlanCsv } from "@/lib/content-plan";
import { contentPlanImportOutcome, readCsvPayload } from "@/lib/content-plan-api";
import { db } from "@/lib/db";
import { HttpError, safeRoute } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const parsed = parseContentPlanCsv(await readCsvPayload(request));
    const fatal = parsed.errors.find(({ row }) => row <= 1);
    if (fatal) throw new HttpError(400, fatal.message);
    const result = await db.$transaction(async (tx) => {
      const contentIds = [...new Set(parsed.rows.map(({ contentId }) => contentId))];
      const existing = contentIds.length ? await tx.contentPlanItem.findMany({ where: { contentId: { in: contentIds } }, select: { contentId: true } }) : [];
      const outcome = contentPlanImportOutcome(parsed.entries, new Set(existing.map(({ contentId }) => contentId)));
      const inserted = outcome.insertable.length ? (await tx.contentPlanItem.createMany({ data: outcome.insertable, skipDuplicates: true })).count : 0;
      return { outcome, inserted };
    });
    const invalid = parsed.errors.length;
    const skipped = parsed.entries.length - invalid - result.inserted;
    return Response.json({
      inserted: result.inserted,
      skipped,
      errors: parsed.errors,
      count: { total: parsed.entries.length, inserted: result.inserted, skipped, invalid },
    }, { status: 201 });
  });
}
