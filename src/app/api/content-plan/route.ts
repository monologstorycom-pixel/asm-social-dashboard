import { db } from "@/lib/db";
import { buildContentPlanWhere, contentPlanFiltersSchema, contentPlanJson } from "@/lib/content-plan-api";
import { queryObject, safeRoute } from "@/lib/http";

export async function GET(request: Request) {
  return safeRoute(async () => {
    const filters = contentPlanFiltersSchema.parse(queryObject(request));
    const where = buildContentPlanWhere(filters);
    const skip = (filters.page - 1) * filters.pageSize;
    const [items, total] = await db.$transaction([
      db.contentPlanItem.findMany({ where, orderBy: [{ date: filters.sort }, { contentId: filters.sort }], skip, take: filters.pageSize }),
      db.contentPlanItem.count({ where }),
    ]);
    return Response.json({
      items: items.map(contentPlanJson),
      pagination: { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) },
      sort: { field: "date", order: filters.sort },
    });
  });
}
