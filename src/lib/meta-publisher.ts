import { HttpError } from "./http";

type Fetch = typeof fetch;
export type PublishAsset = { publicUrl: string; mimeType: string };

export class MetaPublisherClient {
  constructor(
    private readonly token = process.env.META_ACCESS_TOKEN,
    private readonly fetcher: Fetch = fetch,
    private readonly graphBase = process.env.META_GRAPH_BASE_URL || "https://graph.facebook.com/v23.0",
  ) {}

  async publish(accountId: string, caption: string, assets: PublishAsset[]) {
    if (!this.token) throw new HttpError(503, "META_ACCESS_TOKEN is not configured");
    if (!/^\d+$/.test(accountId)) throw new HttpError(400, "Invalid Meta account");
    if (!caption.trim() || !assets.length || assets.length > 10) throw new HttpError(400, "Caption and 1-10 assets are required");
    for (const asset of assets) {
      const url = new URL(asset.publicUrl);
      if (url.protocol !== "https:") throw new HttpError(400, "Meta assets must use public HTTPS URLs");
      if (!/^(image|video)\//.test(asset.mimeType)) throw new HttpError(400, "Unsupported Meta asset type");
    }

    let creationId: string;
    if (assets.length === 1) {
      creationId = await this.createContainer(accountId, caption, assets[0]);
    } else {
      const children = await Promise.all(assets.map((asset) => this.createContainer(accountId, "", asset, true)));
      creationId = await this.post(`${accountId}/media`, { media_type: "CAROUSEL", caption, children: children.join(",") });
    }
    await this.waitUntilReady(creationId);
    const mediaId = await this.post(`${accountId}/media_publish`, { creation_id: creationId });
    return { creationId, mediaId };
  }

  async getPublishedMedia(mediaId: string) {
    const response = await this.fetcher(`${this.graphBase}/${mediaId}?fields=id,permalink,timestamp`, { headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" });
    const payload = await response.json() as { id?: string; permalink?: string; timestamp?: string };
    if (!response.ok || !payload.id) throw new HttpError(502, `Meta published media lookup failed (${response.status})`);
    return payload;
  }

  private createContainer(accountId: string, caption: string, asset: PublishAsset, carouselItem = false) {
    const video = asset.mimeType.startsWith("video/");
    return this.post(`${accountId}/media`, {
      ...(video ? { media_type: carouselItem ? "VIDEO" : "REELS", video_url: asset.publicUrl } : { image_url: asset.publicUrl }),
      ...(caption ? { caption } : {}),
      ...(carouselItem ? { is_carousel_item: "true" } : {}),
    });
  }

  private async waitUntilReady(containerId: string) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await this.fetcher(`${this.graphBase}/${containerId}?fields=status_code`, { headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" });
      const body = await response.json() as { status_code?: string; error?: { message?: string } };
      if (!response.ok) throw new HttpError(502, `Meta container status failed (${response.status})`);
      if (body.status_code === "FINISHED") return;
      if (body.status_code === "ERROR" || body.status_code === "EXPIRED") throw new HttpError(502, `Meta container ${body.status_code.toLowerCase()}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new HttpError(504, "Meta container was not ready before timeout");
  }

  private async post(path: string, fields: Record<string, string>) {
    const body = new URLSearchParams(fields);
    const response = await this.fetcher(`${this.graphBase}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
    const payload = await response.json() as { id?: string; error?: { message?: string } };
    if (!response.ok || !payload.id) throw new HttpError(502, `Meta publish request failed (${response.status})${payload.error?.message ? `: ${payload.error.message}` : ""}`);
    return payload.id;
  }
}
