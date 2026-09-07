import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { bestMetricIds, buildApiQuery, carouselNext, carouselPrev, dataSourceLabel, dialogMediaAttrs, duplicateReasonLabel, friendlyLabel, importSummaryItems, nextContentPlanStatus, orderAssetsBySlide, planDateLabel, previewSrc, safeExternalLinkProps, scheduleInPublishWindow, slideIndicatorLabel, thumbnailAttrs, toggleSelection } from "../src/lib/frontend";

const ids = ["a", "b", "c", "d", "e", "f"];

test("API query omits empty values and preserves supported filter values", () => {
  assert.equal(buildApiQuery({ topic: "steel", status: "", page: 2, metric: "reach" }), "topic=steel&page=2&metric=reach");
});

test("selection toggles, deduplicates, and enforces the five post ceiling", () => {
  assert.deepEqual(toggleSelection([ids[0]], ids[1]), { ids: [ids[0], ids[1]], limited: false });
  assert.deepEqual(toggleSelection([ids[0], ids[1]], ids[0]), { ids: [ids[1]], limited: false });
  assert.deepEqual(toggleSelection(ids.slice(0, 5), ids[5]), { ids: ids.slice(0, 5), limited: true });
});

test("best metric detection marks fair ties and ignores missing metrics", () => {
  assert.deepEqual(bestMetricIds([{ id: "a", value: 10 }, { id: "b", value: 10 }, { id: "c", value: null }]), new Set(["a", "b"]));
  assert.deepEqual(bestMetricIds([{ id: "a", value: null }]), new Set());
});

test("enum labels are human readable", () => {
  assert.equal(friendlyLabel("editorial_no_box"), "Editorial No Box");
});

test("data source labels distinguish demo, Meta snapshot, and mixed data", () => {
  assert.equal(dataSourceLabel("demo", "demo"), "Snapshot demo");
  assert.equal(dataSourceLabel("live", "meta"), "Snapshot Meta");
  assert.equal(dataSourceLabel("all", "mixed"), "Data campuran");
});

test("content plan workflow exposes only the adjacent action and stops at measuring", () => {
  assert.deepEqual(nextContentPlanStatus("planned"), { status: "approved_for_creation", label: "Lanjut ke Approved for Creation" });
  assert.deepEqual(nextContentPlanStatus("published"), { status: "measuring", label: "Lanjut ke Measuring" });
  assert.equal(nextContentPlanStatus("measuring"), null);
});

test("import preview summary and duplicate reasons use clear operational labels", () => {
  assert.deepEqual(importSummaryItems({ total: 7, valid: 6, invalid: 1, duplicates: 2, insertable: 4 }), [
    ["Total", 7], ["Valid", 6], ["Tidak valid", 1], ["Duplikat", 2], ["Bisa diimpor", 4],
  ]);
  assert.equal(duplicateReasonLabel("within_file"), "Duplikat dalam file");
  assert.equal(duplicateReasonLabel("existing_database"), "Sudah ada di rencana");
  assert.equal(duplicateReasonLabel(null), "—");
});

test("content plan ISO dates render without UTC timezone drift", () => {
  assert.equal(planDateLabel("2026-08-25"), "25 Agu 2026");
  assert.equal(planDateLabel(""), "—");
});

test("content plan client uses dashboard mutation endpoints", () => {
  const source = readFileSync(new URL("../src/app/content-plan/content-plan-client.tsx", import.meta.url), "utf8");
  assert.match(source, /postFile<ImportResult>\("\/api\/dashboard\/content-plan\/import"\)/);
  assert.match(source, /`\/api\/dashboard\/content-plan\/\$\{encodeURIComponent\(detail\.Content_ID\)\}\/status`/);
  assert.match(source, /postFile<Preview>\("\/api\/content-plan\/import\/preview"\)/);
  assert.doesNotMatch(source, /INTERNAL_API_TOKEN|Authorization|Bearer/);
});

test("schedule validation interprets datetime-local and publish window in WIB", () => {
  assert.deepEqual(scheduleInPublishWindow("2026-08-25T09:30", "2026-08-25", "09:00–10:00 WIB"), { iso: "2026-08-25T02:30:00.000Z", error: "" });
  assert.deepEqual(scheduleInPublishWindow("2026-08-25T09:00", "2026-08-25", "09.00 - 10.00"), { iso: "2026-08-25T02:00:00.000Z", error: "" });
});

test("schedule validation accepts overnight windows crossing midnight", () => {
  assert.deepEqual(scheduleInPublishWindow("2026-08-25T23:30", "2026-08-25", "23:00–01:00 WIB"), { iso: "2026-08-25T16:30:00.000Z", error: "" });
  assert.deepEqual(scheduleInPublishWindow("2026-08-26T00:15", "2026-08-25", "23:00–01:00 WIB"), { iso: "2026-08-25T17:15:00.000Z", error: "" });
});

test("schedule validation rejects missing, malformed, and out-of-window values", () => {
  assert.equal(scheduleInPublishWindow("", "2026-08-25", "09:00–10:00 WIB").error, "Pilih waktu publikasi.");
  assert.equal(scheduleInPublishWindow("2026-08-25T08:59", "2026-08-25", "09:00–10:00 WIB").error, "Waktu harus berada dalam jendela publikasi 09:00–10:00 WIB.");
  assert.equal(scheduleInPublishWindow("2026-08-25T09:30", "2026-08-25", "pagi").error, "Jendela publikasi tidak dapat dibaca.");
});

test("content plan dashboard shows automation switches and publisher recommendation fields", () => {
  const source = readFileSync(new URL("../src/app/content-plan/content-plan-client.tsx", import.meta.url), "utf8");
  for (const label of ["AUTO_APPROVAL", "AUTO_SCHEDULE", "AUTO_PUBLISH", "schedule_reason", "schedule_data_mode", "schedule_confidence", "publisher_state", "publisher_error", "auto_approval_status"]) assert.match(source, new RegExp(label));
  assert.doesNotMatch(source, /INTERNAL_API_TOKEN|Authorization.*Bearer/);
});

test("approved content uses the dedicated accessible schedule control", () => {
  const source = readFileSync(new URL("../src/app/content-plan/content-plan-client.tsx", import.meta.url), "utf8");
  assert.match(source, /item\.status === "approved"/);
  assert.match(source, /<label[^>]*>Jadwalkan/);
  assert.match(source, /type="datetime-local"/);
  assert.match(source, /`\/api\/dashboard\/content-plan\/\$\{encodeURIComponent\(detail\.Content_ID\)\}\/schedule`/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /JSON\.stringify\(\{ scheduled_at: validation\.iso \}\)/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /JSON\.stringify\(\{ status: "scheduled" \}\)/);
});

function mediaAsset(slideNumber: number, assetType: string, assetUrl: string) {
  return { id: `${slideNumber}-${assetType}`, assetType, assetUrl, slideNumber };
}

test("real assets are ordered and preferred over fallback", () => {
  const assets = [mediaAsset(3, "image", "c"), mediaAsset(1, "image", "a"), mediaAsset(2, "thumbnail", "b")];
  assert.deepEqual(orderAssetsBySlide(assets).map((asset) => asset.slideNumber), [1, 2, 3]);
  assert.equal(previewSrc(assets), "b");
  assert.equal(previewSrc([]), null);
});

test("carousel navigation wraps and reports its current slide", () => {
  assert.equal(carouselPrev(0, 5), 4);
  assert.equal(carouselNext(4, 5), 0);
  assert.equal(slideIndicatorLabel(2, 3), "Slide 3 dari 3");
});

test("media attributes and external link are safe", () => {
  assert.deepEqual(thumbnailAttrs("https://example.com/a.jpg"), { src: "https://example.com/a.jpg", alt: "", loading: "lazy" });
  assert.deepEqual(dialogMediaAttrs("https://example.com/a.jpg", "Post"), { src: "https://example.com/a.jpg", alt: "Pratinjau Post" });
  assert.deepEqual(safeExternalLinkProps("https://instagram.com/p/x"), { target: "_blank", rel: "noopener noreferrer" });
  assert.deepEqual(safeExternalLinkProps(null), {});
});

test("Posts media opens detail and original link uses Meta permalink", () => {
  const source = readFileSync(new URL("../src/app/posts/posts-client.tsx", import.meta.url), "utf8");
  assert.match(source, /className="post-media-open"[^>]*onClick=\{open\}/);
  assert.match(source, /post\.permalink/);
  assert.match(source, />Buka post asli<\/a>/);
});
