import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  analyticsSourceFilters,
  assertGeneralTransition,
  assertLifecycleInvariants,
  authorizeDashboardRequest,
  authorizeInternalRequest,
  buildReconciliationReport,
  computeEarlyVelocity,
  dueMetricWindows,
  mapMediaToAssets,
  mapMetaMediaToPost,
  mapPlanFields,
  jakartaDateKey,
  latestSnapshotAt,
  normalizeMetaMetrics,
  parsePublishWindow,
  publishingRecommendation,
  resolveDataMode,
  syncMetricWindows,
  validateApprovalCommand,
  validateScheduledAt,
} from "../src/lib/operations";
import { MetaInsightsClient } from "../src/lib/meta";
import { importLiveMetaMedia, recordPublishResult, resolveAnalyticsMode, type OperationsDb } from "../src/lib/operations-db";

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

test("analytics freshness uses the newest selected snapshot", () => {
  assert.equal(latestSnapshotAt([[new Date("2026-08-24T01:00:00.000Z")], [], [new Date("2026-08-24T03:00:00.000Z")]]), "2026-08-24T03:00:00.000Z");
  assert.equal(latestSnapshotAt([[]]), null);
  const overview = readFileSync(new URL("../src/app/api/dashboard/overview/route.ts", import.meta.url), "utf8");
  assert.match(overview, /freshness:\s*\{\s*latestSnapshotAt:\s*asOf\s*\}/);
});

test("overview groups snapshots by Asia/Jakarta calendar day", () => {
  assert.equal(jakartaDateKey(new Date("2026-08-24T16:59:59.000Z")), "2026-08-24");
  assert.equal(jakartaDateKey(new Date("2026-08-24T17:00:00.000Z")), "2026-08-25");
  const route = readFileSync(new URL("../src/app/api/dashboard/overview/route.ts", import.meta.url), "utf8");
  assert.match(route, /const date = jakartaDateKey\(metric\.capturedAt\)/);
});

test("overview badge uses API freshness instead of top-post timestamps", () => {
  const overview = readFileSync(new URL("../src/app/overview-client.tsx", import.meta.url), "utf8");
  assert.match(overview, /capturedAt=\{data\?\.freshness\.latestSnapshotAt\}/);
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

test("reconciliation always downgrades to the last fully evidenced state", () => {
  const missingApproval = buildReconciliationReport({
    status: "published", approvedAt: new Date(), scheduledAt: new Date(), publishedAt: new Date(),
    contentPostId: "post", approvalAttemptId: null, approvalCommand: "APPROVE & PUBLISH",
  });
  assert.equal(missingApproval.repairs.find(({ field }) => field === "status")?.value, "ready_for_review");
  const missingPost = buildReconciliationReport({
    status: "published", approvedAt: new Date(), scheduledAt: new Date(), publishedAt: new Date(),
    contentPostId: null, approvalAttemptId: "attempt", approvalCommand: "APPROVE & PUBLISH",
  });
  assert.equal(missingPost.repairs.find(({ field }) => field === "status")?.value, "scheduled");
  assert.ok(missingPost.repairs.every((repair) => ["status", "publisherState", "publishStatus"].includes(repair.field)));
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

test("metric sync captures only the current due window and never backfills stale windows", () => {
  const publishedAt = new Date("2026-08-01T00:00:00.000Z");
  assert.deepEqual(dueMetricWindows(publishedAt, new Date("2026-08-01T07:00:00.000Z"), new Set()), ["h6"]);
  assert.deepEqual(dueMetricWindows(publishedAt, new Date("2026-08-01T07:00:00.000Z"), new Set(["h1"])), ["h6"]);
  assert.deepEqual(dueMetricWindows(publishedAt, new Date("2026-08-08T00:00:00.000Z"), new Set(["h1", "h6", "h24", "h72"])), ["d7"]);
  assert.equal(computeEarlyVelocity(40, new Date("2026-08-01T06:00:00.000Z"), 10, new Date("2026-08-01T01:00:00.000Z")), 6);
});

test("Meta media import maps provider fields without inventing analytics", () => {
  assert.deepEqual(mapMetaMediaToPost({
    id: "media", caption: "Real caption", media_type: "CAROUSEL_ALBUM", media_product_type: "FEED",
    permalink: "https://www.instagram.com/p/example/", timestamp: "2026-08-25T12:00:00+0000", children: { data: [{ id: "a" }, { id: "b" }] },
  }), {
    instagramMediaId: "media", title: "Real caption", caption: "Real caption", contentPillar: "unclassified",
    topic: "unclassified", contentType: "carousel", creativeStyle: "unclassified", slideCount: 2,
    status: "published", permalink: "https://www.instagram.com/p/example/", publicUrl: "https://www.instagram.com/p/example/",
    publishedAt: new Date("2026-08-25T12:00:00+0000"), source: "live",
  });
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
  assert.equal(requests.length, 9);
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

test("Meta sync routes cannot spoof capture time", () => {
  for (const path of [
    "../src/app/api/internal/meta/sync-due/route.ts",
    "../src/app/api/internal/content-plan/[contentId]/meta-sync/route.ts",
  ]) assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /searchParams|get\("now"\)|queryObject/);
});

test("operational lifecycle writes use conditional compare-and-set", () => {
  for (const path of [
    "../src/app/api/internal/content-plan/[contentId]/approve/route.ts",
    "../src/app/api/internal/content-plan/[contentId]/artifacts/route.ts",
    "../src/app/api/internal/content-plan/[contentId]/schedule/route.ts",
  ]) assert.match(readFileSync(new URL(path, import.meta.url), "utf8"), /updateMany\(/, path);
});

test("every non-preview mutation route requires internal bearer authentication", () => {
  for (const path of [
    "../src/app/api/posts/route.ts",
    "../src/app/api/internal/meta/import/route.ts",
    "../src/app/api/posts/[id]/route.ts",
    "../src/app/api/posts/[id]/metrics/route.ts",
    "../src/app/api/content-plan/import/route.ts",
    "../src/app/api/content-plan/[contentId]/status/route.ts",
  ]) {
    const route = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(route, /authorizeInternalRequest\(request\)/, path);
  }
});

test("authenticated dashboard mutations require a same-origin browser request", () => {
  const sameOrigin = new Request("https://sosmedasm.rsby.cloud/api/dashboard/content-plan/ASM-1/approve", { headers: { origin: "https://sosmedasm.rsby.cloud", "sec-fetch-site": "same-origin" } });
  assert.doesNotThrow(() => authorizeDashboardRequest(sameOrigin));
  const crossOrigin = new Request(sameOrigin.url, { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
  assert.throws(() => authorizeDashboardRequest(crossOrigin), /Unauthorized/);
});

test("content plan dashboard approval uses a server-only bearer bridge", () => {
  const route = readFileSync(new URL("../src/app/api/dashboard/content-plan/[contentId]/approve/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/app/content-plan/content-plan-client.tsx", import.meta.url), "utf8");
  assert.match(route, /authorizeDashboardRequest\(request\)/);
  assert.match(route, /process\.env\.INTERNAL_API_TOKEN/);
  assert.match(client, /\/api\/dashboard\/content-plan\/.*\/approve/);
  assert.doesNotMatch(client, /INTERNAL_API_TOKEN|Authorization.*Bearer/);
});

test("operational migration is additive and prior deployed migration hashes stay documented", () => {
  const migration = readFileSync(new URL("../prisma/migrations/20260824180000_add_content_operations/migration.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|CHECK\s*\(/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS `permalink`/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS `content_posts_instagram_media_id_key`/);
  for (const field of ["content_post_id", "approved_at", "approval_command", "approval_attempt_id", "scheduled_at", "published_at", "source", "snapshot_window", "early_engagement_velocity"]) assert.ok(migration.includes(`\`${field}\``), field);
  assert.match(migration, /CREATE TABLE `content_plan_assets`/);
});

test("mapMediaToAssets maps IMAGE media to a single image asset", () => {
  const assets = mapMediaToAssets("post-1", {
    id: "media-1",
    media_type: "IMAGE",
    media_url: "https://example.com/image.jpg",
    permalink: "https://www.instagram.com/p/test/",
    timestamp: "2026-08-25T12:00:00+0000",
  });
  assert.equal(assets.length, 1);
  assert.equal(assets[0].assetType, "image");
  assert.equal(assets[0].assetUrl, "https://example.com/image.jpg");
  assert.equal(assets[0].slideNumber, 1);
});

test("mapMediaToAssets maps VIDEO to video with thumbnail_url fallback", () => {
  const withThumbnail = mapMediaToAssets("post-2", {
    id: "media-2",
    media_type: "VIDEO",
    media_url: "https://example.com/video.mp4",
    thumbnail_url: "https://example.com/thumb.jpg",
    permalink: "https://www.instagram.com/p/test/",
    timestamp: "2026-08-25T12:00:00+0000",
  });
  assert.deepEqual(withThumbnail, [{
    assetType: "thumbnail",
    assetUrl: "https://example.com/thumb.jpg",
    slideNumber: 1,
  }]);

  const noThumbnail = mapMediaToAssets("post-2b", {
    id: "media-2b",
    media_type: "VIDEO",
    media_url: "https://example.com/video.mp4",
    permalink: "https://www.instagram.com/p/test/",
    timestamp: "2026-08-25T12:00:00+0000",
  });
  assert.equal(noThumbnail.length, 1);
  assert.equal(noThumbnail[0].assetType, "video");
  assert.equal(noThumbnail[0].assetUrl, "https://example.com/video.mp4");
});

test("mapMediaToAssets maps CAROUSEL children in order with video thumbnail fallback", () => {
  const assets = mapMediaToAssets("post-3", {
    id: "media-3",
    media_type: "CAROUSEL_ALBUM",
    permalink: "https://www.instagram.com/p/test/",
    timestamp: "2026-08-25T12:00:00+0000",
    children: {
      data: [
        { id: "c1", media_type: "IMAGE", media_url: "https://example.com/c1.jpg" },
        { id: "c2", media_type: "VIDEO", media_url: "https://example.com/c2.mp4", thumbnail_url: "https://example.com/c2-thumb.jpg" },
        { id: "c3", media_type: "IMAGE", media_url: "https://example.com/c3.jpg" },
      ],
    },
  });
  assert.deepEqual(assets, [
    { assetType: "image", assetUrl: "https://example.com/c1.jpg", slideNumber: 1 },
    { assetType: "thumbnail", assetUrl: "https://example.com/c2-thumb.jpg", slideNumber: 2 },
    { assetType: "image", assetUrl: "https://example.com/c3.jpg", slideNumber: 3 },
  ]);
});

test("mapMediaToAssets returns empty array when no children or media_url", () => {
  const assets = mapMediaToAssets("post-4", {
    id: "media-4",
    media_type: "CAROUSEL_ALBUM",
    permalink: "https://www.instagram.com/p/test/",
    timestamp: "2026-08-25T12:00:00+0000",
    children: { data: [] },
  });
  assert.equal(assets.length, 0);
});

test("mapMetaMediaToPost sets permalink and publicUrl from media permalink", () => {
  const post = mapMetaMediaToPost({
    id: "media-5",
    media_type: "IMAGE",
    permalink: "https://www.instagram.com/p/test/",
    timestamp: "2026-08-25T12:00:00+0000",
  });
  assert.equal(post.permalink, "https://www.instagram.com/p/test/");
  assert.equal(post.publicUrl, "https://www.instagram.com/p/test/");
});

test("importLiveMetaMedia fails closed when META_IG_USER_ID is missing", async () => {
  const previous = process.env.META_IG_USER_ID;
  delete process.env.META_IG_USER_ID;
  try {
    await assert.rejects(() => importLiveMetaMedia(), /META_IG_USER_ID is not configured/);
  } finally {
    if (previous === undefined) delete process.env.META_IG_USER_ID;
    else process.env.META_IG_USER_ID = previous;
  }
});

test("importLiveMetaMedia fetches all Meta GETs before one transaction and upserts assets idempotently", async () => {
  const media = [
    { id: "m1", media_type: "IMAGE", media_url: "https://example.com/img.jpg", permalink: "https://www.instagram.com/p/1/", timestamp: "2026-08-25T12:00:00+0000" },
    { id: "m2", media_type: "VIDEO", media_url: "https://example.com/vid.mp4", thumbnail_url: "https://example.com/vid-thumb.jpg", permalink: "https://www.instagram.com/p/2/", timestamp: "2026-08-25T13:00:00+0000" },
  ];
  const getMediaDetailCalls: string[] = [];
  let getMetricsCalls = 0;
  let transactionStarted = false;

  const meta = {
    getAccountProfile: async () => ({ id: "12345", name: "ASM Profile", username: "asm.profile", profile_picture_url: "https://example.com/profile.jpg", followers_count: 321, media_count: 45 }),
    listAccountMedia: async () => media,
    getMediaDetail: async (mediaId: string) => { getMediaDetailCalls.push(mediaId); return media.find((m) => m.id === mediaId)!; },
    getMediaMetrics: async () => { getMetricsCalls += 1; return { reach: 0, impressions: 0, views: 0, likes: 0, comments: 0, saves: 0, shares: 0, engagementTotal: 0, engagementRate: 0 }; },
  } as unknown as InstanceType<typeof MetaInsightsClient>;

  let postUpserts = 0;
  let accountUpsert: unknown;
  const client = {
    socialAccount: { upsert: async (query: unknown) => { accountUpsert = query; return { id: "acct" }; } },
    contentPost: {
      findUnique: async () => null,
      upsert: async () => { postUpserts += 1; return { id: `post-${postUpserts}` }; },
    },
    postMetric: { findUnique: async () => null, create: async () => ({}) },
    postAsset: { findUnique: async () => null, create: async () => ({}) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => { transactionStarted = true; return fn(client); },
  } as unknown as OperationsDb;

  const result = await importLiveMetaMedia("12345", new Date(), client, meta);

  assert.ok(getMediaDetailCalls.length >= 2, "getMediaDetail must be called for each media item");
  assert.equal(getMetricsCalls, 2, "getMediaMetrics must be called for each media item");
  assert.ok(transactionStarted, "all Meta GETs must complete before transaction");
  assert.equal(result.imported, 2);
  assert.equal(result.assets, 2, "each Instagram item produces one preview asset");
  assert.deepEqual(accountUpsert, {
    where: { platform_platformAccountId: { platform: "instagram", platformAccountId: "12345" } },
    create: { platform: "instagram", platformAccountId: "12345", accountName: "ASM Profile", username: "asm.profile", profilePictureUrl: "https://example.com/profile.jpg", followersCount: 321, mediaCount: 45 },
    update: { active: true, accountName: "ASM Profile", username: "asm.profile", profilePictureUrl: "https://example.com/profile.jpg", followersCount: 321, mediaCount: 45 },
  });
});

test("importLiveMetaMedia skips demo posts and is idempotent for live re-import", async () => {
  const media = [{ id: "m1", media_type: "IMAGE", media_url: "https://example.com/img.jpg", permalink: "https://www.instagram.com/p/1/", timestamp: "2026-08-25T12:00:00+0000" }];

  const meta = {
    getAccountProfile: async () => ({ id: "12345", name: "ASM Profile", username: "asm.profile", profile_picture_url: "https://example.com/profile.jpg", followers_count: 321, media_count: 45 }),
    listAccountMedia: async () => media,
    getMediaDetail: async (id: string) => media.find((m) => m.id === id)!,
    getMediaMetrics: async () => ({ reach: 0, impressions: 0, views: 0, likes: 0, comments: 0, saves: 0, shares: 0, engagementTotal: 0, engagementRate: 0 }),
  } as unknown as InstanceType<typeof MetaInsightsClient>;

  let postCount = 0;
  const client = {
    socialAccount: { upsert: async () => ({ id: "acct" }) },
    contentPost: {
      findUnique: async (q: { where: { instagramMediaId: string } }) => {
        if (q.where.instagramMediaId === "m1") return { id: "existing", source: "demo" };
        return null;
      },
      upsert: async () => { postCount += 1; return { id: "existing" }; },
    },
    postMetric: { findUnique: async () => null, create: async () => ({}) },
    postAsset: { findUnique: async () => null, create: async () => ({}) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  } as unknown as OperationsDb;

  await assert.rejects(() => importLiveMetaMedia("12345", new Date(), client, meta), /demo post/);
  assert.equal(postCount, 0, "must not upsert demo posts");
});

test("importLiveMetaMedia refreshes an existing ad_hoc insight snapshot", async () => {
  const media = [{ id: "m1", media_type: "IMAGE", permalink: "https://www.instagram.com/p/1/", timestamp: "2026-08-25T12:00:00+0000" }];
  const metrics = { reach: 2, impressions: 3, views: 4, likes: 1, comments: 0, saves: 0, shares: 0, engagementTotal: 1, engagementRate: 50 };
  const meta = {
    getAccountProfile: async () => ({ id: "12345", name: "ASM Profile", username: "asm.profile", profile_picture_url: "https://example.com/profile.jpg", followers_count: 321, media_count: 45 }),
    listAccountMedia: async () => media,
    getMediaDetail: async () => media[0],
    getMediaMetrics: async () => metrics,
  } as unknown as InstanceType<typeof MetaInsightsClient>;
  const ops: string[] = [];
  const client = {
    socialAccount: { upsert: async () => ({ id: "acct" }) },
    contentPost: { findUnique: async () => ({ id: "post-1", source: "live" }), upsert: async () => ({ id: "post-1" }) },
    postMetric: {
      findUnique: async () => ({ id: "metric-1" }),
      deleteMany: async () => { ops.push("deleteMany"); return { count: 1 }; },
      create: async (query: unknown) => { ops.push(`create:${JSON.stringify(query)}`); return {}; },
    },
    postAsset: { findUnique: async () => null, create: async () => ({}) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  } as unknown as OperationsDb;
  const capturedAt = new Date("2026-09-05T00:00:00.000Z");

  const result = await importLiveMetaMedia("12345", capturedAt, client, meta);

  assert.ok(ops.includes("deleteMany"), "should delete existing snapshot before creating new one");
  assert.ok(ops.some((op) => op.startsWith("create:")), "should create new snapshot after delete");
  assert.equal(result.snapshots, 0);
  assert.equal(result.existingSnapshots, 1);
});

test("importLiveMetaMedia asset upsert is idempotent for live re-import", async () => {
  const media = [{ id: "m1", media_type: "IMAGE", media_url: "https://example.com/img.jpg", permalink: "https://www.instagram.com/p/1/", timestamp: "2026-08-25T12:00:00+0000" }];

  const meta = {
    getAccountProfile: async () => ({ id: "12345", name: "ASM Profile", username: "asm.profile", profile_picture_url: "https://example.com/profile.jpg", followers_count: 321, media_count: 45 }),
    listAccountMedia: async () => media,
    getMediaDetail: async (id: string) => media.find((m) => m.id === id)!,
    getMediaMetrics: async () => ({ reach: 0, impressions: 0, views: 0, likes: 0, comments: 0, saves: 0, shares: 0, engagementTotal: 0, engagementRate: 0 }),
  } as unknown as InstanceType<typeof MetaInsightsClient>;

  let assetCreates = 0;
  const client = {
    socialAccount: { upsert: async () => ({ id: "acct" }) },
    contentPost: {
      findUnique: async () => null,
      upsert: async () => { return { id: "post-1" }; },
    },
    postMetric: { findUnique: async () => null, create: async () => ({}) },
    postAsset: {
      findUnique: async (q: { where: { contentPostId_slideNumber: { contentPostId: string; slideNumber: number } } }) => {
        if (q.where.contentPostId_slideNumber.slideNumber === 1) return { id: "asset-1", assetUrl: "https://example.com/img.jpg" };
        return null;
      },
      create: async () => { assetCreates += 1; return {}; },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  } as unknown as OperationsDb;

  const result = await importLiveMetaMedia("12345", new Date(), client, meta);
  assert.equal(assetCreates, 0, "must not create duplicate assets for idempotent re-import");
  assert.equal(result.assets, 1, "must count existing assets");
});

test("importLiveMetaMedia returns useful counts including assets", async () => {
  const media = [
    { id: "m1", media_type: "IMAGE", media_url: "https://example.com/img.jpg", permalink: "https://www.instagram.com/p/1/", timestamp: "2026-08-25T12:00:00+0000" },
    { id: "m2", media_type: "CAROUSEL_ALBUM", permalink: "https://www.instagram.com/p/2/", timestamp: "2026-08-25T13:00:00+0000",
      children: { data: [
        { id: "c1", media_type: "IMAGE", media_url: "https://example.com/c1.jpg" },
        { id: "c2", media_type: "IMAGE", media_url: "https://example.com/c2.jpg" },
      ] },
    },
  ];

  const meta = {
    getAccountProfile: async () => ({ id: "12345", name: "ASM Profile", username: "asm.profile", profile_picture_url: "https://example.com/profile.jpg", followers_count: 321, media_count: 45 }),
    listAccountMedia: async () => media,
    getMediaDetail: async (id: string) => media.find((m) => m.id === id)!,
    getMediaMetrics: async () => ({ reach: 0, impressions: 0, views: 0, likes: 0, comments: 0, saves: 0, shares: 0, engagementTotal: 0, engagementRate: 0 }),
  } as unknown as InstanceType<typeof MetaInsightsClient>;

  let assetCount = 0;
  const client = {
    socialAccount: { upsert: async () => ({ id: "acct" }) },
    contentPost: {
      findUnique: async () => null,
      upsert: async () => { assetCount += 1; return { id: `post-${assetCount}` }; },
    },
    postMetric: { findUnique: async () => null, create: async () => ({}) },
    postAsset: { findUnique: async () => null, create: async () => ({}) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  } as unknown as OperationsDb;

  const result = await importLiveMetaMedia("12345", new Date(), client, meta);
  assert.equal(result.imported, 2);
  assert.equal(result.assets, 3, "1 image asset + 2 carousel child assets");
});

test("Meta client getMediaDetail fetches individual media detail with URL fields", async () => {
  const requests: Array<{ url: string }> = [];
  const fetcher = (async (input: string | URL | Request) => {
    requests.push({ url: String(input) });
    return new Response(JSON.stringify({ id: "media-1", media_type: "IMAGE", media_url: "https://example.com/img.jpg", permalink: "https://www.instagram.com/p/test/", timestamp: "2026-08-25T12:00:00+0000" }), { status: 200 });
  }) as typeof fetch;
  const client = new MetaInsightsClient("token", fetcher, "https://graph.invalid/v23.0");
  const detail = await client.getMediaDetail("media-1");
  assert.equal(detail.media_url, "https://example.com/img.jpg");
  assert.equal(detail.permalink, "https://www.instagram.com/p/test/");
  assert.equal(requests.length, 1);
});

test("Meta client listAccountMedia returns media_url and thumbnail_url fields", async () => {
  const fetcher = (async () => new Response(JSON.stringify({ data: [
    { id: "m1", media_type: "IMAGE", media_url: "https://example.com/img.jpg", permalink: "https://www.instagram.com/p/1/", timestamp: "2026-08-25T12:00:00+0000", children: { data: [] } },
    { id: "m2", media_type: "VIDEO", media_url: "https://example.com/vid.mp4", thumbnail_url: "https://example.com/thumb.jpg", permalink: "https://www.instagram.com/p/2/", timestamp: "2026-08-25T13:00:00+0000" },
  ] }), { status: 200 })) as typeof fetch;
  const client = new MetaInsightsClient("token", fetcher, "https://graph.invalid/v23.0");
  const items = await client.listAccountMedia("12345", 2);
  assert.equal(items.length, 2);
  assert.equal(items[0].media_url, "https://example.com/img.jpg");
  assert.equal(items[1].thumbnail_url, "https://example.com/thumb.jpg");
});

test("Meta client listAccountMedia follows after cursors up to the requested operational limit", async () => {
  const requests: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    if (requests.length === 1) return new Response(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }], paging: { cursors: { after: "cursor-2" } } }), { status: 200 });
    return new Response(JSON.stringify({ data: [{ id: "m3" }, { id: "m4" }], paging: { cursors: { after: "cursor-4" } } }), { status: 200 });
  }) as typeof fetch;
  const client = new MetaInsightsClient("token", fetcher, "https://graph.invalid/v23.0");

  const items = await client.listAccountMedia("12345", 3);

  assert.deepEqual(items.map(({ id }) => id), ["m1", "m2", "m3"]);
  assert.equal(requests.length, 2);
  assert.match(requests[1], /after=cursor-2/);
});

test("Meta client getAccountProfile fetches real Instagram profile fields", async () => {
  let request = "";
  const fetcher = (async (input: string | URL | Request) => {
    request = String(input);
    return new Response(JSON.stringify({ id: "12345", name: "ASM Profile", username: "asm.profile", profile_picture_url: "https://example.com/profile.jpg", followers_count: 321, media_count: 45 }), { status: 200 });
  }) as typeof fetch;
  const client = new MetaInsightsClient("token", fetcher, "https://graph.invalid/v23.0");

  const profile = await client.getAccountProfile("12345");

  assert.equal(profile.username, "asm.profile");
  assert.match(request, /fields=name%2Cusername%2Cprofile_picture_url%2Cfollowers_count%2Cmedia_count/);
});

test("Meta client is injected, read-only, and keeps the token out of URLs (extended)", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, authorization: new Headers(init?.headers).get("authorization") });
    return new Response(JSON.stringify(url.includes("/insights?") ? { data: [{ name: "reach", values: [{ value: 10 }] }] } : { like_count: 2, comments_count: 1, media_url: "https://example.com/media.jpg" }), { status: 200 });
  }) as typeof fetch;
  const client = new MetaInsightsClient("private-token", fetcher, "https://graph.invalid/v23.0");
  const metrics = await client.getMediaMetrics("media-id");
  assert.equal(metrics.reach, 10);
  assert.equal(requests.length, 9);
  assert.ok(requests.every(({ url, authorization }) => !url.includes("private-token") && authorization === "Bearer private-token"));
  assert.equal("publish" in client, false);
});
