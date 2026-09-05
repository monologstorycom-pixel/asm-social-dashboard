import assert from "node:assert/strict";
import test from "node:test";
import { MetaPublisherClient } from "../src/lib/meta-publisher";

test("publisher creates, waits for, and publishes one image container", async () => {
  const calls: Array<{ url: string; method: string; body?: string; authorization?: string }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method || "GET", body: init?.body?.toString(), authorization: new Headers(init?.headers).get("authorization") || undefined });
    if (url.includes("container-1?")) return Response.json({ status_code: "FINISHED" });
    if (url.endsWith("/123/media")) return Response.json({ id: "container-1" });
    if (url.endsWith("/123/media_publish")) return Response.json({ id: "media-1" });
    throw new Error(`Unexpected URL ${url}`);
  };
  const client = new MetaPublisherClient("test-token", fetcher as typeof fetch, "https://graph.test/v23.0");

  assert.deepEqual(await client.publish("123", "Caption", [{ publicUrl: "https://cdn.test/image.jpg", mimeType: "image/jpeg" }]), { creationId: "container-1", mediaId: "media-1" });
  assert.equal(calls.length, 3);
  assert.match(calls[0].body || "", /image_url=https%3A%2F%2Fcdn.test%2Fimage.jpg/);
  assert.match(calls[0].body || "", /caption=Caption/);
  assert.ok(calls.every((call) => call.authorization === "Bearer test-token"));
});

test("publisher creates carousel children before the parent", async () => {
  let child = 0;
  const calls: string[] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body?.toString() || "";
    calls.push(`${url} ${body}`);
    if (url.includes("carousel-parent?")) return Response.json({ status_code: "FINISHED" });
    if (url.endsWith("/123/media_publish")) return Response.json({ id: "media-2" });
    if (url.endsWith("/123/media") && body.includes("media_type=CAROUSEL")) return Response.json({ id: "carousel-parent" });
    if (url.endsWith("/123/media")) return Response.json({ id: `child-${++child}` });
    throw new Error(`Unexpected URL ${url}`);
  };
  const client = new MetaPublisherClient("test-token", fetcher as typeof fetch, "https://graph.test/v23.0");

  await client.publish("123", "Carousel", [
    { publicUrl: "https://cdn.test/one.jpg", mimeType: "image/jpeg" },
    { publicUrl: "https://cdn.test/two.mp4", mimeType: "video/mp4" },
  ]);
  assert.match(calls[0], /is_carousel_item=true/);
  assert.match(calls[1], /media_type=VIDEO/);
  assert.match(calls[2], /media_type=CAROUSEL/);
  assert.match(calls[2], /children=child-1%2Cchild-2/);
});

test("publisher rejects non-HTTPS assets before any Meta request", async () => {
  let called = false;
  const client = new MetaPublisherClient("test-token", (async () => { called = true; return Response.json({}); }) as typeof fetch);
  await assert.rejects(() => client.publish("123", "Caption", [{ publicUrl: "http://cdn.test/image.jpg", mimeType: "image/jpeg" }]), /public HTTPS/);
  assert.equal(called, false);
});
