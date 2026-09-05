"use client";
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { bestMetricIds, compactNumber, dateTimeLabel, friendlyLabel, fullNumber, percent, Post, readStoredSelection, storeSelection, toggleSelection } from "@/lib/frontend";
import DataSourceBadge from "../data-source-badge";

type MetricKey = "reach" | "likes" | "comments" | "saves" | "shares" | "engagementRate";
const metricOptions: Array<{ key: MetricKey; label: string }> = [{ key: "reach", label: "Jangkauan" }, { key: "likes", label: "Suka" }, { key: "comments", label: "Komentar" }, { key: "saves", label: "Simpan" }, { key: "shares", label: "Bagikan" }, { key: "engagementRate", label: "Rasio" }];
const colors = ["#2d7a7a", "#5a9e9e", "#8bbcbc", "#a8d0d0", "#c5e2e2"];

export default function CompareClient() {
  const params = useSearchParams(); const router = useRouter();
  const [ids, setIds] = useState<string[]>([]); const [items, setItems] = useState<Post[]>([]); const [picker, setPicker] = useState<Post[]>([]);
  const [sourceInfo, setSourceInfo] = useState<{ dataMode: string; source: string } | null>(null);
  const [metric, setMetric] = useState<MetricKey>("reach"); const [query, setQuery] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  useEffect(() => { const urlIds = (params.get("ids") ?? "").split(",").filter(Boolean); setIds(urlIds.length ? [...new Set(urlIds)].slice(0, 5) : readStoredSelection()); }, [params]);
  useEffect(() => { fetch("/api/posts?pageSize=100&sort=publishDate&order=desc").then((r) => r.ok ? r.json() : Promise.reject()).then((data: { dataMode: string; source: string; items: Post[] }) => { setPicker(data.items); setSourceInfo(data); }).catch(() => undefined); }, []);
  useEffect(() => {
    if (ids.length < 2) { setItems([]); setError(""); return; }
    const controller = new AbortController(); setLoading(true); setError("");
    fetch(`/api/compare?ids=${ids.join(",")}`, { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<{ dataMode: string; source: string; items: Post[] }>; }).then(({ items: rows, ...source }) => { setItems(rows); setSourceInfo(source); }).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("Postingan yang dipilih tidak dapat dibandingkan. Mungkin salah satu sudah tidak tersedia."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ids]);
  const changeIds = (next: string[]) => { setIds(next); setNotice(""); storeSelection(next); router.replace(next.length ? `/compare?ids=${next.join(",")}` : "/compare"); };
  const toggle = (id: string) => { const result = toggleSelection(ids, id); if (result.limited) { setNotice("Maksimal 5 postingan. Hapus salah satu sebelum menambahkan yang lain."); return; } changeIds(result.ids); };
  const suggestions = useMemo(() => picker.filter((post) => !ids.includes(post.id) && `${post.title} ${post.topic}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8), [picker, ids, query]);
  const chartData = items.map((post) => ({ id: post.id, name: post.title.length > 22 ? `${post.title.slice(0, 22)}…` : post.title, value: post.latestMetric?.[metric] ?? 0 }));

  return <div className="page-wrap compare-page">
    <header className="page-header"><div><p className="eyebrow">Intelijen berdampingan</p><h1>Bandingkan postingan</h1><p>Temukan sinyal konten di balik kinerja yang lebih kuat.</p></div><div className="compare-count"><strong>{ids.length}</strong><span>dari 5 postingan<br/>dipilih</span></div></header>
    <DataSourceBadge dataMode={sourceInfo?.dataMode} source={sourceInfo?.source} capturedAt={(items.length ? items : picker).map((post) => post.latestMetric?.capturedAt).filter((value): value is string => Boolean(value)).sort().at(-1)}/>
    <div className="compare-layout">
      <div className="compare-main">
        {ids.length < 2 ? <section className="state-box compare-empty"><span className="empty-icon" aria-hidden="true">⇄</span><strong>Pilih minimal 2 postingan</strong><p>Pilih dari picker atau bangun seleksi Anda di eksplorasi Postingan.</p><Link className="primary-action" href="/posts">Jelajahi semua postingan</Link></section> : error ? <section className="state-box" role="alert"><strong>Perbandingan tidak tersedia</strong><p>{error}</p></section> : loading ? <section className="panel compare-loading">Membangun perbandingan…</section> : <>
          <section className="panel chart-panel compare-chart-panel"><div className="section-heading"><div><p className="eyebrow">Perbandingan metrik</p><h2>{friendlyLabel(metric)}</h2></div><div className="segmented" aria-label="Metrik grafik perbandingan">{metricOptions.map((option) => <button key={option.key} aria-pressed={metric === option.key} onClick={() => setMetric(option.key)}>{option.label}</button>)}</div></div><div className="compare-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 12, right: 8, left: -14, bottom: 24 }}><CartesianGrid stroke="#e5e4e1" vertical={false}/><XAxis dataKey="name" interval={0} angle={-12} textAnchor="end" tick={{ fill: "#7a7d84", fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={(value) => metric === "engagementRate" ? `${value}%` : compactNumber.format(value)} tick={{ fill: "#7a7d84", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip formatter={(value) => [metric === "engagementRate" ? percent(Number(value)) : fullNumber.format(Number(value)), friendlyLabel(metric)]} contentStyle={{ background: "#ffffff", border: "1px solid #e5e4e1", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.06)", fontFamily: "var(--font-body)" }}/><Bar dataKey="value" radius={[4, 4, 0, 0]}>{chartData.map((row, index) => <Cell key={row.id} fill={colors[index]}/>)}</Bar></BarChart></ResponsiveContainer></div></section>
          <ComparisonTable items={items}/>
        </>}
      </div>
      <aside className="panel post-picker" aria-label="Pemilih postingan"><div className="section-heading"><div><p className="eyebrow">Seleksi</p><h2>Pilih postingan</h2></div><span>{ids.length}/5</span></div>{notice && <p className="picker-notice" role="status">{notice}</p>}<div className="selected-chips">{items.length ? items.map((post) => <button key={post.id} onClick={() => toggle(post.id)} title={`Hapus ${post.title}`}><span>{post.title}</span>&#215;</button>) : ids.map((id) => <button key={id} onClick={() => toggle(id)}><span>Postingan dipilih</span>&#215;</button>)}</div><label className="picker-search">Cari postingan<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari judul atau topik"/></label><div className="picker-list">{suggestions.map((post) => { const src = post.assets.find((a) => a.assetType === "thumbnail")?.assetUrl ?? post.assets[0]?.assetUrl; return <button key={post.id} onClick={() => toggle(post.id)} disabled={ids.length >= 5}>{src ? <img src={src} alt=""/> : <span className="mini-fallback">ASM</span>}<span><strong>{post.title}</strong><small>{post.topic} · {friendlyLabel(post.contentType)}</small></span><b aria-hidden="true">+</b></button>; })}{!suggestions.length && <p className="empty-inline">Tidak ada postingan tambahan ditemukan.</p>}</div><Link className="secondary-link" href="/posts">Buka eksplorasi lengkap &#8594;</Link></aside>
    </div>
  </div>;
}

function ComparisonTable({ items }: { items: Post[] }) {
  const metricRows: Array<{ label: string; key: MetricKey; format?: "percent" }> = [{ label: "Jangkauan", key: "reach" }, { label: "Suka", key: "likes" }, { label: "Komentar", key: "comments" }, { label: "Simpan", key: "saves" }, { label: "Bagikan", key: "shares" }, { label: "Rasio interaksi", key: "engagementRate", format: "percent" }];
  const best = Object.fromEntries(metricRows.map(({ key }) => [key, bestMetricIds(items.map((post) => ({ id: post.id, value: post.latestMetric?.[key] })))])) as Record<MetricKey, Set<string>>;
  return <section className="panel comparison-table-panel"><div className="section-heading"><div><p className="eyebrow">Matriks detail</p><h2>Rincian postingan</h2></div><small>Nilai terbaik ditandai · termasuk seri</small></div><div className="table-scroll"><table className="comparison-table"><thead><tr><th scope="col">Atribut</th>{items.map((post) => { const src = post.assets.find((a) => a.assetType === "thumbnail")?.assetUrl ?? post.assets[0]?.assetUrl; return <th key={post.id} scope="col"><div className="compare-post-head">{src ? <img src={src} alt=""/> : <span className="mini-fallback">ASM</span>}<span>{post.title}</span></div></th>; })}</tr></thead><tbody><TextRow label="Pilar" items={items} value={(post) => friendlyLabel(post.contentPillar)}/><TextRow label="Topik" items={items} value={(post) => post.topic}/><TextRow label="Gaya" items={items} value={(post) => friendlyLabel(post.creativeStyle)}/><TextRow label="Format" items={items} value={(post) => friendlyLabel(post.contentType)}/><TextRow label="Diterbitkan" items={items} value={(post) => dateTimeLabel(post.publishedAt)}/>{metricRows.map(({ label, key, format }) => <tr key={key}><th scope="row">{label}</th>{items.map((post) => { const value = post.latestMetric?.[key]; const isBest = best[key].has(post.id); return <td key={post.id} className={isBest ? "best" : undefined}>{isBest && <span className="best-mark">Terbaik</span>}<strong>{format === "percent" ? percent(value ?? 0) : fullNumber.format(value ?? 0)}</strong></td>; })}</tr>)}</tbody></table></div></section>;
}
function TextRow({ label, items, value }: { label: string; items: Post[]; value: (post: Post) => string }) { return <tr><th scope="row">{label}</th>{items.map((post) => <td key={post.id}>{value(post)}</td>)}</tr>; }
