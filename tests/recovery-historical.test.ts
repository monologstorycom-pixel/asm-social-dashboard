import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import test from "node:test";

import { historicalMetaSync } from "../src/lib/meta-history";
import { autoApproveAndSchedule } from "../src/lib/automation";
import { artifactSchema, assertStableAssetUrl } from "../src/lib/operations-api";
import {
  approvedAssetIdentity,
  assertApprovedAssetIdentity,
  preflightAssets,
  recoverFailedPublication,
  type RecoveryStore,
} from "../src/lib/publisher-recovery";

const payload = new Uint8Array(1024 * 1024).fill(97);
const sha = "9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360";
const asset = (overrides: Record<string, unknown> = {}) => ({ slideNumber: 1, publicUrl: "https://cdn.example/content/C-1/r1/1.png", mimeType: "image/png", sha256: sha, ...overrides });

test("artifact contract requires explicit revision and candidate", () => {
  const body = { socialAccountId: "bd5d0e4d-654b-48b1-a6b0-735ca6010ff0", caption: "x", finalBrief: "x", qaStatus: "passed", qaResult: "ok", revision: 2, candidate: "A", assets: [{ ...asset(), role: "final", final: true }] };
  assert.equal(artifactSchema.parse(body).revision, 2);
  assert.throws(() => artifactSchema.parse({ ...body, candidate: undefined }), /candidate/);
});

test("schedule performs network preflight outside interactive transaction", () => {
  const source = readFileSync(new URL("../src/app/api/internal/content-plan/[contentId]/schedule/route.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("await preflightAssets") < source.indexOf("db.$transaction"));
});

test("auto approval preflights the exact asset set before opening its CAS transaction", async () => {
  let transactionStarted = false;
  let fetched = false;
  const row = {
    id: "plan-1", contentId: "C-1", status: "ready_for_review", qaStatus: "passed", contentPostId: "post-1", finalCaption: "caption",
    assetRevision: 2, approvalVersion: 0, approvedAt: null, approvalAttemptId: null, approvedAssetSetHash: null, approvedCandidate: null,
    date: new Date("2026-09-20T00:00:00Z"), day: "Sunday", testPublishWindow: "09:00-10:00", pillar: "p", format: "carousel", topicTag: "t",
    assets: [{ slideNumber: 1, revision: 2, candidate: "A", isFinal: true, publicUrl: "https://assets.test/C-1/2/A/1.png", mimeType: "image/png", sha256: sha }],
    contentPost: { socialAccountId: "account-1" },
  };
  const tx = {
    contentPlanItem: {
      findUnique: async () => row,
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => ({ ...row, status: "approved", approvedAt: new Date(), approvalAttemptId: "attempt", approvalVersion: 1, approvedAssetSetHash: approvedAssetIdentity("C-1", 2, "A", row.assets), approvedCandidate: "A" }),
    },
    contentPost: { findUnique: async () => null, update: async () => ({}) },
    postMetric: { findMany: async () => [] },
  };
  const client = {
    contentPlanItem: { findUnique: async () => row },
    $transaction: async (callback: (value: typeof tx) => unknown) => { assert.equal(fetched, true); transactionStarted = true; return callback(tx); },
  };
  const fetcher = async () => { assert.equal(transactionStarted, false); fetched = true; return new Response(payload, { headers: { "content-type": "image/png" } }); };
  await autoApproveAndSchedule("C-1", client as never, { AUTO_APPROVAL: "true", AUTO_SCHEDULE: "false" }, fetcher as typeof fetch);
  assert.equal(fetched, true);
});

test("meta sync runner history invocation is bounded and exits nonzero on HTTP failure", async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => { requests.push(request.url || ""); response.writeHead(requests.length === 2 ? 500 : 200); response.end("ok"); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const run = (base: string, maxPages: string) => new Promise<number | null>((resolve) => {
    const child = spawn(process.execPath, ["scripts/meta-sync-runner.mjs", "history"], { cwd: new URL("..", import.meta.url), env: { ...process.env, ASM_SOCIAL_BASE_URL: base, INTERNAL_API_TOKEN: "test", META_HISTORY_MAX_PAGES: maxPages }, stdio: "ignore" });
    child.on("exit", resolve);
  });
  try {
    assert.equal(await run(`http://127.0.0.1:${address.port}`, "999999"), 0);
    assert.equal(requests[0], "/api/internal/meta/history?maxPages=100");
    assert.equal(await run(`http://127.0.0.1:${address.port}/fail`, "2"), 1);
  } finally { server.close(); }
});

test("stable artifact URL requires configured origin and deterministic content path", () => {
  const env = { ASSET_PUBLIC_BASE_URL: "https://assets.example/media" };
  assert.doesNotThrow(() => assertStableAssetUrl("https://assets.example/media/C-1/2/A/1.png", "C-1", 2, "A", 1, env));
  assert.throws(() => assertStableAssetUrl("https://cdn.example/C-1/2/A/1.png", "C-1", 2, "A", 1, env), /ASSET_PUBLIC_BASE_URL/);
  assert.throws(() => assertStableAssetUrl("https://assets.example/media/random/C-1/2/A/1.png", "C-1", 2, "A", 1, env), /deterministic/);
});

test("route contracts expose bounded history and recovery kill switch", () => {
  const history = readFileSync(new URL("../src/app/api/internal/meta/history/route.ts", import.meta.url), "utf8");
  const recovery = readFileSync(new URL("../src/app/api/internal/publisher/recover/route.ts", import.meta.url), "utf8");
  assert.match(history, /maxPages/);
  assert.match(history, /restart/);
  assert.match(recovery, /RECOVERY_ENABLED/);
  assert.doesNotMatch(recovery, /must be staging/);
  assert.match(recovery, /replacements/);
});

test("historical sync exhausts pagination, checkpoints every page, resumes, stays idempotent, and bounds concurrency", async () => {
  const pages: Record<string, { data: Array<{ id: string; media_type: "IMAGE"; permalink: string; timestamp: string }>; after?: string }> = {
    start: { data: [1, 2, 3].map((id) => ({ id: `m${id}`, media_type: "IMAGE", permalink: `https://instagram.test/p/${id}`, timestamp: "2026-01-01T00:00:00Z" })), after: "c1" },
    c1: { data: [4, 5].map((id) => ({ id: `m${id}`, media_type: "IMAGE", permalink: `https://instagram.test/p/${id}`, timestamp: "2026-01-01T00:00:00Z" })) },
  };
  let active = 0, peak = 0;
  const checkpoints: Array<string | null> = [];
  const imported = new Set<string>(["m1"]);
  const result = await historicalMetaSync({
    accountId: "123",
    concurrency: 2,
    batchSize: 2,
    loadCheckpoint: async () => "start",
    listPage: async (_id, cursor) => pages[cursor || "start"],
    processMedia: async (item) => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 2)); active--; if (imported.has(item.id)) return "skipped"; imported.add(item.id); return "imported"; },
    saveCheckpoint: async (cursor) => { checkpoints.push(cursor); },
    profile: async () => ({ mediaCount: 5 }),
  });
  assert.deepEqual(result, { profile: { mediaCount: 5 }, api: 5, imported: 4, skipped: 1, failed: 0, unsupported: 0, checkpoint: null, coverage: { processed: 5, expected: 5, complete: true }, syncTime: result.syncTime });
  assert.deepEqual(checkpoints, ["c1", null]);
  assert.ok(peak <= 2 && peak > 1);
});

test("historical sync preserves failed-page cursor and classifies unsupported media", async () => {
  const checkpoints: Array<string | null> = [];
  const result = await historicalMetaSync({
    accountId: "123", concurrency: 1, batchSize: 10,
    loadCheckpoint: async () => "resume",
    listPage: async () => ({ data: [{ id: "x" } as never, { id: "y" } as never], after: "next" }),
    processMedia: async (item) => item.id === "x" ? "unsupported" : "failed",
    saveCheckpoint: async (cursor) => { checkpoints.push(cursor); },
    profile: async () => ({ mediaCount: 2 }),
    maxPages: 1,
  });
  assert.equal(result.unsupported, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.checkpoint, "resume", "failed page must resume from its starting cursor");
  assert.deepEqual(checkpoints, []);
});

test("incremental import remains one page and does not invoke historical orchestration", async () => {
  let pages = 0;
  const result = await historicalMetaSync({ accountId: "123", concurrency: 1, batchSize: 10, loadCheckpoint: async () => null, listPage: async () => { pages++; return { data: [], after: "ignored" }; }, processMedia: async () => "imported", saveCheckpoint: async () => {}, profile: async () => ({ mediaCount: 0 }), maxPages: 1 });
  assert.equal(pages, 1);
  assert.equal(result.api, 0);
});

test("asset preflight rejects 404, MIME mismatch, hash mismatch, expired temporary URL, and wrong order", async () => {
  const fetcher = async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("404")) return new Response("", { status: 404 });
    if (url.includes("wrong-mime")) return new Response("abc", { headers: { "content-type": "text/html", "content-length": "3" } });
    return new Response(payload, { headers: { "content-type": "image/png", "content-length": String(payload.length) } });
  };
  await assert.rejects(() => preflightAssets([asset({ publicUrl: "https://cdn.example/404.png" })], fetcher as typeof fetch), /HTTP 200/);
  await assert.rejects(() => preflightAssets([asset({ publicUrl: "https://cdn.example/wrong-mime.png" })], fetcher as typeof fetch), /MIME/);
  await assert.rejects(() => preflightAssets([asset({ sha256: "a".repeat(64) })], fetcher as typeof fetch), /SHA256/);
  await assert.rejects(() => preflightAssets([asset({ publicUrl: "https://tmpfiles.org/x.png" })], fetcher as typeof fetch), /stable/);
  await assert.rejects(() => preflightAssets([asset(), asset({ slideNumber: 3 })], fetcher as typeof fetch), /order/);
});

test("approved identity binds Content_ID, revision, candidate, order, and hashes", () => {
  const assets = [asset(), asset({ slideNumber: 2, sha256: "b".repeat(64), publicUrl: "https://cdn.example/content/C-1/r1/2.png" })];
  const identity = approvedAssetIdentity("C-1", 7, "candidate-A", assets);
  assert.doesNotThrow(() => assertApprovedAssetIdentity(identity, "C-1", 7, "candidate-A", assets));
  assert.throws(() => assertApprovedAssetIdentity(identity, "C-1", 8, "candidate-A", assets), /approved asset set/);
  assert.throws(() => assertApprovedAssetIdentity(identity, "C-1", 7, "candidate-A", [{ ...assets[0], sha256: "c".repeat(64) }, assets[1]]), /approved asset set/);
});

test("failed recovery repairs target, retries exactly once, is idempotent, and scopes replacement audit", async () => {
  let publishCalls = 0;
  const audits: unknown[] = [];
  const state = { status: "scheduled", publisherState: "failed", approvalAttemptId: "attempt", retryKey: null as string | null, mediaId: null as string | null };
  const store: RecoveryStore = {
    load: async () => ({ ...state, contentId: "C-1", revision: 2, candidate: "A", approvedAssetSetHash: approvedAssetIdentity("C-1", 2, "A", [asset()]), assets: [asset()], targetAccountId: "123", publisherError: "secret token=bad", leaseId: "old" }),
    findRecentPublication: async () => null,
    beginRetry: async (_id, key) => { if (state.retryKey === key) return false; state.retryKey = key; state.publisherState = "publishing"; return true; },
    applyReplacements: async () => {},
    complete: async (_id, mediaId) => { state.mediaId = mediaId; state.publisherState = "published"; },
    fail: async () => { state.publisherState = "failed"; },
    audit: async (event) => { audits.push(event); },
  };
  const publish = async () => { publishCalls++; return { mediaId: "m1", permalink: "https://instagram.test/p/m1" }; };
  const replacements = [{ slideNumber: 1, publicUrl: "https://cdn.example/content/C-1/r2/1.png", expectedSha256: sha, revision: 2, candidate: "A" }];
  const first = await recoverFailedPublication({ contentId: "C-1", retryKey: "r1", replacements, store, fetcher: (async () => new Response(payload, { headers: { "content-type": "image/png" } })) as typeof fetch, publish });
  const replay = await recoverFailedPublication({ contentId: "C-1", retryKey: "r1", replacements, store, fetcher: (async () => new Response(payload, { headers: { "content-type": "image/png" } })) as typeof fetch, publish });
  assert.equal(first.mediaId, "m1");
  assert.equal(replay.idempotent, true);
  assert.equal(publishCalls, 1);
  assert.equal(audits.length, 1);
});

test("ambiguous previous outcome prevents duplicate retry", async () => {
  const store = { load: async () => ({ contentId: "C-1", status: "scheduled", publisherState: "failed", approvalAttemptId: "a", revision: 1, candidate: "A", approvedAssetSetHash: approvedAssetIdentity("C-1", 1, "A", [asset()]), assets: [asset()], targetAccountId: "123", publisherError: "timeout", leaseId: null }), findRecentPublication: async () => ({ mediaId: "recent" }), beginRetry: async () => true, complete: async () => {}, fail: async () => {}, audit: async () => {} } as RecoveryStore;
  let calls = 0;
  await assert.rejects(() => recoverFailedPublication({ contentId: "C-1", retryKey: "r", store, fetcher: fetch, publish: async () => { calls++; return { mediaId: "new", permalink: "https://instagram.test/p/new" }; } }), /ambiguous|duplicate/i);
  assert.equal(calls, 0);
});

test("retry failure is recorded and scheduler failure must propagate", async () => {
  const poll = await import("../src/lib/publisher-recovery");
  assert.throws(() => poll.assertSchedulerSuccess({ failed: 1 }), /1 publisher job/);
});
