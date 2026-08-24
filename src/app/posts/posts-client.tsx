"use client";
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildApiQuery, compactNumber, dateLabel, dateTimeLabel, FilterOptions, friendlyLabel, fullNumber, percent, Post, readStoredSelection, storeSelection, toggleSelection } from "@/lib/frontend";

type PostResponse = { items: Post[]; pagination: { page: number; pageSize: number; total: number } };
type Filters = { search: string; topic: string; pillar: string; type: string; style: string; status: string; dateFrom: string; dateTo: string; sort: string; order: string; page: number };
const initial: Filters = { search: "", topic: "", pillar: "", type: "", style: "", status: "", dateFrom: "", dateTo: "", sort: "publishDate", order: "desc", page: 1 };

export default function PostsClient() {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const [filters, setFilters] = useState<Filters>(initial);
  const [response, setResponse] = useState<PostResponse | null>(null);
  const [options, setOptions] = useState<FilterOptions>({ accounts: [], topics: [], pillars: [], styles: [], types: [], statuses: [] });
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<Post | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const detailId = params.get("detail");

  useEffect(() => { const fromUrl = (params.get("ids") ?? "").split(",").filter(Boolean); setSelected(fromUrl.length ? fromUrl.slice(0, 5) : readStoredSelection()); }, [params]);
  useEffect(() => { fetch("/api/dashboard/overview").then((r) => r.ok ? r.json() : Promise.reject()).then((data: { filterOptions: FilterOptions }) => setOptions(data.filterOptions)).catch(() => undefined); }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    fetch(`/api/posts?${buildApiQuery({ ...filters, pageSize: 12 })}`, { signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<PostResponse>; })
      .then(setResponse).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("Posts are temporarily unavailable. Please try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters]);
  useEffect(() => {
    if (!detailId) { setDetail(null); return; }
    const controller = new AbortController(); setDetailLoading(true);
    fetch(`/api/posts/${detailId}`, { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<{ item: Post }>; }).then(({ item }) => setDetail(item)).catch(() => setNotice("Post detail could not be loaded.")).finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [detailId]);

  const update = (key: keyof Filters, value: string | number) => setFilters((current) => ({ ...current, [key]: value, ...(key !== "page" && { page: 1 }) }));
  const choose = (id: string) => { const result = toggleSelection(selected, id); if (result.limited) { setNotice("You can compare up to 5 posts. Remove one to add another."); return; } setNotice(""); setSelected(result.ids); storeSelection(result.ids); };
  const openDetail = (id: string) => { const next = new URLSearchParams(params.toString()); next.set("detail", id); router.replace(`${pathname}?${next}`); };
  const closeDetail = () => { const next = new URLSearchParams(params.toString()); next.delete("detail"); router.replace(next.size ? `${pathname}?${next}` : pathname); };
  const pages = Math.max(1, Math.ceil((response?.pagination.total ?? 0) / 12));

  return <div className="page-wrap posts-page">
    <header className="page-header"><div><p className="eyebrow">Content library</p><h1>Posts</h1><p>Search, filter and assemble a focused performance comparison.</p></div><Link className={`primary-action ${selected.length < 2 ? "disabled" : ""}`} aria-disabled={selected.length < 2} tabIndex={selected.length < 2 ? -1 : undefined} href={selected.length >= 2 ? `/compare?ids=${selected.join(",")}` : "/posts"}>Compare selected <span>{selected.length}/5</span></Link></header>

    <section className="filter-panel" aria-label="Post explorer filters">
      <div className="post-filter-top"><label className="search-label">Search posts<input type="search" placeholder="Title, caption or topic…" value={filters.search} onChange={(e) => update("search", e.target.value)} /></label><label>Sort by<select value={filters.sort} onChange={(e) => update("sort", e.target.value)}><option value="publishDate">Publish date</option><option value="reach">Reach</option><option value="engagementRate">Engagement rate</option><option value="saves">Saves</option><option value="shares">Shares</option></select></label><label>Order<select value={filters.order} onChange={(e) => update("order", e.target.value)}><option value="desc">High to low</option><option value="asc">Low to high</option></select></label></div>
      <div className="filter-grid post-filters">
        <Filter label="Topic" value={filters.topic} items={options.topics} onChange={(v) => update("topic", v)}/><Filter label="Pillar" value={filters.pillar} items={options.pillars} onChange={(v) => update("pillar", v)}/><Filter label="Type" value={filters.type} items={options.types} onChange={(v) => update("type", v)}/><Filter label="Style" value={filters.style} items={options.styles} onChange={(v) => update("style", v)}/><Filter label="Status" value={filters.status} items={options.statuses} onChange={(v) => update("status", v)}/><label>From<input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(e) => update("dateFrom", e.target.value)}/></label><label>To<input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(e) => update("dateTo", e.target.value)}/></label><button className="reset-filter" onClick={() => setFilters(initial)} disabled={JSON.stringify(filters) === JSON.stringify(initial)}>Reset</button>
      </div>
    </section>

    <div className="selection-bar" aria-live="polite"><span><strong>{selected.length}</strong> selected <small>{selected.length < 2 ? `Choose ${2 - selected.length} more to compare` : "Ready to compare"}</small></span>{notice && <p role="status">{notice}</p>}<Link className="primary-action" aria-disabled={selected.length < 2} tabIndex={selected.length < 2 ? -1 : undefined} href={selected.length >= 2 ? `/compare?ids=${selected.join(",")}` : "/posts"}>Compare selected</Link></div>

    {error ? <div className="state-box" role="alert"><strong>We couldn’t load posts</strong><p>{error}</p><button onClick={() => setFilters({ ...filters })}>Try again</button></div> : loading && !response ? <div className="post-grid" aria-label="Loading posts">{Array.from({ length: 6 }, (_, index) => <div className="post-card skeleton" key={index}/>)}</div> : response?.items.length ? <>
      <section className="post-grid" aria-label="Post results">{response.items.map((post) => <PostCard key={post.id} post={post} selected={selected.includes(post.id)} choose={() => choose(post.id)} open={() => openDetail(post.id)}/>)}</section>
      <nav className="pagination" aria-label="Post result pages"><button onClick={() => update("page", filters.page - 1)} disabled={filters.page <= 1}>← Previous</button><span>Page <strong>{filters.page}</strong> of {pages} · {response.pagination.total} posts</span><button onClick={() => update("page", filters.page + 1)} disabled={filters.page >= pages}>Next →</button></nav>
    </> : <div className="state-box empty"><strong>No posts found</strong><p>Adjust or reset the filters to broaden your results.</p><button onClick={() => setFilters(initial)}>Reset filters</button></div>}
    {(detailId || detailLoading) && <PostDialog post={detail} loading={detailLoading} close={closeDetail}/>} 
  </div>;
}

function Filter({ label, value, items, onChange }: { label: string; value: string; items: string[]; onChange: (v: string) => void }) { return <label>{label}<select value={value} onChange={(e) => onChange(e.target.value)}><option value="">All</option>{items.map((item) => <option key={item} value={item}>{friendlyLabel(item)}</option>)}</select></label>; }
function PostCard({ post, selected, choose, open }: { post: Post; selected: boolean; choose: () => void; open: () => void }) { const metric = post.latestMetric; const src = post.assets.find((a) => a.assetType === "thumbnail")?.assetUrl ?? post.assets[0]?.assetUrl; return <article className={selected ? "post-card selected" : "post-card"}><div className="post-media">{src ? <img src={src} alt="" loading="lazy"/> : <span className="media-fallback">ASM<small>{friendlyLabel(post.contentType)}</small></span>}<span className={`status ${post.status}`}>{friendlyLabel(post.status)}</span><label className="select-post"><input type="checkbox" checked={selected} onChange={choose}/><span>Select for compare</span></label></div><div className="post-card-body"><p className="post-meta">{post.topic}<span>·</span>{dateLabel(post.publishedAt)}</p><button className="post-title" onClick={open}>{post.title}</button><div className="tag-row"><span>{friendlyLabel(post.contentPillar)}</span><span>{friendlyLabel(post.creativeStyle)}</span><span>{friendlyLabel(post.contentType)}</span></div><dl className="post-stats"><div><dt>Reach</dt><dd>{compactNumber.format(metric?.reach ?? 0)}</dd></div><div><dt>Saves</dt><dd>{compactNumber.format(metric?.saves ?? 0)}</dd></div><div><dt>Shares</dt><dd>{compactNumber.format(metric?.shares ?? 0)}</dd></div><div><dt>Eng. rate</dt><dd>{percent(metric?.engagementRate ?? 0)}</dd></div></dl></div></article>; }
function PostDialog({ post, loading, close }: { post: Post | null; loading: boolean; close: () => void }) { const closeRef = useRef<HTMLButtonElement>(null); useEffect(() => { const previous = document.activeElement as HTMLElement | null; closeRef.current?.focus(); const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; document.addEventListener("keydown", key); document.body.classList.add("modal-open"); return () => { document.removeEventListener("keydown", key); document.body.classList.remove("modal-open"); previous?.focus(); }; }, [close]); const src = post?.assets.find((a) => a.assetType === "thumbnail")?.assetUrl ?? post?.assets[0]?.assetUrl; const latest = post?.metrics?.at(-1) ?? post?.latestMetric; return <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><section className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button ref={closeRef} className="dialog-close" onClick={close} aria-label="Close post detail">×</button>{loading || !post ? <div className="detail-loading">Loading post detail…</div> : <><div className="detail-preview">{src ? <img src={src} alt={`Preview of ${post.title}`}/> : <span className="media-fallback">ASM</span>}</div><div className="detail-content"><p className="eyebrow">{friendlyLabel(post.status)} · {post.socialAccount.platform}</p><h2 id="detail-title">{post.title}</h2><p className="caption">{post.caption}</p><dl className="detail-meta"><div><dt>Published</dt><dd>{dateTimeLabel(post.publishedAt)}</dd></div><div><dt>Account</dt><dd>@{post.socialAccount.username}</dd></div><div><dt>Topic</dt><dd>{post.topic}</dd></div><div><dt>Format</dt><dd>{friendlyLabel(post.contentType)}</dd></div><div><dt>Pillar</dt><dd>{friendlyLabel(post.contentPillar)}</dd></div><div><dt>Style</dt><dd>{friendlyLabel(post.creativeStyle)}</dd></div></dl><h3>Current performance</h3><dl className="detail-kpis">{[["Reach", latest?.reach],["Likes", latest?.likes],["Comments", latest?.comments],["Saves", latest?.saves],["Shares", latest?.shares],["Eng. rate", percent(latest?.engagementRate ?? 0)]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{typeof value === "number" ? fullNumber.format(value) : value}</dd></div>)}</dl><div className="detail-chart-heading"><h3>Reach history</h3><small>{post.metrics?.length ?? 0} snapshots</small></div>{post.metrics?.length ? <div className="detail-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={post.metrics}><CartesianGrid stroke="#29343c" vertical={false}/><XAxis dataKey="capturedAt" tickFormatter={dateLabel} tick={{ fill: "#84919c", fontSize: 10 }} axisLine={false}/><YAxis tickFormatter={(v) => compactNumber.format(v)} tick={{ fill: "#84919c", fontSize: 10 }} axisLine={false}/><Tooltip labelFormatter={(v) => dateTimeLabel(String(v))} contentStyle={{ background: "#161d22", border: "1px solid #34414a" }}/><Line type="monotone" dataKey="reach" stroke="#d69d55" strokeWidth={2} dot={{ r: 3 }}/></LineChart></ResponsiveContainer></div> : <p className="empty-inline">No historical snapshots yet.</p>}</div></>}</section></div>; }
