import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { agentDueStatuses, buildAgentDueWhere, buildDailyWatchdogWhere, claimAgentDueItem, dailyWatchdogFailure, wibDateKey } from "../src/lib/agent-due";

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

test("watchdog selects only stale creating items from today's WIB plan", () => {
  const now = new Date("2026-09-08T05:00:00.000Z");
  assert.deepEqual(buildDailyWatchdogWhere(now, 120), {
    date: { gte: new Date("2026-09-08T00:00:00.000Z"), lt: new Date("2026-09-09T00:00:00.000Z") },
    status: "creating",
    updatedAt: { lte: new Date("2026-09-08T03:00:00.000Z") },
  });
});

test("watchdog failure includes Content_ID, lifecycle stage, age, and reason", () => {
  assert.deepEqual(dailyWatchdogFailure({ contentId: "ASM-30D-20260908-01", status: "creating", updatedAt: new Date("2026-09-08T02:30:00.000Z") }, new Date("2026-09-08T05:00:00.000Z")), {
    Content_ID: "ASM-30D-20260908-01",
    stage: "creating",
    ageMinutes: 150,
    reason: "daily_content_stale",
  });
});

test("published daily content never matches the stale watchdog lifecycle filter", () => {
  assert.equal(buildDailyWatchdogWhere(today, 120).status, "creating");
});

test("watchdog and publisher poll routes authenticate and poll fails on watchdog failures", () => {
  const watchdog = readFileSync(new URL("../src/app/api/internal/agent/watchdog/route.ts", import.meta.url), "utf8");
  const poll = readFileSync(new URL("../src/app/api/internal/publisher/poll/route.ts", import.meta.url), "utf8");
  assert.match(watchdog, /authorizeInternalRequest\(request\)/);
  assert.match(watchdog, /simulateStale/);
  assert.match(poll, /findDailyWatchdogFailures/);
  assert.match(poll, /daily content watchdog failure/);
});
