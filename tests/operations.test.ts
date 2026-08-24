import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  analyticsSourceFilters,
  assertGeneralTransition,
  assertLifecycleInvariants,
  authorizeInternalRequest,
  buildReconciliationReport,
  computeEarlyVelocity,
  dueMetricWindows,
  mapPlanFields,
  normalizeMetaMetrics,
  parsePublishWindow,
  publishingRecommendation,
  resolveDataMode,
  syncMetricWindows,
  validateApprovalCommand,
  validateScheduledAt,
} from "../src/lib/operations";
import { MetaInsightsClient } from "../src/lib/meta";
import { recordPublishResult, resolveAnalyticsMode, type OperationsDb } from "../src/lib/operations-db";

test("general lifecycle updates cannot bypass exact approval or operational invariants", () => {
  assert.doesNotThrow(() => assertGeneralTransition("approved_for_creation", "creating", {}));
  assert.throws(() => assertGeneralTransition("ready_for_review", "approved", {}), /approval endpoint/);
  assert.throws(() => assertGeneralTransition("creating", "ready_for_review", { qaStatus: "failed", finalAssets: 1 }), /QA/);
  assert.doesNotThrow(() => assertGeneralTransition("creating", "ready_for_review", { qaStatus: "passed", finalAssets: 1 }));
  assert.throws(() => assertLifecycleInvariants("scheduled", { approvedAt: new Date() }), /scheduledAt/);
  assert.throws(() => assertLifecycleInvariants("published", { approvedAt: new Date(), scheduledAt: new Date(), publishedAt: new Date(), instagramMediaId: "m" }), /URL/);
  assert.throws(() => assertLifecycleInvariants("measuring", { approvedAt: new Date(), scheduledAt: new Date(), publishedAt: new Date(), instagramMediaId: "m", permalink: "https://example.com/p", liveMetricCount: 0 }), /metric/);
});

test("artifact mapping is safe and deterministic for plan free strings", () => {
  assert.deepEqual(mapPlanFields({ pillar: "How-to Education", format: "IG Carousel", creativeStyle: "Editorial / clean" }), {
    contentPillar: "education",
    contentType: "carousel",
    creativeStyle: "editorial_no_box",
  });
  assert.deepEqual(mapPlanFields({ pillar: "unknown", format: "unknown", creativeStyle: "unknown" }), {
    contentPillar: "brand",
    contentType: "image",
    creativeStyle: "editorial_no_box",
  });
});

test("approval command is byte-for-byte exact", () => {
  assert.doesNotThrow(() => validateApprovalCommand("APPROVE & PUBLISH"));
  for (const command of ["approve & publish", " APPROVE & PUBLISH", "APPROVE & PUBLISH ", "APPROVE AND PUBLISH"]) {
    assert.throws(() => validateApprovalCommand(command), /exactly/);
  }
});

test("schedule must be within the controlled parsed test window", () => {
  const window = parsePublishWindow("19:00-21:00 WIB", new Date("2026-08-25T00:00:00.000Z"));
  assert.deepEqual(window, { start: new Date("2026-08-25T12:00:00.000Z"), end: new Date("2026-08-25T14:00:00.000Z"), label: "19:00-21:00 WIB" });
  assert.doesNotThrow(() => validateScheduledAt(new Date("2026-08-25T13:00:00.000Z"), window));
  assert.throws(() => validateScheduledAt(new Date("2026-08-25T15:00:00.000Z"), window), /recommended window/);
});

test("data mode automatically switches from clearly-labelled demo to live", () => {
  assert.deepEqual(resolveDataMode("auto", false), { dataMode: "demo", source: "demo" });
  assert.deepEqual(resolveDataMode("auto", true), { dataMode: "live", source: "live" });
  assert.deepEqual(resolveDataMode("all", true), { dataMode: "all", source: undefined });
});

test("analytics source filters never mix demo and live metrics", () => {
  assert.deepEqual(analyticsSourceFilters("demo"), { postSource: "demo", metricSources: ["demo"] });
  assert.deepEqual(analyticsSourceFilters("live"), { postSource: "live", metricSources: ["meta"] });
  assert.deepEqual(analyticsSourceFilters("all"), { postSource: undefined, metricSources: undefined });
});

test("Meta sync stores each due window once and advances the first live snapshot to measuring", async () => {
  const stored: string[] = [];
  let measured = false;
  const result = await syncMetricWindows({
    post: { id: "post", publishedAt: new Date("2026-08-01T00:00:00.000Z"), instagramMediaId: "media" },
    now: new Date("2026-08-01T07:00:00.000Z"),
    completed: new Set(["h1"]),
    fetchMetrics: async () => ({ reach: 100, impressions: 120, views: 0, likes: 8, comments: 2, saves: 3, shares: 4, engagementTotal: 17, engagementRate: 17 }),
    storeSnapshot: async (window) => { stored.push(window); return true; },
    markMeasuring: async () => { measured = true; },
  });
  assert.deepEqual(result, { due: ["h6"], stored: ["h6"], skipped: [] });
  assert.deepEqual(stored, ["h6"]);
  assert.equal(measured, true);
});

test("reconciliation reports drift and only suggests bounded status repairs", () => {
  const report = buildReconciliationReport({
    status: "published", approvedAt: null, scheduledAt: null, publishedAt: null,
    contentPostId: null, approvalAttemptId: null, approvalCommand: null,
  });
  assert.ok(report.issues.length >= 3);
  assert.ok(report.repairs.every((repair) => ["status", "publisherState", "publishStatus"].includes(repair.field)));
});

test("publishing intelligence uses controlled window until ten comparable live Meta samples", () => {
  const fallback = publishingRecommendation({ testPublishWindow: "19:00-21:00 WIB", comparable: [] });
  assert.equal(fallback.basis, "controlled_test_window");
  assert.equal(fallback.sampleCount, 0);
  assert.equal(fallback.confidence, "low");
  const comparable = Array.from({ length: 10 }, (_, index) => ({ publishedAt: new Date(`2026-08-${String(index + 1).padStart(2, "0")}T12:30:00.000Z`), engagementRate: index + 1 }));
  const recommendation = publishingRecommendation({ testPublishWindow: "19:00-21:00 WIB", comparable });
  assert.equal(recommendation.basis, "account_performance");
  assert.equal(recommendation.sampleCount, 10);
  assert.match(recommendation.recommendedWindow, /WIB/);
});

test("metric windows become due once and velocity uses elapsed hours", () => {
  const publishedAt = new Date("2026-08-01T00:00:00.000Z");
  assert.deepEqual(dueMetricWindows(publishedAt, new Date("2026-08-01T07:00:00.000Z"), new Set(["h1"])), ["h6"]);
  assert.deepEqual(dueMetricWindows(publishedAt, new Date("2026-08-08T00:00:00.000Z"), new Set(["h1", "h6", "h24", "h72"])), ["d7"]);
  assert.equal(computeEarlyVelocity(40, new Date("2026-08-01T06:00:00.000Z"), 10, new Date("2026-08-01T01:00:00.000Z")), 6);
});

test("Meta normalization handles media fields, insights, and total_interactions without inventing values", () => {
  assert.deepEqual(normalizeMetaMetrics({ like_count: 8, comments_count: 2 }, [{ name: "reach", values: [{ value: 100 }] }, { name: "saved", values: [{ value: 3 }] }, { name: "shares", values: [{ value: 4 }] }, { name: "total_interactions", values: [{ value: 22 }] }]), {
    reach: 100, impressions: 0, views: 0, likes: 8, comments: 2, saves: 3, shares: 4, engagementTotal: 22, engagementRate: 22,
  });
});

test("internal bearer auth fails closed and compares exact tokens", () => {
  const request = (value?: string) => new Request("http://local", { headers: value ? { authorization: value } : {} });
  assert.throws(() => authorizeInternalRequest(request("Bearer x"), undefined), /not configured/);
  assert.throws(() => authorizeInternalRequest(request("Bearer wrong"), "right"), /Unauthorized/);
  assert.doesNotThrow(() => authorizeInternalRequest(request("Bearer right"), "right"));
});

test("analytics auto mode exercises the database seam for the selected account", async () => {
  let where: unknown;
  const client = { postMetric: { count: async (query: unknown) => { where = query; return 1; } } } as unknown as OperationsDb;
  assert.deepEqual(await resolveAnalyticsMode("auto", "00000000-0000-4000-8000-000000000001", client), { dataMode: "live", source: "live" });
  assert.deepEqual(where, { where: { source: "meta", contentPost: { socialAccountId: "00000000-0000-4000-8000-000000000001" } } });
});

test("publish-result replay is idempotent at the transactional database seam", async () => {
  const plan = { id: "plan", status: "published", approvalAttemptId: "00000000-0000-4000-8000-000000000001", contentPost: { instagramMediaId: "media" }, assets: [] };
  let writes = 0;
  const tx = {
    contentPlanItem: { findUnique: async () => plan, update: async () => { writes += 1; } },
    contentPost: { update: async () => { writes += 1; } },
    contentPlanAsset: { updateMany: async () => { writes += 1; } },
  };
  const client = { $transaction: async (run: (value: typeof tx) => unknown) => run(tx) } as unknown as OperationsDb;
  const result = await recordPublishResult("content", {
    success: true,
    approvalAttemptId: "00000000-0000-4000-8000-000000000001",
    instagramMediaId: "media",
    publishedAt: "2026-08-24T00:00:00.000Z",
    permalink: "https://www.instagram.com/p/example/",
  }, client);
  assert.equal(result, plan);
  assert.equal(writes, 0);
});

test("Meta client is injected, read-only, and keeps the token out of URLs", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, authorization: new Headers(init?.headers).get("authorization") });
    return new Response(JSON.stringify(url.includes("/insights?") ? { data: [{ name: "reach", values: [{ value: 10 }] }] } : { like_count: 2, comments_count: 1 }), { status: 200 });
  }) as typeof fetch;
  const client = new MetaInsightsClient("private-token", fetcher, "https://graph.invalid/v23.0");
  const metrics = await client.getMediaMetrics("media-id");
  assert.equal(metrics.reach, 10);
  assert.equal(requests.length, 8);
  assert.ok(requests.every(({ url, authorization }) => !url.includes("private-token") && authorization === "Bearer private-token"));
  assert.equal("publish" in client, false);
});

test("publish-result service rejects stale approval attempts before any write", async () => {
  let writes = 0;
  const tx = {
    contentPlanItem: {
      findUnique: async () => ({ id: "plan", approvalAttemptId: "00000000-0000-4000-8000-000000000001", status: "scheduled", contentPost: null, assets: [] }),
      update: async () => { writes += 1; },
    },
  };
  const client = { $transaction: async (run: (value: typeof tx) => unknown) => run(tx) } as unknown as OperationsDb;
  await assert.rejects(() => recordPublishResult("content", {
    success: false,
    approvalAttemptId: "00000000-0000-4000-8000-000000000002",
    error: "failed",
  }, client), /approved attempt/);
  assert.equal(writes, 0);
});

test("operational migration is additive and prior deployed migration hashes stay documented", () => {
  const migration = readFileSync(new URL("../prisma/migrations/20260824180000_add_content_operations/migration.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/);
  for (const field of ["content_post_id", "approved_at", "approval_command", "approval_attempt_id", "scheduled_at", "published_at", "source", "snapshot_window", "early_engagement_velocity"]) assert.ok(migration.includes(`\`${field}\``), field);
  assert.match(migration, /CREATE TABLE `content_plan_assets`/);
});
