import assert from "node:assert/strict";
import test from "node:test";

import { agentDueStatuses, buildAgentDueWhere, claimAgentDueItem, wibDateKey } from "../src/lib/agent-due";

const today = new Date("2026-09-08T01:00:00.000Z"); // 08:00 WIB

test("agent due uses WIB day and opens planned at 08:00 WIB", () => {
  assert.equal(wibDateKey(new Date("2026-09-07T17:00:00.000Z")), "2026-09-08");
  assert.deepEqual(agentDueStatuses(new Date("2026-09-08T00:59:59.000Z")), ["approved_for_creation"]);
  assert.deepEqual(agentDueStatuses(today), ["planned", "approved_for_creation"]);
});

test("agent due is exact-date only for today's WIB content", () => {
  assert.deepEqual(buildAgentDueWhere(today), {
    date: { gte: new Date("2026-09-08T00:00:00.000Z"), lt: new Date("2026-09-09T00:00:00.000Z") },
    status: { in: ["planned", "approved_for_creation"] },
  });
});

test("claim is atomic so double claim only lets one worker win", async () => {
  const row = { contentId: "ASM-20260908-01", status: "planned", date: new Date("2026-09-08T00:00:00.000Z") };
  const db = {
    contentPlanItem: {
      async updateMany({ where, data }: { where: { contentId: string; status: { in: string[] }; date: { gte: Date; lt: Date } }; data: { status: string } }) {
        const matches = row.contentId === where.contentId
          && where.status.in.includes(row.status)
          && row.date >= where.date.gte
          && row.date < where.date.lt;
        if (!matches) return { count: 0 };
        row.status = data.status;
        return { count: 1 };
      },
      async findUniqueOrThrow() { return row; },
    },
  };

  const [first, second] = await Promise.all([
    claimAgentDueItem(db, row.contentId, today),
    claimAgentDueItem(db, row.contentId, today),
  ]);

  assert.equal([first, second].filter(Boolean).length, 1);
  assert.equal(row.status, "creating");
});
