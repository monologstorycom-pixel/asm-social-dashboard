import assert from "node:assert/strict";
import test from "node:test";

import { bestMetricIds, buildApiQuery, friendlyLabel, toggleSelection } from "../src/lib/frontend";

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
