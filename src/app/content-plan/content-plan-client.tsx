"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useRef, useState } from "react";
import { buildApiQuery, CONTENT_PLAN_WORKFLOW, type ContentPlanStatus, duplicateReasonLabel, friendlyLabel, importSummaryItems, type ImportSummary, nextContentPlanStatus, planDateLabel } from "@/lib/frontend";

type PlanItem = {
  id: string; Content_ID: string; date: string; hari: string; test_publish_window: string; pillar: string; goal: string;
  format: string; creative_style: string; audience: string; topic: string; working_title: string; hook: string; core_angle: string;
  slide_1: string; slide_2: string; slide_3: string; slide_4_5: string; visual_direction: string; cta: string; caption_brief: string;
  primary_metric: string; secondary_metric: string; engagement_mechanic: string; story_companion: string; experiment_tag: string;
  product_focus: string; claim_guardrail: string; assets_needed: string; status: ContentPlanStatus; approval_status: string;
  publish_status: string; publishing_mode: string; created_at: string; updated_at: string;
};
type ListResponse = { items: PlanItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
type TodayResponse = { date: string; timezone: string; items: PlanItem[] };
type PreviewRow = { row: number; contentId?: string; valid: boolean; errors: string[]; duplicateReason: "within_file" | "existing_database" | null };
type Preview = { summary: ImportSummary; rows: PreviewRow[]; errors: Array<{ row: number; contentId?: string; message: string }> };
type ImportResult = { inserted: number; skipped: number; errors: Array<{ row: number; contentId?: string; message: string }>; count: { total: number; inserted: number; skipped: number; invalid: number } };
type Filters = { search: string; status: string; pillar: string; topic: string; dateFrom: string; dateTo: string; sort: "asc" | "desc"; page: number };
const initialFilters: Filters = { search: "", status: "", pillar: "", topic: "", dateFrom: "", dateTo: "", sort: "asc", page: 1 };
const MAX_FILE_SIZE = 1024 * 1024;

const briefSections: Array<[string, Array<[keyof PlanItem, string]>]> = [
  ["Schedule & intent", [["Content_ID", "Content ID"], ["date", "Planned date"], ["hari", "Day"], ["test_publish_window", "Publish window"], ["audience", "Audience"], ["pillar", "Pillar"], ["goal", "Goal"], ["format", "Format"], ["creative_style", "Creative style"], ["topic", "Topic"], ["product_focus", "Product focus"]]],
  ["Editorial brief", [["working_title", "Working title"], ["hook", "Hook"], ["core_angle", "Core angle"], ["slide_1", "Slide 1"], ["slide_2", "Slide 2"], ["slide_3", "Slide 3"], ["slide_4_5", "Slides 4–5"], ["visual_direction", "Visual direction"], ["assets_needed", "Assets needed"], ["cta", "CTA"], ["caption_brief", "Caption brief"]]],
  ["Measurement & guardrails", [["primary_metric", "Primary metric"], ["secondary_metric", "Secondary metric"], ["engagement_mechanic", "Engagement mechanic"], ["story_companion", "Story companion"], ["experiment_tag", "Experiment tag"], ["claim_guardrail", "Claim guardrail"], ["publishing_mode", "Publishing mode"], ["status", "Workflow status"], ["approval_status", "Approval"], ["publish_status", "Publish status"]]],
];

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw Object.assign(new Error(body.error || "Request could not be completed."), { status: response.status });
  return body;
}

export default function ContentPlanClient() {
  const [filters, setFilters] = useState(initialFilters);
  const [list, setList] = useState<ListResponse | null>(null);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [todayLoading, setTodayLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlanItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    const controller = new AbortController(); setTodayLoading(true);
    apiJson<TodayResponse>("/api/content-plan/today", { signal: controller.signal }).then(setToday).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setNotice("Today’s content could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setTodayLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    apiJson<ListResponse>(`/api/content-plan?${buildApiQuery({ ...filters, pageSize: 25 })}`, { signal: controller.signal })
      .then(setList).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Content plan is unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, refresh]);

  const loadDetail = useCallback(async (contentId: string) => {
    setDetailLoading(true);
    try { setDetail((await apiJson<{ item: PlanItem }>(`/api/content-plan/${encodeURIComponent(contentId)}`)).item); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Brief could not be loaded."); setDetailId(null); }
    finally { setDetailLoading(false); }
  }, []);
  useEffect(() => { if (detailId) void loadDetail(detailId); else setDetail(null); }, [detailId, loadDetail]);

  const update = (key: keyof Filters, value: string | number) => setFilters((current) => ({ ...current, [key]: value, ...(key !== "page" && { page: 1 }) }));
  const advanceStatus = async () => {
    if (!detail) return;
    const next = nextContentPlanStatus(detail.status); if (!next) return;
    setStatusBusy(true); setNotice("");
    try {
      const result = await apiJson<{ item: PlanItem }>(`/api/content-plan/${encodeURIComponent(detail.Content_ID)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next.status }) });
      setDetail(result.item); setNotice(`Workflow advanced to ${friendlyLabel(result.item.status)}.`); setRefresh((value) => value + 1);
    } catch (reason) {
      if ((reason as { status?: number }).status === 409) { await loadDetail(detail.Content_ID); setNotice("The workflow changed elsewhere. The latest brief has been loaded; review it before trying again."); }
      else setNotice(reason instanceof Error ? reason.message : "Workflow could not be updated.");
    } finally { setStatusBusy(false); }
  };

  const chooseFile = (selected: File | null) => {
    setPreview(null); setImportResult(null); setUploadError(""); setFile(null);
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".csv")) return setUploadError("Choose a .csv file.");
    if (selected.size > MAX_FILE_SIZE) return setUploadError("CSV must be 1 MiB or smaller.");
    setFile(selected);
  };
  const postFile = <T,>(url: string) => { const form = new FormData(); form.set("file", file as File); return apiJson<T>(url, { method: "POST", body: form }); };
  const previewFile = async () => {
    if (!file) return;
    setImportBusy(true); setUploadError(""); setImportResult(null);
    try { setPreview(await postFile<Preview>("/api/content-plan/import/preview")); }
    catch (reason) { setPreview(null); setUploadError(reason instanceof Error ? reason.message : "CSV preview failed."); }
    finally { setImportBusy(false); }
  };
  const importFile = async () => {
    if (!file || !preview || !window.confirm(`Import ${preview.summary.insertable} insertable row(s)? Existing Content IDs will be skipped.`)) return;
    setImportBusy(true); setUploadError("");
    try { const result = await postFile<ImportResult>("/api/content-plan/import"); setImportResult(result); setNotice(`Import complete: ${result.inserted} inserted, ${result.skipped} skipped.`); setRefresh((value) => value + 1); }
    catch (reason) { setUploadError(reason instanceof Error ? reason.message : "CSV import failed."); }
    finally { setImportBusy(false); }
  };

  return <div className="page-wrap content-plan-page">
    <header className="page-header"><div><p className="eyebrow">Editorial operations</p><h1>CONTENT PLAN</h1><p>One source of truth for briefs, workflow readiness, and measured publishing intent.</p></div><span className="live-badge"><span/>API-backed plan</span></header>
    <div className="cp-live" aria-live="polite">{notice}</div>

    <section className="panel today-panel" aria-labelledby="today-heading">
      <div className="section-heading"><div><p className="eyebrow">Asia/Jakarta · WIB</p><h2 id="today-heading">TODAY&apos;S CONTENT</h2></div>{today && <small>{planDateLabel(today.date)}</small>}</div>
      {todayLoading ? <div className="cp-loading">Loading today’s brief…</div> : !today?.items.length ? <div className="today-empty"><strong>No content planned for today</strong><p>The API returned no briefs for the current WIB date. Nothing has been fabricated.</p></div> : <div className="today-list">{today.items.map((item) => <TodayBrief key={item.Content_ID} item={item} open={() => setDetailId(item.Content_ID)}/>)}</div>}
    </section>

    <section className="panel import-panel" aria-labelledby="import-heading">
      <div className="section-heading"><div><p className="eyebrow">Two-phase intake</p><h2 id="import-heading">CSV PREVIEW &amp; IMPORT</h2></div><small>Exact schema · max 1 MiB</small></div>
      <div className="import-controls"><label className="file-input">Content plan CSV<input type="file" accept=".csv,text/csv" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}/></label><button className="secondary-action" type="button" onClick={previewFile} disabled={!file || importBusy}>{importBusy && !preview ? "Checking…" : "Preview CSV"}</button>{file && <span className="file-name">{file.name}</span>}</div>
      {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
      {preview && <div className="preview-block"><dl className="import-summary">{importSummaryItems(preview.summary).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="table-scroll"><table className="preview-table"><caption className="sr-only">CSV preview validation rows</caption><thead><tr><th>Row</th><th>Content ID</th><th>Validity</th><th>Errors</th><th>Duplicate reason</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.row}><td>{row.row}</td><td>{row.contentId || "—"}</td><td><Badge value={row.valid ? "valid" : "invalid"}/></td><td>{row.errors.join("; ") || "—"}</td><td>{duplicateReasonLabel(row.duplicateReason)}</td></tr>)}</tbody></table></div><div className="import-commit"><p>Preview only. Nothing has been written.</p><button className="primary-action" type="button" onClick={importFile} disabled={importBusy}>{importBusy ? "Importing…" : `Confirm import (${preview.summary.insertable})`}</button></div></div>}
      {importResult && <div className="import-result" role="status"><strong>Import complete</strong><span>{importResult.inserted} inserted</span><span>{importResult.skipped} skipped</span><span>{importResult.count.invalid} invalid</span>{importResult.errors.length > 0 && <p>{importResult.errors.map((item) => `Row ${item.row}: ${item.message}`).join(" · ")}</p>}</div>}
    </section>

    <section aria-labelledby="plan-list-heading">
      <div className="cp-list-heading"><div><p className="eyebrow">Source of truth</p><h2 id="plan-list-heading">ALL CONTENT</h2></div>{list && <span>{list.pagination.total} briefs</span>}</div>
      <div className="filter-panel cp-filters" aria-label="Content plan filters"><label className="cp-search">Search<input type="search" placeholder="Content ID, title, hook, angle or topic…" value={filters.search} onChange={(event) => update("search", event.target.value)}/></label><label>Status<select value={filters.status} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option>{CONTENT_PLAN_WORKFLOW.map((status) => <option value={status} key={status}>{friendlyLabel(status)}</option>)}</select></label><label>Pillar<input value={filters.pillar} onChange={(event) => update("pillar", event.target.value)}/></label><label>Topic<input value={filters.topic} onChange={(event) => update("topic", event.target.value)}/></label><label>From<input type="date" max={filters.dateTo || undefined} value={filters.dateFrom} onChange={(event) => update("dateFrom", event.target.value)}/></label><label>To<input type="date" min={filters.dateFrom || undefined} value={filters.dateTo} onChange={(event) => update("dateTo", event.target.value)}/></label><label>Date order<select value={filters.sort} onChange={(event) => update("sort", event.target.value)}><option value="asc">Oldest first</option><option value="desc">Newest first</option></select></label><button className="reset-filter" onClick={() => setFilters(initialFilters)} disabled={JSON.stringify(filters) === JSON.stringify(initialFilters)}>Reset</button></div>
      {error ? <div className="state-box" role="alert"><strong>We couldn’t load the content plan</strong><p>{error}</p><button onClick={() => setRefresh((value) => value + 1)}>Try again</button></div> : loading && !list ? <div className="cp-loading panel">Loading content plan…</div> : list?.items.length ? <><div className="panel table-scroll"><table className="content-plan-table"><caption className="sr-only">Content plan briefs</caption><thead><tr><th>Date</th><th>Content ID</th><th>Title</th><th>Pillar</th><th>Format</th><th>Status</th><th>Approval</th><th>Publish Status</th></tr></thead><tbody>{list.items.map((item) => <tr key={item.Content_ID} onClick={() => setDetailId(item.Content_ID)}><td>{planDateLabel(item.date)}</td><td><button type="button" className="row-link" onClick={() => setDetailId(item.Content_ID)}>{item.Content_ID}</button></td><td>{item.working_title || "—"}</td><td>{item.pillar || "—"}</td><td>{item.format || "—"}</td><td><Badge value={item.status}/></td><td><Badge value={item.approval_status}/></td><td><Badge value={item.publish_status}/></td></tr>)}</tbody></table></div><nav className="pagination" aria-label="Content plan pages"><button onClick={() => update("page", filters.page - 1)} disabled={filters.page <= 1}>← Previous</button><span>Page <strong>{list.pagination.page}</strong> of {Math.max(1, list.pagination.totalPages)} · {list.pagination.total} briefs</span><button onClick={() => update("page", filters.page + 1)} disabled={filters.page >= list.pagination.totalPages}>Next →</button></nav></> : <div className="state-box empty"><strong>No content briefs found</strong><p>Adjust or reset filters to broaden the source-of-truth list.</p><button onClick={() => setFilters(initialFilters)}>Reset filters</button></div>}
    </section>
    {detailId && <BriefDialog item={detail} loading={detailLoading} busy={statusBusy} close={() => setDetailId(null)} advance={advanceStatus}/>} 
  </div>;
}

function Badge({ value }: { value: string }) { return <span className={`cp-badge ${value}`}>{friendlyLabel(value || "unknown")}</span>; }
function TodayBrief({ item, open }: { item: PlanItem; open: () => void }) { return <article className="today-brief"><div className="today-primary"><div><span className="content-id">{item.Content_ID}</span><h3>{item.working_title || "Untitled brief"}</h3><p>{item.hook || item.core_angle || "No hook or core angle supplied."}</p></div><div className="today-actions"><Badge value={item.status}/><button className="primary-action" type="button" onClick={open}>OPEN BRIEF</button></div></div><dl className="today-meta"><div><dt>Plan</dt><dd>{planDateLabel(item.date)} · {item.hari || "—"} · {item.test_publish_window || "—"}</dd></div><div><dt>Audience</dt><dd>{item.audience || "—"}</dd></div><div><dt>Direction</dt><dd>{item.pillar || "—"} · {item.format || "—"} · {item.creative_style || "—"}</dd></div><div><dt>Governance</dt><dd>{friendlyLabel(item.approval_status)} approval · {friendlyLabel(item.publish_status)} publish</dd></div></dl><details><summary>Scan complete brief</summary><BriefFields item={item}/></details></article>; }
function BriefFields({ item }: { item: PlanItem }) { return <div className="brief-sections">{briefSections.map(([heading, fields]) => <section key={heading}><h3>{heading}</h3><dl>{fields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{key === "date" ? planDateLabel(String(item[key])) : String(item[key] || "—")}</dd></div>)}</dl></section>)}</div>; }
function BriefDialog({ item, loading, busy, close, advance }: { item: PlanItem | null; loading: boolean; busy: boolean; close: () => void; advance: () => void }) {
  const drawer = useRef<HTMLElement>(null); const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; closeRef.current?.focus(); document.body.classList.add("modal-open"); const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); if (event.key === "Tab" && drawer.current) { const focusable = [...drawer.current.querySelectorAll<HTMLElement>("button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter((node) => !node.hasAttribute("disabled")); if (!focusable.length) return; const first = focusable[0], last = focusable.at(-1)!; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }; document.addEventListener("keydown", key); return () => { document.removeEventListener("keydown", key); document.body.classList.remove("modal-open"); previous?.focus(); }; }, [close]);
  const next = item ? nextContentPlanStatus(item.status) : null;
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={drawer} className="detail-drawer cp-drawer" role="dialog" aria-modal="true" aria-labelledby="brief-title"><button ref={closeRef} className="dialog-close" onClick={close} aria-label="Close content brief">×</button>{loading || !item ? <div className="detail-loading">Loading full brief…</div> : <div className="detail-content"><p className="eyebrow">Full content brief · {item.Content_ID}</p><h2 id="brief-title">{item.working_title || "Untitled brief"}</h2><div className="workflow-control"><div><span>Current workflow</span><Badge value={item.status}/><small>Approval: {friendlyLabel(item.approval_status)} · Publish: {friendlyLabel(item.publish_status)} (read-only)</small></div>{next ? <button className="primary-action" type="button" disabled={busy} onClick={advance}>{busy ? "Updating…" : next.label}</button> : <span className="workflow-ceiling">Workflow complete · Measuring</span>}</div><BriefFields item={item}/><p className="detail-updated">Last updated {new Date(item.updated_at).toLocaleString("en-GB")}</p></div>}</section></div>;
}
