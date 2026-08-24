import type { Prisma } from "@/generated/prisma/client";
import type { OverviewFilters, PostFilters, PostSort } from "./validation";

type SharedFilters = Pick<PostFilters, "account" | "dateFrom" | "dateTo" | "topic" | "pillar" | "style" | "type" | "status"> & { search?: string };

export function buildPostWhere(filters: SharedFilters | OverviewFilters): Prisma.ContentPostWhereInput {
  const publishedAt = filters.dateFrom || filters.dateTo
    ? {
        ...(filters.dateFrom && { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) }),
        ...(filters.dateTo && { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) }),
      }
    : undefined;
  const search = "search" in filters ? filters.search : undefined;
  return {
    ...(filters.account && { socialAccountId: filters.account }),
    ...(filters.topic && { topic: { contains: filters.topic } }),
    ...(filters.pillar && { contentPillar: filters.pillar }),
    ...(filters.style && { creativeStyle: filters.style }),
    ...(filters.type && { contentType: filters.type }),
    ...(filters.status && { status: filters.status }),
    ...(publishedAt && { publishedAt }),
    ...(search && { OR: [{ title: { contains: search } }, { caption: { contains: search } }, { topic: { contains: search } }] }),
  };
}

export function latestMetricByPost<T extends { contentPostId: string; capturedAt: Date }>(snapshots: T[]) {
  const result = new Map<string, T>();
  for (const snapshot of snapshots) {
    const current = result.get(snapshot.contentPostId);
    if (!current || snapshot.capturedAt > current.capturedAt) result.set(snapshot.contentPostId, snapshot);
  }
  return result;
}

type SortablePost = {
  publishedAt: Date | null;
  metrics: Array<{ reach: number; saves: number; shares: number; engagementRate: unknown }>;
};

export function sortPosts<T extends SortablePost>(posts: T[], sort: PostSort, order: "asc" | "desc"): T[] {
  const value = (post: T) => {
    if (sort === "publishDate") return post.publishedAt?.getTime() ?? 0;
    const metric = post.metrics[0];
    return metric ? Number(metric[sort]) : 0;
  };
  const direction = order === "asc" ? 1 : -1;
  return [...posts].sort((a, b) => (value(a) - value(b)) * direction);
}

export function metricJson<T extends { engagementRate: unknown }>(metric: T) {
  return { ...metric, engagementRate: Number(metric.engagementRate) };
}
