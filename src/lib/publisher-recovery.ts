import { createHash } from "node:crypto";
import { HttpError } from "./http";

export type RecoveryAsset = { slideNumber: number; publicUrl: string; mimeType: string; sha256: string };
export type RecoveryPlan = { contentId: string; status: string; publisherState: string; approvalAttemptId: string | null; revision: number; candidate: string; approvedAssetSetHash: string | null; assets: RecoveryAsset[]; targetAccountId: string; publisherError: string | null; leaseId: string | null };
export type RecoveryReplacement = { slideNumber: number; publicUrl: string; expectedSha256: string; revision: number; candidate: string };
export type RecoveryStore = {
  load(contentId: string): Promise<RecoveryPlan | null>;
  findRecentPublication(plan: RecoveryPlan): Promise<{ mediaId: string } | null>;
  beginRetry(contentId: string, retryKey: string): Promise<boolean>;
  applyReplacements?(plan: RecoveryPlan, replacements: RecoveryReplacement[]): Promise<void>;
  complete(contentId: string, mediaId: string, permalink: string): Promise<void>;
  fail(contentId: string, error: string): Promise<void>;
  audit(event: Record<string, unknown>): Promise<void>;
};

const stableHttps = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || /(^|\.)tmpfiles\.org$/i.test(url.hostname) || /(?:^|[?&])(expires|x-amz-expires|token|signature)=/i.test(url.search)) throw new HttpError(409, "Asset URL must be stable permanent HTTPS storage");
};

export function approvedAssetIdentity(contentId: string, revision: number, candidate: string, assets: RecoveryAsset[]) {
  const canonical = JSON.stringify({ contentId, revision, candidate, assets: assets.map(({ slideNumber, sha256 }) => ({ slideNumber, sha256 })) });
  return createHash("sha256").update(canonical).digest("hex");
}

export function assertApprovedAssetIdentity(expected: string | null, contentId: string, revision: number, candidate: string, assets: RecoveryAsset[]) {
  if (!expected || expected !== approvedAssetIdentity(contentId, revision, candidate, assets)) throw new HttpError(409, "Current artifacts do not match the approved asset set");
}

export async function preflightAssets(assets: RecoveryAsset[], fetcher: typeof fetch = fetch) {
  if (!assets.length || assets.length > 10) throw new HttpError(409, "Publisher requires 1-10 approved assets");
  assets.forEach((asset, index) => {
    if (asset.slideNumber !== index + 1) throw new HttpError(409, "Asset count/order is not contiguous");
    stableHttps(asset.publicUrl);
    if (!asset.mimeType.toLowerCase().startsWith("image/")) throw new HttpError(409, "Publisher recovery accepts image assets only");
  });
  for (const asset of assets) {
    const response = await fetcher(asset.publicUrl, { method: "GET", cache: "no-store", redirect: "error" });
    if (response.status !== 200) throw new HttpError(409, `Asset preflight requires HTTP 200 (received ${response.status})`);
    const mime = response.headers.get("content-type")?.split(";", 1)[0].toLowerCase();
    if (mime !== asset.mimeType.toLowerCase() || !mime.startsWith("image/")) throw new HttpError(409, "Asset preflight MIME mismatch");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 1024 * 1024 || bytes.length > 25 * 1024 * 1024) throw new HttpError(409, "Asset preflight size must be between 1 MiB and 25 MiB");
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new HttpError(409, "Asset preflight SHA256 mismatch");
  }
}

const sanitized = (error: unknown) => (error instanceof Error ? error.message : "Publisher retry failed").replace(/(?:token|secret|authorization)\s*[=:]\s*\S+/gi, "$1=[redacted]").slice(0, 500);

export async function recoverFailedPublication(input: { contentId: string; retryKey: string; replacements?: RecoveryReplacement[]; store: RecoveryStore; fetcher?: typeof fetch; publish: (accountId: string, assets: RecoveryAsset[]) => Promise<{ mediaId: string; permalink: string }> }) {
  const plan = await input.store.load(input.contentId);
  if (!plan) throw new HttpError(404, "Content plan item not found");
  if (plan.publisherState === "published") return { mediaId: null, idempotent: true };
  if (plan.publisherState !== "failed" || plan.status !== "scheduled" || !plan.approvalAttemptId) throw new HttpError(409, "Recovery requires an approved failed scheduled publication");
  assertApprovedAssetIdentity(plan.approvedAssetSetHash, plan.contentId, plan.revision, plan.candidate, plan.assets);
  if (await input.store.findRecentPublication(plan)) throw new HttpError(409, "Ambiguous previous outcome; duplicate publication prevented");
  const replacements = input.replacements ?? [];
  if (new Set(replacements.map((item) => item.slideNumber)).size !== replacements.length) throw new HttpError(400, "Replacement slides must be unique");
  for (const replacement of replacements) {
    const approved = plan.assets.find((asset) => asset.slideNumber === replacement.slideNumber);
    if (!approved || replacement.expectedSha256 !== approved.sha256 || replacement.revision !== plan.revision || replacement.candidate !== plan.candidate) throw new HttpError(409, "Replacement does not match approved slide hash/revision/candidate");
  }
  const assets = plan.assets.map((asset) => ({ ...asset, publicUrl: replacements.find((item) => item.slideNumber === asset.slideNumber)?.publicUrl ?? asset.publicUrl }));
  await preflightAssets(assets, input.fetcher);
  if (!await input.store.beginRetry(plan.contentId, input.retryKey)) return { mediaId: null, idempotent: true };
  if (replacements.length) {
    if (!input.store.applyReplacements) throw new HttpError(500, "Recovery store cannot persist replacements");
    await input.store.applyReplacements(plan, replacements);
  }
  await input.store.audit({ contentId: plan.contentId, action: "publisher_recovery", approvalAttemptId: plan.approvalAttemptId, revision: plan.revision, retryKey: input.retryKey, replacements: replacements.map(({ slideNumber, expectedSha256 }) => ({ slideNumber, expectedSha256 })) });
  try {
    const published = await input.publish(plan.targetAccountId, assets);
    await input.store.complete(plan.contentId, published.mediaId, published.permalink);
    return { ...published, idempotent: false };
  } catch (error) {
    const providerError = sanitized(error);
    console.error(JSON.stringify({ Content_ID: plan.contentId, stage: "recovery_publish", attempt: input.retryKey, providerError }));
    await input.store.fail(plan.contentId, providerError);
    throw error;
  }
}

export function assertSchedulerSuccess(result: { failed: number }) {
  if (result.failed > 0) throw new HttpError(502, `${result.failed} publisher job(s) failed`);
}
