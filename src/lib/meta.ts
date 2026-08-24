export type MetaInsight = { name: string; value: number; capturedAt: string };

/** Read-only seam for future Meta Graph ingestion. Publishing is intentionally absent. */
export class MetaInsightsClient {
  constructor(
    private readonly token = process.env.META_ACCESS_TOKEN,
    private readonly userId = process.env.META_IG_USER_ID,
  ) {}

  async getAccountInsights(): Promise<MetaInsight[]> {
    if (!this.token || !this.userId) return [];
    const fields = "impressions,reach,profile_views";
    const response = await fetch(`https://graph.facebook.com/v23.0/${this.userId}/insights?metric=${fields}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Meta insights request failed (${response.status})`);
    const payload = (await response.json()) as { data?: Array<{ name: string; values?: Array<{ value: number; end_time: string }> }> };
    return (payload.data ?? []).flatMap((item) => (item.values ?? []).map((value) => ({ name: item.name, value: value.value, capturedAt: value.end_time })));
  }
}
