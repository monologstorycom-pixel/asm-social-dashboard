import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildPostWhere, latestMetricByPost, sortPosts } from "../src/lib/post-query";
import { compareQuerySchema, metricSchema, postFiltersSchema } from "../src/lib/validation";

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
];

test("compare accepts two through five unique post ids", () => {
  assert.deepEqual(compareQuerySchema.parse({ ids: ids.slice(0, 2).join(",") }).ids, ids.slice(0, 2));
  assert.equal(compareQuerySchema.safeParse({ ids: ids[0] }).success, false);
  assert.equal(compareQuerySchema.safeParse({ ids: ids.slice(0, 6).join(",") }).success, false);
  assert.equal(compareQuerySchema.safeParse({ ids: `${ids[0]},${ids[0]}` }).success, false);
});

test("post filters validate dates, search, and supported sort fields", () => {
  assert.equal(postFiltersSchema.safeParse({ dateFrom: "2026-08-24", dateTo: "2026-08-01" }).success, false);
  assert.equal(postFiltersSchema.safeParse({ sort: "likes" }).success, false);
  const parsed = postFiltersSchema.parse({ search: " launch ", sort: "engagementRate", order: "asc" });
  assert.equal(parsed.search, "launch");
  assert.equal(parsed.sort, "engagementRate");
  assert.equal(parsed.order, "asc");
});

test("post where builder combines shared filters and search", () => {
  const filters = postFiltersSchema.parse({
    account: ids[0],
    search: "launch",
    topic: "campaign",
    pillar: "education",
    style: "editorial_magazine",
    type: "carousel",
    status: "published",
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
  });
  const where = buildPostWhere(filters);
  assert.equal(where.socialAccountId, ids[0]);
  assert.deepEqual(where.topic, { contains: "campaign" });
  assert.equal(where.contentPillar, "education");
  assert.deepEqual(where.OR, [{ title: { contains: "launch" } }, { caption: { contains: "launch" } }, { topic: { contains: "launch" } }]);
  assert.deepEqual(where.publishedAt, {
    gte: new Date("2026-08-01T00:00:00.000Z"),
    lte: new Date("2026-08-31T23:59:59.999Z"),
  });
});

test("metric input derives a consistent engagement total and rate", () => {
  const metric = metricSchema.parse({ capturedAt: "2026-08-24T10:00:00.000Z", reach: 100, likes: 10, comments: 2, saves: 3, shares: 5 });
  assert.equal(metric.engagementTotal, 20);
  assert.equal(metric.engagementRate, 20);
});

test("latest metric selection keeps newest immutable snapshot", () => {
  const snapshots = [
    { contentPostId: ids[0], capturedAt: new Date("2026-08-01"), reach: 10 },
    { contentPostId: ids[0], capturedAt: new Date("2026-08-03"), reach: 30 },
    { contentPostId: ids[1], capturedAt: new Date("2026-08-02"), reach: 20 },
  ];
  const latest = latestMetricByPost(snapshots);
  assert.equal(latest.get(ids[0])?.reach, 30);
  assert.equal(latest.get(ids[1])?.reach, 20);
  assert.equal(snapshots.length, 3);
});

test("post metric sorting uses latest snapshots and requested direction", () => {
  const rows = [
    { id: ids[0], publishedAt: new Date("2026-08-02"), metrics: [{ reach: 10, saves: 2, shares: 1, engagementRate: 5 }] },
    { id: ids[1], publishedAt: new Date("2026-08-01"), metrics: [{ reach: 30, saves: 3, shares: 4, engagementRate: 9 }] },
  ];
  assert.deepEqual(sortPosts(rows, "reach", "desc").map(({ id }) => id), [ids[1], ids[0]]);
  assert.deepEqual(sortPosts(rows, "publishDate", "asc").map(({ id }) => id), [ids[1], ids[0]]);
});

test("Prisma schema and initial migration preserve exact V1 database names", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../prisma/migrations/20260824000000_init/migration.sql", import.meta.url), "utf8");
  for (const name of ["account_name", "platform_account_id", "social_account_id", "content_pillar", "content_type", "creative_style", "slide_count", "instagram_media_id", "public_url", "content_post_id", "asset_type", "slide_number", "asset_url", "engagement_total", "engagement_rate", "planned_at", "experiment_type", "started_at", "ended_at"]) {
    assert.match(schema, new RegExp(`@map\\(\\"${name}\\"\\)`), name);
    assert.ok(migration.includes("`" + name + "`"), name);
  }
  for (const name of ["username", "views"]) {
    assert.match(schema, new RegExp(`\\b${name}\\s+`), name);
    assert.ok(migration.includes("`" + name + "`"), name);
  }
  for (const value of ["idea", "draft", "review", "approved", "scheduled", "published", "failed", "education", "product", "comparison", "inspiration", "promotion", "brand", "editorial_no_box", "editorial_magazine", "infographic", "architectural", "product_photography"]) {
    assert.match(schema, new RegExp(`\\b${value}\\b`), value);
  }
  assert.match(migration, /CREATE TRIGGER `post_metrics_no_update`/);
});
