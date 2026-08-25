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
      .catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("Analitik sedang tidak tersedia. Silakan coba lagi."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, metric]);

  const update = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const totals = data?.totals;
  const kpis = [
    ["Postingan", totals?.posts], ["Jangkauan", totals?.reach], ["Interaksi", totals?.engagement],
    ["Rasio Interaksi", totals?.engagementRate, true], ["Penyimpanan", totals?.saves], ["Berbagi", totals?.shares],
  ] as const;

  return <div className="page-wrap">
    <header className="page-header"><div><p className="eyebrow">Intelijen kinerja</p><h1>Ringkasan</h1><p>Pantau momentum konten di seluruh kanal sosial ASM.</p></div><div className="live-badge"><span />Ruang kerja aktif</div></header>

    <section className="filter-panel" aria-label="Filter analitik global">
      <div className="filter-heading"><strong>Filter global</strong><button className="text-button" onClick={() => setFilters(emptyFilters)} disabled={!Object.values(filters).some(Boolean)}>Atur ulang</button></div>
      <div className="filter-grid">
        <label>Akun<select value={filters.account} onChange={(e) => update("account", e.target.value)}><option value="">Semua akun</option>{options.accounts.map((item) => <option key={item.id} value={item.id}>{item.accountName} · @{item.username}</option>)}</select></label>
        <label>Dari<input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(e) => update("dateFrom", e.target.value)} /></label>
        <label>Sampai<input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(e) => update("dateTo", e.target.value)} /></label>
        <SelectFilter label="Topik" value={filters.topic} items={options.topics} onChange={(value) => update("topic", value)} />
        <SelectFilter label="Pilar konten" value={filters.pillar} items={options.pillars} onChange={(value) => update("pillar", value)} />
        <SelectFilter label="Gaya kreatif" value={filters.style} items={options.styles} onChange={(value) => update("style", value)} />
        <SelectFilter label="Tipe konten" value={filters.type} items={options.types} onChange={(value) => update("type", value)} />
        <SelectFilter label="Status" value={filters.status} items={options.statuses} onChange={(value) => update("status", value)} />
      </div>
    </section>

    {error ? <StateBox title="Gagal memuat ringkasan" detail={error} action={<button onClick={() => setFilters({ ...filters })}>Coba lagi</button>} /> : <>
      <section className="kpi-ticker" aria-label="Indikator kinerja utama">{kpis.map(([label, value, isPercent]) => <article className="kpi" key={label}><span className="kpi-label">{label}</span><strong className="kpi-value">{loading && !data ? "—" : isPercent ? percent(Number(value ?? 0)) : compactNumber.format(Number(value ?? 0))}</strong></article>)}</section>
      <section>
        <div className="section-heading"><div><p className="eyebrow">Garis tren</p><h2>Kinerja dari waktu ke waktu</h2></div><div className="segmented" aria-label="Metrik grafik">{metrics.map((item) => <button key={item} aria-pressed={metric === item} onClick={() => setMetric(item)}>{friendlyLabel(item)}</button>)}</div></div>
        {loading && !data ? <ChartSkeleton /> : data?.performanceOverTime.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.performanceOverTime} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="steelArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b85c38" stopOpacity={0.2}/><stop offset="100%" stopColor="#b85c38" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#d4c9b8" vertical={false}/><XAxis dataKey="date" tickFormatter={(value) => dateLabel(value)} tick={{ fill: "#8a7f72", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={28}/><YAxis tickFormatter={(value) => compactNumber.format(value)} tick={{ fill: "#8a7f72", fontSize: 10 }} axisLine={false} tickLine={false}/><Tooltip labelFormatter={(value) => dateLabel(String(value))} formatter={(value) => [compactNumber.format(Number(value)), friendlyLabel(metric)]} contentStyle={{ background: "#faf7f2", border: "1px solid #d4c9b8", borderRadius: 0, fontFamily: "var(--font-body)" }}/><Area type="monotone" dataKey={metric} stroke="#b85c38" strokeWidth={2} fill="url(#steelArea)" activeDot={{ r: 4, fill: "#b85c38" }}/></AreaChart></ResponsiveContainer></div> : <EmptyInline text="Tidak ada data performa yang cocok dengan filter ini." />}
      </section>
      <section className="overview-lower">
        <section className="top-posts"><div className="section-heading"><div><p className="eyebrow">Pemimpin konten</p><h2>Postingan berkinerja terbaik</h2></div><Link href="/posts">Lihat semua</Link></div>{data?.topPosts.length ? <div className="rank-list">{data.topPosts.map((post, index) => <Link href={`/posts?detail=${post.id}`} className="rank-post" key={post.id}><span className="rank">{String(index + 1).padStart(2, "0")}</span><Thumb post={post}/><span className="rank-copy"><strong>{post.title}</strong><small>{friendlyLabel(post.contentPillar)} · {post.topic}</small></span><span className="rank-value"><strong>{compactNumber.format(post.latestMetric?.[metric === "engagement" ? "engagementTotal" : metric] ?? 0)}</strong><small>{friendlyLabel(metric)}</small></span></Link>)}</div> : <EmptyInline text="Tidak ada postingan yang cocok." />}</section>
        <div style={{ padding: "20px" }}><RankPanel title="Topik teratas" items={data?.topTopics ?? []} metric={metric}/><div style={{ height: "16px" }}/><RankPanel title="Gaya kreatif teratas" items={data?.topCreativeStyles ?? []} metric={metric}/></div>
      </section>
    </>}
  </div>;
}

function SelectFilter({ label, value, items, onChange }: { label: string; value: string; items: string[]; onChange: (value: string) => void }) { return <label>{label}<select value={value} onChange={(e) => onChange(e.target.value)}><option value="">Semua</option>{items.map((item) => <option key={item} value={item}>{friendlyLabel(item)}</option>)}</select></label>; }
function Thumb({ post }: { post: Post }) { const src = post.assets.find((item) => item.assetType === "thumbnail")?.assetUrl ?? post.assets[0]?.assetUrl; return src ? <img className="thumb" src={src} alt="" loading="lazy" /> : <span className="thumb fallback" aria-hidden="true">ASM</span>; }
function RankPanel({ title, items, metric }: { title: string; items: Overview["topTopics"]; metric: MetricName }) { const key = metric === "engagement" ? "engagement" : metric; const max = Math.max(...items.map((item) => item[key]), 1); return <section className="mini-rank"><div className="section-heading"><div><p className="eyebrow">Berdasarkan {friendlyLabel(metric)}</p><h2>{title}</h2></div></div>{items.length ? <ol>{items.map((item) => <li key={item.name}><div><strong>{friendlyLabel(item.name)}</strong><span>{compactNumber.format(item[key])}</span></div><i style={{ width: `${(item[key] / max) * 100}%` }}/></li>)}</ol> : <EmptyInline text="Tidak ada data peringkat." />}</section>; }
function StateBox({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) { return <section className="state-box" role="alert"><strong>{title}</strong><p>{detail}</p>{action}</section>; }
function EmptyInline({ text }: { text: string }) { return <div className="empty-inline"><span aria-hidden="true">—</span>{text}</div>; }
function ChartSkeleton() { return <div className="chart-skeleton" aria-label="Memuat grafik"><i/><i/><i/><i/></div>; }
