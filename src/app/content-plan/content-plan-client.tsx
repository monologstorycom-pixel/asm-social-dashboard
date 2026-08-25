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
  ["Jadwal & tujuan", [["Content_ID", "Content ID"], ["date", "Tanggal rencana"], ["hari", "Hari"], ["test_publish_window", "Jendela publikasi"], ["audience", "Audiens"], ["pillar", "Pilar"], ["goal", "Tujuan"], ["format", "Format"], ["creative_style", "Gaya kreatif"], ["topic", "Topik"], ["product_focus", "Fokus produk"]]],
  ["Brief editorial", [["working_title", "Judul kerja"], ["hook", "Hook"], ["core_angle", "Sudut inti"], ["slide_1", "Slide 1"], ["slide_2", "Slide 2"], ["slide_3", "Slide 3"], ["slide_4_5", "Slide 4–5"], ["visual_direction", "Arah visual"], ["assets_needed", "Aset yang dibutuhkan"], ["cta", "CTA"], ["caption_brief", "Brief caption"]]],
  ["Pengukuran & pengawalan", [["primary_metric", "Metrik utama"], ["secondary_metric", "Metrik sekunder"], ["engagement_mechanic", "Mekanisme interaksi"], ["story_companion", "Pendamping story"], ["experiment_tag", "Tag eksperimen"], ["claim_guardrail", "Pengawalan klaim"], ["publishing_mode", "Mode publikasi"], ["status", "Status alur kerja"], ["approval_status", "Persetujuan"], ["publish_status", "Status publikasi"]]],
];

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw Object.assign(new Error(body.error || "Permintaan tidak dapat diselesaikan."), { status: response.status });
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
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setNotice("Konten hari ini tidak dapat dimuat.");
    }).finally(() => { if (!controller.signal.aborted) setTodayLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    apiJson<ListResponse>(`/api/content-plan?${buildApiQuery({ ...filters, pageSize: 25 })}`, { signal: controller.signal })
      .then(setList).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Rencana konten tidak tersedia."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, refresh]);

  const loadDetail = useCallback(async (contentId: string) => {
    setDetailLoading(true);
    try { setDetail((await apiJson<{ item: PlanItem }>(`/api/content-plan/${encodeURIComponent(contentId)}`)).item); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Brief tidak dapat dimuat."); setDetailId(null); }
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
      setDetail(result.item); setNotice(`Alur kerja dilanjutkan ke ${friendlyLabel(result.item.status)}.`); setRefresh((value) => value + 1);
    } catch (reason) {
      if ((reason as { status?: number }).status === 409) { await loadDetail(detail.Content_ID); setNotice("Alur kerja berubah di tempat lain. Brief terbaru telah dimuat; tinjau sebelum mencoba lagi."); }
      else setNotice(reason instanceof Error ? reason.message : "Alur kerja tidak dapat diperbarui.");
    } finally { setStatusBusy(false); }
  };

  const chooseFile = (selected: File | null) => {
    setPreview(null); setImportResult(null); setUploadError(""); setFile(null);
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".csv")) return setUploadError("Pilih file .csv.");
    if (selected.size > MAX_FILE_SIZE) return setUploadError("CSV harus maksimal 1 MiB.");
    setFile(selected);
  };
  const postFile = <T,>(url: string) => { const form = new FormData(); form.set("file", file as File); return apiJson<T>(url, { method: "POST", body: form }); };
  const previewFile = async () => {
    if (!file) return;
    setImportBusy(true); setUploadError(""); setImportResult(null);
    try { setPreview(await postFile<Preview>("/api/content-plan/import/preview")); }
    catch (reason) { setPreview(null); setUploadError(reason instanceof Error ? reason.message : "Pratinjau CSV gagal."); }
    finally { setImportBusy(false); }
  };
  const importFile = async () => {
    if (!file || !preview || !window.confirm(`Impor ${preview.summary.insertable} baris yang bisa diimpor? Content ID yang sudah ada akan dilewati.`)) return;
    setImportBusy(true); setUploadError("");
    try { const result = await postFile<ImportResult>("/api/content-plan/import"); setImportResult(result); setNotice(`Impor selesai: ${result.inserted} dimasukkan, ${result.skipped} dilewati.`); setRefresh((value) => value + 1); }
    catch (reason) { setUploadError(reason instanceof Error ? reason.message : "Impor CSV gagal."); }
    finally { setImportBusy(false); }
  };

  return <div className="page-wrap content-plan-page">
    <header className="page-header"><div><p className="eyebrow">Operasi editorial</p><h1>RENCANA KONTEN</h1><p>Satu sumber kebenaran untuk brief, kesiapan alur kerja, dan niat publikasi yang terukur.</p></div><span className="live-badge"><span/>Rencana berbasis API</span></header>
    <div className="cp-live" aria-live="polite">{notice}</div>

    <section className="panel today-panel" aria-labelledby="today-heading">
      <div className="section-heading"><div><p className="eyebrow">Asia/Jakarta · WIB</p><h2 id="today-heading">KONTEN HARI INI</h2></div>{today && <small>{planDateLabel(today.date)}</small>}</div>
      {todayLoading ? <div className="cp-loading">Memuat brief hari ini…</div> : !today?.items.length ? <div className="today-empty"><strong>Tidak ada konten direncanakan hari ini</strong><p>API tidak mengembalikan brief untuk tanggal WIB saat ini. Tidak ada yang dibuat-buat.</p></div> : <div className="today-list">{today.items.map((item) => <TodayBrief key={item.Content_ID} item={item} open={() => setDetailId(item.Content_ID)}/>)}</div>}
    </section>

    <section className="panel import-panel" aria-labelledby="import-heading">
      <div className="section-heading"><div><p className="eyebrow">Penerimaan dua fase</p><h2 id="import-heading">PRATINJAU &amp; IMPOR CSV</h2></div><small>Skema persis · maks 1 MiB</small></div>
      <div className="import-controls"><label className="file-input">Rencana konten CSV<input type="file" accept=".csv,text/csv" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}/></label><button className="secondary-action" type="button" onClick={previewFile} disabled={!file || importBusy}>{importBusy && !preview ? "Mengecek…" : "Pratinjau CSV"}</button>{file && <span className="file-name">{file.name}</span>}</div>
      {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
      {preview && <div className="preview-block"><dl className="import-summary">{importSummaryItems(preview.summary).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="table-scroll"><table className="preview-table"><caption className="sr-only">Baris validasi pratinjau CSV</caption><thead><tr><th>Baris</th><th>Content ID</th><th>Validitas</th><th>Error</th><th>Alasan duplikat</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.row}><td>{row.row}</td><td>{row.contentId || "—"}</td><td><Badge value={row.valid ? "valid" : "invalid"}/></td><td>{row.errors.join("; ") || "—"}</td><td>{duplicateReasonLabel(row.duplicateReason)}</td></tr>)}</tbody></table></div><div className="import-commit"><p>Hanya pratinjau. Belum ada yang ditulis.</p><button className="primary-action" type="button" onClick={importFile} disabled={importBusy}>{importBusy ? "Mengimpor…" : `Konfirmasi impor (${preview.summary.insertable})`}</button></div></div>}
      {importResult && <div className="import-result" role="status"><strong>Impor selesai</strong><span>{importResult.inserted} dimasukkan</span><span>{importResult.skipped} dilewati</span><span>{importResult.count.invalid} tidak valid</span>{importResult.errors.length > 0 && <p>{importResult.errors.map((item) => `Baris ${item.row}: ${item.message}`).join(" · ")}</p>}</div>}
    </section>

    <section aria-labelledby="plan-list-heading">
      <div className="cp-list-heading"><div><p className="eyebrow">Sumber kebenaran</p><h2 id="plan-list-heading">SEMUA KONTEN</h2></div>{list && <span>{list.pagination.total} brief</span>}</div>
      <div className="filter-panel cp-filters" aria-label="Filter rencana konten"><label className="cp-search">Cari<input type="search" placeholder="Content ID, judul, hook, sudut, atau topik…" value={filters.search} onChange={(event) => update("search", event.target.value)}/></label><label>Status<select value={filters.status} onChange={(event) => update("status", event.target.value)}><option value="">Semua status</option>{CONTENT_PLAN_WORKFLOW.map((status) => <option value={status} key={status}>{friendlyLabel(status)}</option>)}</select></label><label>Pilar<input value={filters.pillar} onChange={(event) => update("pillar", event.target.value)}/></label><label>Topik<input value={filters.topic} onChange={(event) => update("topic", event.target.value)}/></label><label>Dari<input type="date" max={filters.dateTo || undefined} value={filters.dateFrom} onChange={(event) => update("dateFrom", event.target.value)}/></label><label>Sampai<input type="date" min={filters.dateFrom || undefined} value={filters.dateTo} onChange={(event) => update("dateTo", event.target.value)}/></label><label>Urutan tanggal<select value={filters.sort} onChange={(event) => update("sort", event.target.value)}><option value="asc">Paling lama</option><option value="desc">Paling baru</option></select></label><button className="reset-filter" onClick={() => setFilters(initialFilters)} disabled={JSON.stringify(filters) === JSON.stringify(initialFilters)}>Atur ulang</button></div>
      {error ? <div className="state-box" role="alert"><strong>Gagal memuat rencana konten</strong><p>{error}</p><button onClick={() => setRefresh((value) => value + 1)}>Coba lagi</button></div> : loading && !list ? <div className="cp-loading panel">Memuat rencana konten…</div> : list?.items.length ? <><div className="panel table-scroll"><table className="content-plan-table"><caption className="sr-only">Brief rencana konten</caption><thead><tr><th>Tanggal</th><th>Content ID</th><th>Judul</th><th>Pilar</th><th>Format</th><th>Status</th><th>Persetujuan</th><th>Status Publikasi</th></tr></thead><tbody>{list.items.map((item) => <tr key={item.Content_ID} onClick={() => setDetailId(item.Content_ID)}><td>{planDateLabel(item.date)}</td><td><button type="button" className="row-link" onClick={() => setDetailId(item.Content_ID)}>{item.Content_ID}</button></td><td>{item.working_title || "—"}</td><td>{item.pillar || "—"}</td><td>{item.format || "—"}</td><td><Badge value={item.status}/></td><td><Badge value={item.approval_status}/></td><td><Badge value={item.publish_status}/></td></tr>)}</tbody></table></div><nav className="pagination" aria-label="Halaman rencana konten"><button onClick={() => update("page", filters.page - 1)} disabled={filters.page <= 1}>&#8592; Sebelumnya</button><span>Halaman <strong>{list.pagination.page}</strong> dari {Math.max(1, list.pagination.totalPages)} · {list.pagination.total} brief</span><button onClick={() => update("page", filters.page + 1)} disabled={filters.page >= list.pagination.totalPages}>Berikutnya &#8594;</button></nav></> : <div className="state-box empty"><strong>Tidak ada brief konten ditemukan</strong><p>Sesuaikan atau atur ulang filter untuk memperluas daftar sumber kebenaran.</p><button onClick={() => setFilters(initialFilters)}>Atur ulang filter</button></div>}
    </section>
    {detailId && <BriefDialog item={detail} loading={detailLoading} busy={statusBusy} close={() => setDetailId(null)} advance={advanceStatus}/>} 
  </div>;
}

function Badge({ value }: { value: string }) { return <span className={`cp-badge ${value}`}>{friendlyLabel(value || "tidak diketahui")}</span>; }
function TodayBrief({ item, open }: { item: PlanItem; open: () => void }) { return <article className="today-brief"><div className="today-primary"><div><span className="content-id">{item.Content_ID}</span><h3>{item.working_title || "Brief tanpa judul"}</h3><p>{item.hook || item.core_angle || "Tidak ada hook atau sudut inti yang diberikan."}</p></div><div className="today-actions"><Badge value={item.status}/><button className="primary-action" type="button" onClick={open}>BUKA BRIEF</button></div></div><dl className="today-meta"><div><dt>Rencana</dt><dd>{planDateLabel(item.date)} · {item.hari || "—"} · {item.test_publish_window || "—"}</dd></div><div><dt>Audiens</dt><dd>{item.audience || "—"}</dd></div><div><dt>Arah</dt><dd>{item.pillar || "—"} · {item.format || "—"} · {item.creative_style || "—"}</dd></div><div><dt>Governansi</dt><dd>{friendlyLabel(item.approval_status)} persetujuan · {friendlyLabel(item.publish_status)} publikasi</dd></div></dl><details><summary>Selengkapi brief</summary><BriefFields item={item}/></details></article>; }
function BriefFields({ item }: { item: PlanItem }) { return <div className="brief-sections">{briefSections.map(([heading, fields]) => <section key={heading}><h3>{heading}</h3><dl>{fields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{key === "date" ? planDateLabel(String(item[key])) : String(item[key] || "—")}</dd></div>)}</dl></section>)}</div>; }
function BriefDialog({ item, loading, busy, close, advance }: { item: PlanItem | null; loading: boolean; busy: boolean; close: () => void; advance: () => void }) {
  const drawer = useRef<HTMLElement>(null); const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; closeRef.current?.focus(); document.body.classList.add("modal-open"); const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); if (event.key === "Tab" && drawer.current) { const focusable = [...drawer.current.querySelectorAll<HTMLElement>("button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter((node) => !node.hasAttribute("disabled")); if (!focusable.length) return; const first = focusable[0], last = focusable.at(-1)!; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }; document.addEventListener("keydown", key); return () => { document.removeEventListener("keydown", key); document.body.classList.remove("modal-open"); previous?.focus(); }; }, [close]);
  const next = item ? nextContentPlanStatus(item.status) : null;
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={drawer} className="detail-drawer cp-drawer" role="dialog" aria-modal="true" aria-labelledby="brief-title"><button ref={closeRef} className="dialog-close" onClick={close} aria-label="Tutup brief konten">&#215;</button>{loading || !item ? <div className="detail-loading">Memuat brief lengkap…</div> : <div className="detail-content"><p className="eyebrow">Brief konten lengkap · {item.Content_ID}</p><h2 id="brief-title">{item.working_title || "Brief tanpa judul"}</h2><div className="workflow-control"><div><span>Alur kerja saat ini</span><Badge value={item.status}/><small>Persetujuan: {friendlyLabel(item.approval_status)} · Publikasi: {friendlyLabel(item.publish_status)} (hanya baca)</small></div>{next ? <button className="primary-action" type="button" disabled={busy} onClick={advance}>{busy ? "Memperbarui…" : next.label}</button> : <span className="workflow-ceiling">Alur kerja selesai · Pengukuran</span>}</div><BriefFields item={item}/><p className="detail-updated">Terakhir diperbarui {new Date(item.updated_at).toLocaleString("id-ID")}</p></div>}</section></div>;
}
