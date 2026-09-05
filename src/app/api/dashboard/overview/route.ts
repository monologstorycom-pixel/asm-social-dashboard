import { db } from "@/lib/db";
import { safeRoute, queryObject } from "@/lib/http";
import { buildPostWhere, metricJson } from "@/lib/post-query";
import { analyticsWhere, resolveAnalyticsMode } from "@/lib/operations-db";
import { jakartaDateKey, latestSnapshotAt } from "@/lib/operations";
import { overviewFiltersSchema } from "@/lib/validation";

type Totals = { posts: number; reach: number; engagement: number; saves: number; shares: number };

export async function GET(request: Request) {
  return safeRoute(async () => {
    const filters = overviewFiltersSchema.parse(queryObject(request));
    const mode = await resolveAnalyticsMode(filters.dataMode, filters.account);
    const sources = analyticsWhere(mode.dataMode);
    const posts = await db.contentPost.findMany({
      where: { AND: [buildPostWhere(filters), sources.post] },
      include: { socialAccount: true, assets: { orderBy: { slideNumber: "asc" } }, metrics: { where: sources.metric, orderBy: { capturedAt: "asc" } } },
      orderBy: { publishedAt: "desc" },
    });
    const latest = posts.map((post) => ({ post, metric: post.metrics.at(-1) ?? null }));
    const kpis = latest.reduce<Totals>((sum, { metric }) => ({
      posts: sum.posts + 1,
      reach: sum.reach + (metric?.reach ?? 0),
      engagement: sum.engagement + (metric?.engagementTotal ?? 0),
      saves: sum.saves + (metric?.saves ?? 0),
      shares: sum.shares + (metric?.shares ?? 0),
    }), { posts: 0, reach: 0, engagement: 0, saves: 0, shares: 0 });
    const totals = { ...kpis, engagementRate: kpis.reach ? (kpis.engagement / kpis.reach) * 100 : 0 };

    const timeline = new Map<string, { date: string; reach: number; engagement: number; saves: number; shares: number }>();
    for (const post of posts) for (const metric of post.metrics) {
      const date = jakartaDateKey(metric.capturedAt);
      const point = timeline.get(date) ?? { date, reach: 0, engagement: 0, saves: 0, shares: 0 };
      point.reach += metric.reach;
      point.engagement += metric.engagementTotal;
      point.saves += metric.saves;
      point.shares += metric.shares;
      timeline.set(date, point);
    }
    const performanceOverTime = [...timeline.values()].sort((a, b) => a.date.localeCompare(b.date)).map((point) => ({ ...point, value: point[filters.metric] }));

    const group = (key: "topic" | "creativeStyle") => {
      const rows = new Map<string, Totals>();
      for (const { post, metric } of latest) {
        const name = post[key];
        const row = rows.get(name) ?? { posts: 0, reach: 0, engagement: 0, saves: 0, shares: 0 };
        row.posts += 1;
        row.reach += metric?.reach ?? 0;
        row.engagement += metric?.engagementTotal ?? 0;
        row.saves += metric?.saves ?? 0;
        row.shares += metric?.shares ?? 0;
        rows.set(name, row);
      }
      return [...rows].map(([name, row]) => ({ name, ...row, engagementRate: row.reach ? (row.engagement / row.reach) * 100 : 0 }))
        .sort((a, b) => b[filters.metric] - a[filters.metric]).slice(0, 5);
    };
    const metricKey = filters.metric === "engagement" ? "engagementTotal" : filters.metric;
    const topPosts = latest.map(({ post, metric }) => ({
      ...post,
      metrics: undefined,
      latestMetric: metric ? metricJson(metric) : null,
    })).sort((a, b) => Number(b.latestMetric?.[metricKey] ?? 0) - Number(a.latestMetric?.[metricKey] ?? 0)).slice(0, 5);

    const accounts = [...new Map(posts.map((post) => [post.socialAccount.id, post.socialAccount])).values()].filter((a) => a.platform === "instagram");
    const account = accounts[0] ?? null;
    const unique = <T,>(values: T[]) => [...new Set(values)].sort();
    const asOf = latestSnapshotAt(posts.map((post) => post.metrics.map((metric) => metric.capturedAt)));
    return Response.json({
      dataMode: mode.dataMode,
      source: mode.dataMode === "demo" ? "demo" : mode.dataMode === "live" ? "meta" : "mixed",
      asOf,
      freshness: { latestSnapshotAt: asOf },
      accountName: account?.accountName ?? null,
      username: account?.username ?? null,
      followersCount: account?.followersCount ?? null,
      mediaCount: account?.mediaCount ?? null,
      profilePictureUrl: account?.profilePictureUrl ?? null,
      totals,
      selectedMetric: filters.metric,
      performanceOverTime,
      topPosts,
      topTopics: group("topic"),
      topCreativeStyles: group("creativeStyle"),
      accounts,
      filterOptions: {
        accounts,
        topics: unique(posts.map((post) => post.topic)),
        pillars: unique(posts.map((post) => post.contentPillar)),
        styles: unique(posts.map((post) => post.creativeStyle)),
        types: unique(posts.map((post) => post.contentType)),
        statuses: unique(posts.map((post) => post.status)),
      },
    });
  });
}
