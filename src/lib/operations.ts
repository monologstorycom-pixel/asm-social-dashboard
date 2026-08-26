import { createHash, timingSafeEqual } from "node:crypto";

import { HttpError } from "./http";
import { canTransitionContentPlan, type ContentPlanStatus } from "./content-plan";

export const APPROVAL_COMMAND = "APPROVE & PUBLISH";
export const META_WINDOWS = ["h1", "h6", "h24", "h72", "d7"] as const;
export type MetricWindow = typeof META_WINDOWS[number];
export type DataMode = "auto" | "demo" | "live" | "all";

type InvariantState = {
  approvedAt?: Date | null;
  scheduledAt?: Date | null;
  publishedAt?: Date | null;
  instagramMediaId?: string | null;
  permalink?: string | null;
  publicUrl?: string | null;
  liveMetricCount?: number;
  qaStatus?: string | null;
  finalAssets?: number;
};

export function assertGeneralTransition(current: ContentPlanStatus, next: ContentPlanStatus, state: InvariantState) {
  if (!canTransitionContentPlan(current, next)) throw new HttpError(409, `Cannot transition status from ${current} to ${next}`);
  if (next === "approved") throw new HttpError(409, "approved is only reachable through the exact approval endpoint");
  if (next === "ready_for_review" && (state.qaStatus !== "passed" || !state.finalAssets)) throw new HttpError(409, "READY_FOR_REVIEW requires passed QA and final assets");
  assertLifecycleInvariants(next, state);
}

export function assertLifecycleInvariants(status: ContentPlanStatus, state: InvariantState) {
  const rank = ["planned", "approved_for_creation", "creating", "ready_for_review", "approved", "scheduled", "published", "measuring"].indexOf(status);
  if (rank >= 5 && (!state.approvedAt || !state.scheduledAt)) throw new HttpError(409, "scheduled requires approvedAt and scheduledAt");
  if (rank >= 6 && (!state.publishedAt || !state.instagramMediaId || !(state.permalink || state.publicUrl))) throw new HttpError(409, "published requires linked media ID, publishedAt, and a permalink or public URL");
  if (rank >= 7 && !state.liveMetricCount) throw new HttpError(409, "measuring requires at least one live Meta metric snapshot");
}

const includesAny = (value: string, terms: string[]) => terms.some((term) => value.toLowerCase().includes(term));

export function mapPlanFields(plan: { pillar: string; format: string; creativeStyle: string }) {
  const contentPillar = includesAny(plan.pillar, ["educ", "how-to", "tips"]) ? "education"
    : includesAny(plan.pillar, ["product"]) ? "product"
    : includesAny(plan.pillar, ["compar", "versus", "vs"]) ? "comparison"
    : includesAny(plan.pillar, ["inspir", "story"]) ? "inspiration"
    : includesAny(plan.pillar, ["promo", "campaign"]) ? "promotion" : "brand";
  const contentType = includesAny(plan.format, ["carousel"]) ? "carousel"
    : includesAny(plan.format, ["reel"]) ? "reel"
    : includesAny(plan.format, ["story"]) ? "story"
    : includesAny(plan.format, ["video"]) ? "video"
    : includesAny(plan.format, ["text"]) ? "text" : "image";
  const creativeStyle = includesAny(plan.creativeStyle, ["magazine"]) ? "editorial_magazine"
    : includesAny(plan.creativeStyle, ["infographic"]) ? "infographic"
    : includesAny(plan.creativeStyle, ["architect"]) ? "architectural"
    : includesAny(plan.creativeStyle, ["photo", "product"]) ? "product_photography" : "editorial_no_box";
  return { contentPillar, contentType, creativeStyle } as const;
}

export function validateApprovalCommand(command: unknown) {
  if (command !== APPROVAL_COMMAND) throw new HttpError(400, `command must be exactly ${APPROVAL_COMMAND}`);
}

export type PublishWindow = { start: Date; end: Date; label: string };
export function parsePublishWindow(label: string, planDate: Date): PublishWindow {
  const times = [...label.matchAll(/(?:^|\D)([01]?\d|2[0-3])[:.]([0-5]\d)/g)].map((match) => Number(match[1]) * 60 + Number(match[2]));
  if (!times.length) throw new HttpError(409, "test_publish_window has no parseable time");
  const atWibMinutes = (minutes: number) => new Date(Date.UTC(planDate.getUTCFullYear(), planDate.getUTCMonth(), planDate.getUTCDate(), 0, minutes - 7 * 60));
  const start = atWibMinutes(times[0]);
  const end = atWibMinutes(times[1] ?? times[0] + 60);
  if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
  return { start, end, label };
}

export function validateScheduledAt(scheduledAt: Date, window: PublishWindow) {
  if (Number.isNaN(scheduledAt.getTime())) throw new HttpError(400, "scheduled_at must be an ISO datetime");
  if (scheduledAt < window.start || scheduledAt > window.end) throw new HttpError(409, "scheduled_at must be within the recommended window");
}

export function resolveDataMode(requested: DataMode, hasLiveMeta: boolean) {
  const dataMode = requested === "auto" ? (hasLiveMeta ? "live" : "demo") : requested;
  return { dataMode, source: dataMode === "all" ? undefined : dataMode } as const;
}

export function analyticsSourceFilters(dataMode: Exclude<DataMode, "auto">) {
  if (dataMode === "demo") return { postSource: "demo" as const, metricSources: ["demo" as const] };
  if (dataMode === "live") return { postSource: "live" as const, metricSources: ["meta" as const] };
  return { postSource: undefined, metricSources: undefined };
}

type MetricValues = ReturnType<typeof normalizeMetaMetrics>;
type SyncInput = {
  post: { id: string; publishedAt: Date; instagramMediaId: string };
  now: Date;
  completed: Set<string>;
  fetchMetrics: (mediaId: string) => Promise<MetricValues>;
  storeSnapshot: (window: MetricWindow, metrics: MetricValues, capturedAt: Date) => Promise<boolean>;
  markMeasuring: () => Promise<void>;
};

export async function syncMetricWindows(input: SyncInput) {
  const due = dueMetricWindows(input.post.publishedAt, input.now, input.completed);
  const stored: MetricWindow[] = [];
  const skipped: MetricWindow[] = [];
  if (!due.length) return { due, stored, skipped };
  const metrics = await input.fetchMetrics(input.post.instagramMediaId);
  for (const window of due) (await input.storeSnapshot(window, metrics, input.now) ? stored : skipped).push(window);
  if (stored.length) await input.markMeasuring();
  return { due, stored, skipped };
}

type ReconciliationState = {
  status: string;
  approvedAt: Date | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  contentPostId: string | null;
  approvalAttemptId: string | null;
  approvalCommand: string | null;
};

export function buildReconciliationReport(state: ReconciliationState) {
  const issues: string[] = [];
  const rank = ["planned", "approved_for_creation", "creating", "ready_for_review", "approved", "scheduled", "published", "measuring"].indexOf(state.status);
  const approved = Boolean(state.approvedAt && state.approvalAttemptId && state.approvalCommand === APPROVAL_COMMAND);
  const scheduled = approved && Boolean(state.scheduledAt);
  const published = scheduled && Boolean(state.publishedAt && state.contentPostId);
  if (rank >= 4 && !approved) issues.push("approval evidence is incomplete");
  if (rank >= 5 && !scheduled) issues.push("schedule evidence is incomplete");
  if (rank >= 6 && !published) issues.push("publication evidence is incomplete");
  const safeStatus = !approved ? "ready_for_review" : !scheduled ? "approved" : !published ? "scheduled" : state.status;
  return {
    issues,
    repairs: issues.length ? [
      { field: "status" as const, value: safeStatus },
      { field: "publisherState" as const, value: safeStatus === "scheduled" ? "scheduled" : "ready" },
      { field: "publishStatus" as const, value: safeStatus === "scheduled" ? "scheduled" : "off" },
    ] : [],
  };
}

type Comparable = { publishedAt: Date; engagementRate: number };
export function publishingRecommendation(input: { testPublishWindow: string; comparable: Comparable[] }) {
  if (input.comparable.length < 10) return {
    recommendedWindow: input.testPublishWindow,
    basis: "controlled_test_window" as const,
    confidence: "low" as const,
    sampleCount: input.comparable.length,
    evidence: { source: "content_plan", metric: null, timezone: "Asia/Jakarta" },
    caveat: "Insufficient comparable live Meta samples; this is a controlled test window, not an optimal hour.",
  };
  const buckets = new Map<number, { total: number; count: number }>();
  for (const sample of input.comparable) {
    const hour = (sample.publishedAt.getUTCHours() + 7) % 24;
    const row = buckets.get(hour) ?? { total: 0, count: 0 };
    row.total += sample.engagementRate;
    row.count += 1;
    buckets.set(hour, row);
  }
  const hour = [...buckets].sort((a, b) => b[1].total / b[1].count - a[1].total / a[1].count)[0][0];
  return {
    recommendedWindow: `${String(hour).padStart(2, "0")}:00-${String((hour + 1) % 24).padStart(2, "0")}:00 WIB`,
    basis: "account_performance" as const,
    confidence: input.comparable.length >= 20 ? "high" as const : "medium" as const,
    sampleCount: input.comparable.length,
    evidence: { source: "live_meta", metric: "engagement_rate", timezone: "Asia/Jakarta" },
    caveat: "Recommendation is based only on comparable published posts with live Meta snapshots.",
  };
}

const WINDOW_HOURS: Record<MetricWindow, number> = { h1: 1, h6: 6, h24: 24, h72: 72, d7: 168 };
export function dueMetricWindows(publishedAt: Date, now: Date, completed: Set<string>): MetricWindow[] {
  const ageHours = (now.getTime() - publishedAt.getTime()) / 3_600_000;
  const current = META_WINDOWS.filter((window) => ageHours >= WINDOW_HOURS[window]).at(-1);
  return current && !completed.has(current) ? [current] : [];
}

export function computeEarlyVelocity(current: number, capturedAt: Date, previous: number, previousAt: Date) {
  const hours = (capturedAt.getTime() - previousAt.getTime()) / 3_600_000;
  return hours > 0 ? (current - previous) / hours : null;
}

export type MetaMediaChild = {
  id: string;
  media_type?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  thumbnail_url?: string;
};

export type MetaMedia = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  media_url?: string;
  thumbnail_url?: string;
  children?: { data?: MetaMediaChild[] };
};

export function mapMetaMediaToPost(media: MetaMedia) {
  const publishedAt = new Date(media.timestamp);
  if (!media.id || Number.isNaN(publishedAt.getTime())) throw new HttpError(502, "Meta returned invalid media identity or timestamp");
  let permalink: URL;
  try { permalink = new URL(media.permalink); } catch { throw new HttpError(502, "Meta returned an invalid permalink"); }
  if (permalink.protocol !== "https:") throw new HttpError(502, "Meta returned an invalid permalink");
  const caption = media.caption?.trim() || "Imported from Instagram";
  const title = caption.split(/\r?\n/, 1)[0].slice(0, 191) || "Instagram media";
  const contentType: "carousel" | "reel" | "image" = media.media_type === "CAROUSEL_ALBUM" ? "carousel" : media.media_type === "VIDEO" ? "reel" : "image";
  return {
    instagramMediaId: media.id, title, caption, contentPillar: "brand" as const, topic: "Instagram live",
    contentType, creativeStyle: "editorial_no_box" as const,
    slideCount: media.media_type === "CAROUSEL_ALBUM" ? Math.max(1, media.children?.data?.length ?? 1) : 1,
    status: "published" as const, permalink: permalink.toString(), publicUrl: permalink.toString(), publishedAt, source: "live" as const,
  };
}

export type AssetMapping = { assetType: "image" | "video" | "thumbnail"; assetUrl: string; slideNumber: number };

export function mapMediaToAssets(contentPostId: string, media: MetaMedia): AssetMapping[] {
  const source = media.media_type === "CAROUSEL_ALBUM" ? media.children?.data ?? [] : [media];
  return source.flatMap((item, index) => {
    const assetUrl = item.media_type === "VIDEO" ? item.thumbnail_url ?? item.media_url : item.media_url;
    return assetUrl ? [{ assetType: item.media_type === "VIDEO" && item.thumbnail_url ? "thumbnail" as const : item.media_type === "VIDEO" ? "video" as const : "image" as const, assetUrl, slideNumber: index + 1 }] : [];
  });
}

type Insight = { name: string; values?: Array<{ value: unknown }> };
const metricValue = (insights: Insight[], names: string[]) => {
  const value = insights.find((item) => names.includes(item.name))?.values?.at(-1)?.value;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
};
export function normalizeMetaMetrics(media: { like_count?: unknown; comments_count?: unknown }, insights: Insight[]) {
  const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
  const reach = metricValue(insights, ["reach"]);
  const likes = count(media.like_count);
  const comments = count(media.comments_count);
  const saves = metricValue(insights, ["saved", "saves"]);
  const shares = metricValue(insights, ["shares"]);
  const componentTotal = likes + comments + saves + shares;
  const reportedTotal = metricValue(insights, ["total_interactions"]);
  const engagementTotal = reportedTotal || componentTotal;
  return {
    reach,
    impressions: metricValue(insights, ["impressions"]),
    views: metricValue(insights, ["views", "plays", "video_views"]),
    likes,
    comments,
    saves,
    shares,
    engagementTotal,
    engagementRate: reach ? (engagementTotal / reach) * 100 : 0,
  };
}

export function authorizeDashboardRequest(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || url.host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.slice(0, -1);
  if (request.headers.get("sec-fetch-site") !== "same-origin" || request.headers.get("origin") !== `${protocol}://${host}`) throw new HttpError(401, "Unauthorized");
}

export function authorizeInternalRequest(request: Request, configuredToken = process.env.INTERNAL_API_TOKEN) {
  if (!configuredToken) throw new HttpError(503, "Internal API authentication is not configured");
  const header = request.headers.get("authorization") ?? "";
  const candidate = header.startsWith("Bearer ") ? header.slice(7) : "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!candidate || !timingSafeEqual(digest(candidate), digest(configuredToken))) throw new HttpError(401, "Unauthorized");
}
