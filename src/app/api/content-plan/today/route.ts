import { db } from "@/lib/db";
import { contentPlanJson, isoDateSchema } from "@/lib/content-plan-api";
import { queryObject, safeRoute } from "@/lib/http";

const TIMEZONE = "Asia/Jakarta";

function currentWibDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function GET(request: Request) {
  return safeRoute(async () => {
    const requested = queryObject(request).date;
    const date = isoDateSchema.parse(requested ?? currentWibDate());
    const items = await db.contentPlanItem.findMany({
      where: { date: new Date(`${date}T00:00:00.000Z`) },
      orderBy: { contentId: "asc" },
    });
    return Response.json({ date, timezone: TIMEZONE, items: items.map(contentPlanJson) });
  });
}
