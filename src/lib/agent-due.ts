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
