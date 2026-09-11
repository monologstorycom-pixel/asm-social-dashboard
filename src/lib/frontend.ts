export type QueryValue = string | number | boolean | null | undefined;

export function buildApiQuery(values: Record<string, QueryValue>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== "" && value !== null && value !== undefined) query.set(key, String(value));
  return query.toString();
}

export function toggleSelection(current: string[], id: string, max = 5) {
  if (current.includes(id)) return { ids: current.filter((item) => item !== id), limited: false };
  if (current.length >= max) return { ids: current, limited: true };
  return { ids: [...new Set([...current, id])], limited: false };
}

export function bestMetricIds(rows: Array<{ id: string; value: number | null | undefined }>) {
  const values = rows.flatMap(({ value }) => value == null ? [] : [value]);
  if (!values.length) return new Set<string>();
  const best = Math.max(...values);
  return new Set(rows.filter(({ value }) => value === best).map(({ id }) => id));
}

export function friendlyLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function dataSourceLabel(dataMode: string, source: string) {
  if (dataMode === "demo" || source === "demo") return "Snapshot demo";
  if (dataMode === "live" || source === "meta") return "Snapshot Meta";
  return "Data campuran";
}

export const CONTENT_PLAN_WORKFLOW = ["planned", "approved_for_creation", "creating", "ready_for_review", "approved", "scheduled", "published", "measuring"] as const;
export type ContentPlanStatus = typeof CONTENT_PLAN_WORKFLOW[number];

export function nextContentPlanStatus(current: ContentPlanStatus) {
  const status = CONTENT_PLAN_WORKFLOW[CONTENT_PLAN_WORKFLOW.indexOf(current) + 1];
  return status ? { status, label: `Lanjut ke ${friendlyLabel(status).replace(" For ", " for ")}` } : null;
}

export type ImportSummary = { total: number; valid: number; invalid: number; duplicates: number; insertable: number };
export const importSummaryItems = (summary: ImportSummary): [string, number][] => [
  ["Total", summary.total], ["Valid", summary.valid], ["Tidak valid", summary.invalid], ["Duplikat", summary.duplicates], ["Bisa diimpor", summary.insertable],
];
export function duplicateReasonLabel(reason: "within_file" | "existing_database" | null) {
  return reason === "within_file" ? "Duplikat dalam file" : reason === "existing_database" ? "Sudah ada di rencana" : "—";
}
export function planDateLabel(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function scheduledTimeLabel(value: string | null | undefined) {
  if (!value) return "Belum dijadwalkan";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Jadwal tidak valid";
  return `${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(date).replace(".", ":")} WIB`;
}

export function scheduleDataModeLabel(value: string | null | undefined) {
  return value === "live_meta" || value === "analytics" ? "analytics" : value === "exploration" ? "exploration" : "Belum tersedia";
}

export function scheduleFallbackPolicy(value: string | null | undefined) {
  return value === "live_meta" || value === "analytics"
    ? "Tidak aktif; jadwal memakai data analytics."
    : "Exploration terukur dalam publish window bila data analytics belum cukup.";
}

export function scheduleInPublishWindow(value: string, planDate: string, label: string): { iso: string; error: string } {
  if (!value) return { iso: "", error: "Pilih waktu publikasi." };
  const local = value.match(/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/);
  const times = [...label.matchAll(/(?:^|\D)([01]?\d|2[0-3])[:.]([0-5]\d)/g)].map((match) => Number(match[1]) * 60 + Number(match[2]));
  if (!times.length) return { iso: "", error: "Jendela publikasi tidak dapat dibaca." };
  if (!local) return { iso: "", error: `Waktu harus berada dalam jendela publikasi ${label}.` };
  const windowStart = times[0];
  const windowEnd = times[1] ?? times[0] + 60;
  const overnight = windowEnd <= windowStart;
  const [vYear, vMonth, vDay, vHour, vMin] = [Number(local[1]), Number(local[2]), Number(local[3]), Number(local[4]), Number(local[5])];
  const planDateMs = Date.UTC(Number(planDate.slice(0, 4)), Number(planDate.slice(5, 7)) - 1, Number(planDate.slice(8, 10)));
  const valueDate = new Date(Date.UTC(vYear, vMonth - 1, vDay));
  const dayDiff = Math.round((valueDate.getTime() - planDateMs) / 86_400_000);
  if (!overnight && dayDiff !== 0) return { iso: "", error: `Waktu harus berada dalam jendela publikasi ${label}.` };
  if (overnight && dayDiff !== 0 && dayDiff !== 1) return { iso: "", error: `Waktu harus berada dalam jendela publikasi ${label}.` };
  const minutes = vHour * 60 + vMin;
  const inSameDay = minutes >= windowStart && minutes <= 24 * 60;
  const inNextDay = overnight && minutes >= 0 && minutes <= windowEnd;
  if (!inSameDay && !inNextDay) return { iso: "", error: `Waktu harus berada dalam jendela publikasi ${label}.` };
  return { iso: new Date(Date.UTC(vYear, vMonth - 1, vDay, vHour - 7, vMin)).toISOString(), error: "" };
}

export const compactNumber = new Intl.NumberFormat("id", { notation: "compact", maximumFractionDigits: 1 });
export const fullNumber = new Intl.NumberFormat("id");
export const percent = (value = 0) => `${value.toFixed(2)}%`;
export const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "Belum dipublikasikan";
export const dateTimeLabel = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Belum dipublikasikan";

export type Account = { id: string; accountName: string; username: string; platform: string };
export type Asset = { id: string; assetType: string; assetUrl: string; slideNumber: number };
export type Metric = {
  capturedAt: string; reach: number; impressions: number; views: number; likes: number; comments: number;
  saves: number; shares: number; engagementTotal: number; engagementRate: number;
};
export type Post = {
  id: string; title: string; caption: string; topic: string; contentPillar: string; contentType: string;
  creativeStyle: string; status: string; publishedAt: string | null; publicUrl: string | null; permalink: string | null;
  socialAccount: Account; assets: Asset[]; latestMetric: Metric | null; metrics?: Metric[];
};
export type FilterOptions = {
  accounts: Account[]; topics: string[]; pillars: string[]; styles: string[]; types: string[]; statuses: string[];
};

export function readStoredSelection() {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem("asm-selected-posts") ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, 5) : [];
  } catch { return []; }
}

export function storeSelection(ids: string[]) {
  if (typeof window !== "undefined") localStorage.setItem("asm-selected-posts", JSON.stringify(ids.slice(0, 5)));
}

export function orderAssetsBySlide(assets: Asset[]): Asset[] {
  return [...assets].sort((a, b) => a.slideNumber - b.slideNumber);
}

export function previewSrc(assets: Asset[]): string | null {
  if (!assets.length) return null;
  const ordered = orderAssetsBySlide(assets);
  return ordered.find((a) => a.assetType === "thumbnail")?.assetUrl ?? ordered[0]?.assetUrl ?? null;
}

export function safeExternalLinkProps(url: string | null): { target?: string; rel?: string } {
  return url ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

export function carouselPrev(current: number, total: number): number {
  return (current - 1 + total) % total;
}

export function carouselNext(current: number, total: number): number {
  return (current + 1) % total;
}

export function slideIndicatorLabel(current: number, total: number): string {
  return `Slide ${current + 1} dari ${total}`;
}

export function thumbnailAttrs(src: string): { src: string; alt: string; loading: "lazy" } {
  return { src, alt: "", loading: "lazy" };
}

export function dialogMediaAttrs(src: string, title: string): { src: string; alt: string } {
  return { src, alt: `Pratinjau ${title}` };
}
