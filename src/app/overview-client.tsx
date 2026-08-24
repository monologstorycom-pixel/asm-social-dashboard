"use client";
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildApiQuery, compactNumber, dateLabel, FilterOptions, friendlyLabel, percent, Post } from "@/lib/frontend";

type MetricName = "reach" | "engagement" | "saves" | "shares";
type Overview = {
  totals: { posts: number; reach: number; engagement: number; engagementRate: number; saves: number; shares: number };
  performanceOverTime: Array<{ date: string; reach: number; engagement: number; saves: number; shares: number }>;
  topPosts: Post[];
  topTopics: Array<{ name: string; posts: number; reach: number; engagement: number; engagementRate: number; saves: number; shares: number }>;
  topCreativeStyles: Array<{ name: string; posts: number; reach: number; engagement: number; engagementRate: number; saves: number; shares: number }>;
  filterOptions: FilterOptions;
};
const metrics: MetricName[] = ["reach", "engagement", "saves", "shares"];
const emptyFilters = { account: "", dateFrom: "", dateTo: "", topic: "", pillar: "", style: "", type: "", status: "" };

type Filters = typeof emptyFilters;

export default function OverviewClient() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [metric, setMetric] = useState<MetricName>("reach");
  const [data, setData] = useState<Overview | null>(null);
  const [options, setOptions] = useState<FilterOptions>({ accounts: [], topics: [], pillars: [], styles: [], types: [], statuses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`/api/dashboard/overview?${buildApiQuery({ ...filters, metric })}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<Overview>; })
      .then((payload) => { setData(payload); setOptions((current) => current.accounts.length ? current : payload.filterOptions); })
      .catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("Analytics are temporarily unavailable. Please try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, metric]);

  const update = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const totals = data?.totals;
  const kpis = [
    ["Posts", totals?.posts], ["Reach", totals?.reach], ["Engagement", totals?.engagement],
    ["Engagement Rate", totals?.engagementRate, true], ["Saves", totals?.saves], ["Shares", totals?.shares],
  ] as const;

  return <div className="page-wrap">
    <header className="page-header"><div><p className="eyebrow">Performance intelligence</p><h1>Overview</h1><p>Monitor content momentum across ASM social channels.</p></div><div className="live-badge"><span />Live workspace</div></header>

    <section className="filter-panel" aria-label="Global analytics filters">
      <div className="filter-heading"><strong>Global filters</strong><button className="text-button" onClick={() => setFilters(emptyFilters)} disabled={!Object.values(filters).some(Boolean)}>Reset all</button></div>
      <div className="filter-grid">
        <label>Account<select value={filters.account} onChange={(e) => update("account", e.target.value)}><option value="">All accounts</option>{options.accounts.map((item) => <option key={item.id} value={item.id}>{item.accountName} · @{item.username}</option>)}</select></label>
        <label>From<input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(e) => update("dateFrom", e.target.value)} /></label>
        <label>To<input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(e) => update("dateTo", e.target.value)} /></label>
        <SelectFilter label="Topic" value={filters.topic} items={options.topics} onChange={(value) => update("topic", value)} />
        <SelectFilter label="Content pillar" value={filters.pillar} items={options.pillars} onChange={(value) => update("pillar", value)} />
        <SelectFilter label="Creative style" value={filters.style} items={options.styles} onChange={(value) => update("style", value)} />
        <SelectFilter label="Content type" value={filters.type} items={options.types} onChange={(value) => update("type", value)} />
        <SelectFilter label="Status" value={filters.status} items={options.statuses} onChange={(value) => update("status", value)} />
      </div>
    </section>

    {error ? <StateBox title="We couldn't load the overview" detail={error} action={<button onClick={() => setFilters({ ...filters })}>Try again</button>} /> : <>
      <section className="kpi-grid" aria-label="Key performance indicators">{kpis.map(([label, value, isPercent]) => <article className="kpi" key={label}><span>{label}</span><strong>{loading && !data ? "—" : isPercent ? percent(Number(value ?? 0)) : compactNumber.format(Number(value ?? 0))}</strong></article>)}</section>
      <section className="panel chart-panel">
        <div className="section-heading"><div><p className="eyebrow">Trend line</p><h2>Performance over time</h2></div><div className="segmented" aria-label="Chart metric">{metrics.map((item) => <button key={item} aria-pressed={metric === item} onClick={() => setMetric(item)}>{friendlyLabel(item)}</button>)}</div></div>
        {loading && !data ? <ChartSkeleton /> : data?.performanceOverTime.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.performanceOverTime} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="steelArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d69d55" stopOpacity={0.35}/><stop offset="100%" stopColor="#d69d55" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#26313a" vertical={false}/><XAxis dataKey="date" tickFormatter={(value) => dateLabel(value)} tick={{ fill: "#84919c", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28}/><YAxis tickFormatter={(value) => compactNumber.format(value)} tick={{ fill: "#84919c", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip labelFormatter={(value) => dateLabel(String(value))} formatter={(value) => [compactNumber.format(Number(value)), friendlyLabel(metric)]} contentStyle={{ background: "#161d22", border: "1px solid #34414a", borderRadius: 8 }}/><Area type="monotone" dataKey={metric} stroke="#d69d55" strokeWidth={2} fill="url(#steelArea)" activeDot={{ r: 4 }}/></AreaChart></ResponsiveContainer></div> : <EmptyInline text="No performance snapshots match these filters." />}
      </section>
      <section className="overview-lower">
        <section className="panel top-posts"><div className="section-heading"><div><p className="eyebrow">Content leaders</p><h2>Top performing posts</h2></div><Link href="/posts">View all</Link></div>{data?.topPosts.length ? <div className="rank-list">{data.topPosts.map((post, index) => <Link href={`/posts?detail=${post.id}`} className="rank-post" key={post.id}><span className="rank">{String(index + 1).padStart(2, "0")}</span><Thumb post={post}/><span className="rank-copy"><strong>{post.title}</strong><small>{friendlyLabel(post.contentPillar)} · {post.topic}</small></span><span className="rank-value"><strong>{compactNumber.format(post.latestMetric?.[metric === "engagement" ? "engagementTotal" : metric] ?? 0)}</strong><small>{friendlyLabel(metric)}</small></span></Link>)}</div> : <EmptyInline text="No posts match these filters." />}</section>
        <RankPanel title="Top topics" items={data?.topTopics ?? []} metric={metric}/><RankPanel title="Top creative styles" items={data?.topCreativeStyles ?? []} metric={metric}/>
      </section>
    </>}
  </div>;
}

function SelectFilter({ label, value, items, onChange }: { label: string; value: string; items: string[]; onChange: (value: string) => void }) { return <label>{label}<select value={value} onChange={(e) => onChange(e.target.value)}><option value="">All</option>{items.map((item) => <option key={item} value={item}>{friendlyLabel(item)}</option>)}</select></label>; }
function Thumb({ post }: { post: Post }) { const src = post.assets.find((item) => item.assetType === "thumbnail")?.assetUrl ?? post.assets[0]?.assetUrl; return src ? <img className="thumb" src={src} alt="" loading="lazy" /> : <span className="thumb fallback" aria-hidden="true">ASM</span>; }
function RankPanel({ title, items, metric }: { title: string; items: Overview["topTopics"]; metric: MetricName }) { const key = metric === "engagement" ? "engagement" : metric; const max = Math.max(...items.map((item) => item[key]), 1); return <section className="panel mini-rank"><div className="section-heading"><div><p className="eyebrow">By {friendlyLabel(metric)}</p><h2>{title}</h2></div></div>{items.length ? <ol>{items.map((item) => <li key={item.name}><div><strong>{friendlyLabel(item.name)}</strong><span>{compactNumber.format(item[key])}</span></div><i style={{ width: `${(item[key] / max) * 100}%` }}/></li>)}</ol> : <EmptyInline text="No ranking data." />}</section>; }
function StateBox({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) { return <section className="state-box" role="alert"><strong>{title}</strong><p>{detail}</p>{action}</section>; }
function EmptyInline({ text }: { text: string }) { return <div className="empty-inline"><span aria-hidden="true">—</span>{text}</div>; }
function ChartSkeleton() { return <div className="chart-skeleton" aria-label="Loading chart"><i/><i/><i/><i/></div>; }
