"use client";
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { bestMetricIds, compactNumber, dateTimeLabel, friendlyLabel, fullNumber, percent, Post, readStoredSelection, storeSelection, toggleSelection } from "@/lib/frontend";

type MetricKey = "reach" | "likes" | "comments" | "saves" | "shares" | "engagementRate";
const metricOptions: Array<{ key: MetricKey; label: string }> = [{ key: "reach", label: "Reach" }, { key: "likes", label: "Likes" }, { key: "comments", label: "Comments" }, { key: "saves", label: "Saves" }, { key: "shares", label: "Shares" }, { key: "engagementRate", label: "Eng. rate" }];
const colors = ["#d69d55", "#8faab8", "#c7b49a", "#769087", "#b97864"];

export default function CompareClient() {
  const params = useSearchParams(); const router = useRouter();
  const [ids, setIds] = useState<string[]>([]); const [items, setItems] = useState<Post[]>([]); const [picker, setPicker] = useState<Post[]>([]);
  const [metric, setMetric] = useState<MetricKey>("reach"); const [query, setQuery] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  useEffect(() => { const urlIds = (params.get("ids") ?? "").split(",").filter(Boolean); setIds(urlIds.length ? [...new Set(urlIds)].slice(0, 5) : readStoredSelection()); }, [params]);
  useEffect(() => { fetch("/api/posts?pageSize=100&sort=publishDate&order=desc").then((r) => r.ok ? r.json() : Promise.reject()).then((data: { items: Post[] }) => setPicker(data.items)).catch(() => undefined); }, []);
  useEffect(() => {
    if (ids.length < 2) { setItems([]); setError(""); return; }
    const controller = new AbortController(); setLoading(true); setError("");
    fetch(`/api/compare?ids=${ids.join(",")}`, { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<{ items: Post[] }>; }).then(({ items: rows }) => setItems(rows)).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("The selected posts could not be compared. One may no longer be available."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ids]);
  const changeIds = (next: string[]) => { setIds(next); setNotice(""); storeSelection(next); router.replace(next.length ? `/compare?ids=${next.join(",")}` : "/compare"); };
  const toggle = (id: string) => { const result = toggleSelection(ids, id); if (result.limited) { setNotice("Maximum 5 posts. Remove one before adding another."); return; } changeIds(result.ids); };
  const suggestions = useMemo(() => picker.filter((post) => !ids.includes(post.id) && `${post.title} ${post.topic}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8), [picker, ids, query]);
  const chartData = items.map((post) => ({ id: post.id, name: post.title.length > 22 ? `${post.title.slice(0, 22)}…` : post.title, value: post.latestMetric?.[metric] ?? 0 }));

  return <div className="page-wrap compare-page">
    <header className="page-header"><div><p className="eyebrow">Side-by-side intelligence</p><h1>Compare posts</h1><p>Find the content signals behind stronger performance.</p></div><div className="compare-count"><strong>{ids.length}</strong><span>of 5 posts<br/>selected</span></div></header>
    <div className="compare-layout">
      <div className="compare-main">
        {ids.length < 2 ? <section className="state-box compare-empty"><span className="empty-icon" aria-hidden="true">⇄</span><strong>Select at least 2 posts</strong><p>Choose posts from the picker or build your selection in the Posts explorer.</p><Link className="primary-action" href="/posts">Browse all posts</Link></section> : error ? <section className="state-box" role="alert"><strong>Comparison unavailable</strong><p>{error}</p></section> : loading ? <section className="panel compare-loading">Building comparison…</section> : <>
          <section className="panel chart-panel compare-chart-panel"><div className="section-heading"><div><p className="eyebrow">Metric comparison</p><h2>{friendlyLabel(metric)}</h2></div><div className="segmented" aria-label="Comparison chart metric">{metricOptions.map((option) => <button key={option.key} aria-pressed={metric === option.key} onClick={() => setMetric(option.key)}>{option.label}</button>)}</div></div><div className="compare-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 12, right: 8, left: -14, bottom: 24 }}><CartesianGrid stroke="#26313a" vertical={false}/><XAxis dataKey="name" interval={0} angle={-12} textAnchor="end" tick={{ fill: "#99a6af", fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={(value) => metric === "engagementRate" ? `${value}%` : compactNumber.format(value)} tick={{ fill: "#84919c", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip formatter={(value) => [metric === "engagementRate" ? percent(Number(value)) : fullNumber.format(Number(value)), friendlyLabel(metric)]} contentStyle={{ background: "#161d22", border: "1px solid #34414a", borderRadius: 8 }}/><Bar dataKey="value" radius={[4, 4, 0, 0]}>{chartData.map((row, index) => <Cell key={row.id} fill={colors[index]}/>)}</Bar></BarChart></ResponsiveContainer></div></section>
          <ComparisonTable items={items}/>
        </>}
      </div>
      <aside className="panel post-picker" aria-label="Post picker"><div className="section-heading"><div><p className="eyebrow">Selection</p><h2>Choose posts</h2></div><span>{ids.length}/5</span></div>{notice && <p className="picker-notice" role="status">{notice}</p>}<div className="selected-chips">{items.length ? items.map((post) => <button key={post.id} onClick={() => toggle(post.id)} title={`Remove ${post.title}`}><span>{post.title}</span>×</button>) : ids.map((id) => <button key={id} onClick={() => toggle(id)}><span>Selected post</span>×</button>)}</div><label className="picker-search">Find a post<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or topic"/></label><div className="picker-list">{suggestions.map((post) => { const src = post.assets.find((a) => a.assetType === "thumbnail")?.assetUrl ?? post.assets[0]?.assetUrl; return <button key={post.id} onClick={() => toggle(post.id)} disabled={ids.length >= 5}>{src ? <img src={src} alt=""/> : <span className="mini-fallback">ASM</span>}<span><strong>{post.title}</strong><small>{post.topic} · {friendlyLabel(post.contentType)}</small></span><b aria-hidden="true">+</b></button>; })}{!suggestions.length && <p className="empty-inline">No additional posts found.</p>}</div><Link className="secondary-link" href="/posts">Open full post explorer →</Link></aside>
    </div>
  </div>;
}

function ComparisonTable({ items }: { items: Post[] }) {
  const metricRows: Array<{ label: string; key: MetricKey; format?: "percent" }> = [{ label: "Reach", key: "reach" }, { label: "Likes", key: "likes" }, { label: "Comments", key: "comments" }, { label: "Saves", key: "saves" }, { label: "Shares", key: "shares" }, { label: "Engagement rate", key: "engagementRate", format: "percent" }];
  const best = Object.fromEntries(metricRows.map(({ key }) => [key, bestMetricIds(items.map((post) => ({ id: post.id, value: post.latestMetric?.[key] })))])) as Record<MetricKey, Set<string>>;
  return <section className="panel comparison-table-panel"><div className="section-heading"><div><p className="eyebrow">Detail matrix</p><h2>Post breakdown</h2></div><small>Best value highlighted · ties included</small></div><div className="table-scroll"><table className="comparison-table"><thead><tr><th scope="col">Attribute</th>{items.map((post) => { const src = post.assets.find((a) => a.assetType === "thumbnail")?.assetUrl ?? post.assets[0]?.assetUrl; return <th key={post.id} scope="col"><div className="compare-post-head">{src ? <img src={src} alt=""/> : <span className="mini-fallback">ASM</span>}<span>{post.title}</span></div></th>; })}</tr></thead><tbody><TextRow label="Pillar" items={items} value={(post) => friendlyLabel(post.contentPillar)}/><TextRow label="Topic" items={items} value={(post) => post.topic}/><TextRow label="Style" items={items} value={(post) => friendlyLabel(post.creativeStyle)}/><TextRow label="Format" items={items} value={(post) => friendlyLabel(post.contentType)}/><TextRow label="Published" items={items} value={(post) => dateTimeLabel(post.publishedAt)}/>{metricRows.map(({ label, key, format }) => <tr key={key}><th scope="row">{label}</th>{items.map((post) => { const value = post.latestMetric?.[key]; const isBest = best[key].has(post.id); return <td key={post.id} className={isBest ? "best" : undefined}>{isBest && <span className="best-mark">Best</span>}<strong>{format === "percent" ? percent(value ?? 0) : fullNumber.format(value ?? 0)}</strong></td>; })}</tr>)}</tbody></table></div></section>;
}
function TextRow({ label, items, value }: { label: string; items: Post[]; value: (post: Post) => string }) { return <tr><th scope="row">{label}</th>{items.map((post) => <td key={post.id}>{value(post)}</td>)}</tr>; }
