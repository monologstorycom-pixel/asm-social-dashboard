import { HttpError } from "./http";
import { normalizeMetaMetrics, type MetaMedia, type Insight } from "./operations";

type Fetch = typeof fetch;
type MetaPayload = { data?: Array<{ name: string; values?: Array<{ value: unknown }> }> };
export type MetaAccountProfile = { id: string; name: string; username: string; profile_picture_url?: string; followers_count?: number; media_count?: number };

/** Read-only Meta Graph client. It has no publishing methods by design. */
export class MetaInsightsClient {
  constructor(
    private readonly token = process.env.META_ACCESS_TOKEN,
    private readonly fetcher: Fetch = fetch,
    private readonly graphBase = process.env.META_GRAPH_BASE_URL || "https://graph.facebook.com/v23.0",
  ) {}

  async listAccountMedia(accountId: string, limit = 100): Promise<MetaMedia[]> {
    if (!this.token) throw new HttpError(503, "META_ACCESS_TOKEN is not configured");
    if (!/^\d+$/.test(accountId) || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new HttpError(400, "Invalid Meta account or media limit");
    const fields = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,media_url,thumbnail_url,children.limit(100){id,media_type,media_url,thumbnail_url}";
    const media: MetaMedia[] = [];
    const cursors = new Set<string>();
    let after: string | undefined;
    do {
      const pageSize = Math.min(100, limit - media.length);
      const path = `${accountId}/media?fields=${encodeURIComponent(fields)}&limit=${pageSize}${after ? `&after=${encodeURIComponent(after)}` : ""}`;
      const payload = await this.get(path) as { data?: MetaMedia[]; paging?: { cursors?: { after?: string } } };
      media.push(...(payload.data ?? []));
      after = payload.paging?.cursors?.after;
      if (after && cursors.has(after)) after = undefined;
      else if (after) cursors.add(after);
    } while (after && media.length < limit);
    return media.slice(0, limit);
  }

  async getAccountProfile(accountId: string): Promise<MetaAccountProfile> {
    if (!this.token) throw new HttpError(503, "META_ACCESS_TOKEN is not configured");
    if (!/^\d+$/.test(accountId)) throw new HttpError(400, "Invalid Meta account");
    const fields = "name,username,profile_picture_url,followers_count,media_count";
    return this.get(`${accountId}?fields=${encodeURIComponent(fields)}`) as Promise<MetaAccountProfile>;
  }

  async getMediaDetail(mediaId: string): Promise<MetaMedia> {
    if (!this.token) throw new HttpError(503, "META_ACCESS_TOKEN is not configured");
    const fields = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,media_url,thumbnail_url,children.limit(100){id,media_type,media_url,thumbnail_url}";
    return this.get(`${mediaId}?fields=${encodeURIComponent(fields)}`) as Promise<MetaMedia>;
  }

  async getMediaMetrics(mediaId: string) {
    if (!this.token) throw new HttpError(503, "META_ACCESS_TOKEN is not configured");
    const fields = "like_count,comments_count,permalink,timestamp";
    const metrics = ["reach", "impressions", "saved", "shares", "views", "plays", "video_views", "total_interactions"].join(",");
    const [media, insight] = await Promise.all([
      this.get(`${mediaId}?fields=${encodeURIComponent(fields)}`),
      this.get(`${mediaId}/insights?metric=${encodeURIComponent(metrics)}`),
    ]);
    const metricRows = ((insight as MetaPayload).data ?? []) as unknown as Insight[];
    return normalizeMetaMetrics(media as { like_count?: unknown; comments_count?: unknown }, metricRows);
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
