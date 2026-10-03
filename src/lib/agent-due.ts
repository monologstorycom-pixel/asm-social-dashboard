import type { ContentPlanStatus } from "@/lib/content-plan";

export const AGENT_DUE_PRODUCTION_HOUR_WIB = 8;

export function wibDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isAfterProductionKickoffWib(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(now));
  return hour >= AGENT_DUE_PRODUCTION_HOUR_WIB;
}

export function contentPlanDateRangeForWibDay(now = new Date()) {
  const dateKey = wibDateKey(now);
  return { dateKey, gte: new Date(`${dateKey}T00:00:00.000Z`), lt: new Date(`${dateKey}T00:00:00.000Z`).getTime() + 86_400_000 };
}

export function agentDueStatuses(now = new Date()): ContentPlanStatus[] {
  return isAfterProductionKickoffWib(now) ? ["planned", "approved_for_creation"] : ["approved_for_creation"];
}

export function buildAgentDueWhere(now = new Date()) {
  const { gte, lt } = contentPlanDateRangeForWibDay(now);
  return { date: { gte, lt: new Date(lt) }, status: { in: agentDueStatuses(now) } };
}

export type AgentDueRecord = Record<string, unknown> & { contentId: string; date: Date };
export type DailyWatchdogRecord = { contentId: string; status: string; updatedAt: Date };
export const DAILY_CONTENT_STALE_MINUTES = 120;

export function dailyContentStaleMinutes(value = process.env.DAILY_CONTENT_STALE_MINUTES) {
  if (value === undefined) return DAILY_CONTENT_STALE_MINUTES;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1) throw new Error("DAILY_CONTENT_STALE_MINUTES must be a positive integer");
  return minutes;
}

export function buildDailyWatchdogWhere(now = new Date(), staleMinutes = dailyContentStaleMinutes()) {
  const { gte, lt } = contentPlanDateRangeForWibDay(now);
  return { date: { gte, lt: new Date(lt) }, status: "creating" as const, updatedAt: { lte: new Date(now.getTime() - staleMinutes * 60_000) } };
}

export function dailyWatchdogFailure(item: DailyWatchdogRecord, now = new Date()) {
  return { Content_ID: item.contentId, stage: item.status, ageMinutes: Math.floor((now.getTime() - item.updatedAt.getTime()) / 60_000), reason: "daily_content_stale" as const };
}

export async function findDailyWatchdogFailures(db: { contentPlanItem: { findMany(args: { where: ReturnType<typeof buildDailyWatchdogWhere>; select: { contentId: true; status: true; updatedAt: true }; orderBy: { updatedAt: "asc" }; take: number }): Promise<DailyWatchdogRecord[]> } }, now = new Date()) {
  const items = await db.contentPlanItem.findMany({ where: buildDailyWatchdogWhere(now), select: { contentId: true, status: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: 100 });
  return items.map((item) => dailyWatchdogFailure(item, now));
}

type AgentDueDb = {
  contentPlanItem: {
    updateMany(args: { where: ReturnType<typeof buildAgentDueWhere> & { contentId: string }; data: { status: "creating" } }): Promise<{ count: number }>;
    findUniqueOrThrow(args: { where: { contentId: string } }): Promise<AgentDueRecord>;
  };
};

export async function claimAgentDueItem(db: AgentDueDb, contentId: string, now = new Date()): Promise<AgentDueRecord | null> {
  const updated = await db.contentPlanItem.updateMany({
    where: { contentId, ...buildAgentDueWhere(now) },
    data: { status: "creating" },
  });
  if (updated.count !== 1) return null;
  return db.contentPlanItem.findUniqueOrThrow({ where: { contentId } });
}
