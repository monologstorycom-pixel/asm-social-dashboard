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
  creativeStyle: string; status: string; publishedAt: string | null; publicUrl: string | null;
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
