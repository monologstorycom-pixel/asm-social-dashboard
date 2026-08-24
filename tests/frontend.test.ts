import assert from "node:assert/strict";
import test from "node:test";

import { bestMetricIds, buildApiQuery, duplicateReasonLabel, friendlyLabel, importSummaryItems, nextContentPlanStatus, planDateLabel, toggleSelection } from "../src/lib/frontend";

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

test("content plan workflow exposes only the adjacent action and stops at measuring", () => {
  assert.deepEqual(nextContentPlanStatus("planned"), { status: "approved_for_creation", label: "Advance to Approved for Creation" });
  assert.deepEqual(nextContentPlanStatus("published"), { status: "measuring", label: "Advance to Measuring" });
  assert.equal(nextContentPlanStatus("measuring"), null);
});

test("import preview summary and duplicate reasons use clear operational labels", () => {
  assert.deepEqual(importSummaryItems({ total: 7, valid: 6, invalid: 1, duplicates: 2, insertable: 4 }), [
    ["Total", 7], ["Valid", 6], ["Invalid", 1], ["Duplicates", 2], ["Insertable", 4],
  ]);
  assert.equal(duplicateReasonLabel("within_file"), "Duplicate within file");
  assert.equal(duplicateReasonLabel("existing_database"), "Already in content plan");
  assert.equal(duplicateReasonLabel(null), "—");
});

test("content plan ISO dates render without UTC timezone drift", () => {
  assert.equal(planDateLabel("2026-08-25"), "25 Aug 2026");
  assert.equal(planDateLabel(""), "—");
});
