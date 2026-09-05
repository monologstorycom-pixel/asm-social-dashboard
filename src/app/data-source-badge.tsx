import { dataSourceLabel, dateTimeLabel } from "@/lib/frontend";

type Props = { dataMode?: string; source?: string; capturedAt?: string | null };

export default function DataSourceBadge({ dataMode, source, capturedAt }: Props) {
  if (!dataMode || !source) return <div className="source-badge loading" aria-live="polite">Sumber data: memuat…</div>;
  return <div className={`source-badge ${dataMode}`} aria-live="polite">
    <strong>{dataSourceLabel(dataMode, source)}</strong>
    <span>{capturedAt ? `Snapshot terakhir ${dateTimeLabel(capturedAt)}` : "Waktu snapshot belum tersedia"}</span>
  </div>;
}
