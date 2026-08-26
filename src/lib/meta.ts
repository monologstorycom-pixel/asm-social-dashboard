import { HttpError } from "./http";
import { normalizeMetaMetrics, type MetaMedia } from "./operations";

type Fetch = typeof fetch;
type MetaPayload = { data?: Array<{ name: string; values?: Array<{ value: unknown }> }> };

/** Read-only Meta Graph client. It has no publishing methods by design. */
export class MetaInsightsClient {
  constructor(
    private readonly token = process.env.META_ACCESS_TOKEN,
    private readonly fetcher: Fetch = fetch,
    private readonly graphBase = process.env.META_GRAPH_BASE_URL || "https://graph.facebook.com/v23.0",
  ) {}

  async listAccountMedia(accountId: string, limit = 25): Promise<MetaMedia[]> {
    if (!this.token) throw new HttpError(503, "META_ACCESS_TOKEN is not configured");
    if (!/^\d+$/.test(accountId) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, "Invalid Meta account or media limit");
    const fields = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,children.limit(100){id}";
    const payload = await this.get(`${accountId}/media?fields=${encodeURIComponent(fields)}&limit=${limit}`) as { data?: MetaMedia[] };
    return payload.data ?? [];
  }

  async getMediaMetrics(mediaId: string) {
    if (!this.token) throw new HttpError(503, "META_ACCESS_TOKEN is not configured");
    const fields = "like_count,comments_count,permalink,timestamp";
    const names = ["reach", "impressions", "saved", "shares", "views", "plays", "video_views"];
    const [media, metricRows] = await Promise.all([
      this.get(`${mediaId}?fields=${encodeURIComponent(fields)}`),
      Promise.all(names.map((name) => this.getOptionalMetric(mediaId, name))),
    ]);
    return normalizeMetaMetrics(media as { like_count?: unknown; comments_count?: unknown }, metricRows.flat());
  }

  private async getOptionalMetric(mediaId: string, name: string) {
    const response = await this.fetcher(`${this.graphBase}/${mediaId}/insights?metric=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      cache: "no-store",
    });
    if (response.status === 400) return [];
    if (!response.ok) throw new HttpError(502, `Meta read request failed (${response.status})`);
    return ((await response.json()) as MetaPayload).data ?? [];
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.fetcher(`${this.graphBase}/${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new HttpError(502, `Meta read request failed (${response.status})`);
    return response.json();
  }
}
