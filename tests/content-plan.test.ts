import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canTransitionContentPlan, classifyContentPlanRows, CONTENT_PLAN_HEADERS, parseContentPlanCsv, parseCsv } from "../src/lib/content-plan";
import { buildContentPlanWhere, contentPlanFiltersSchema, contentPlanImportOutcome, contentPlanJson, isoDateSchema, readCsvPayload } from "../src/lib/content-plan-api";

const planRecord = {
  id: "internal-id",
  contentId: "ASM-1",
  date: new Date("2026-08-25T00:00:00.000Z"),
  day: "Selasa",
  testPublishWindow: "19:00 WIB",
  pillar: "education",
  goal: "awareness",
  format: "carousel",
  creativeStyle: "editorial",
  audience: "architects",
  topicTag: "material",
  workingTitle: "Title",
  hook: "Hook",
  coreAngle: "Angle",
  slide1: "One",
  slide2: "Two",
  slide3: "Three",
  slide45: "Four-five",
  visualDirection: "Clean",
  cta: "Save",
  captionBrief: "Brief",
  primaryMetric: "saves",
  secondaryMetric: "shares",
  engagementMechanic: "question",
  storyCompanion: "poll",
  experimentTag: "pilot",
  productFocus: "flooring",
  claimGuardrail: "No unsupported claims",
  assetsNeeded: "photos",
  status: "planned",
  approvalStatus: "pending",
  publishStatus: "off",
  createdAt: new Date("2026-08-24T00:00:00.000Z"),
  updatedAt: new Date("2026-08-24T01:00:00.000Z"),
};

test("list filters validate topic and date sort then build a bounded database query", () => {
  const filters = contentPlanFiltersSchema.parse({ topic: "material", search: "floor", dateFrom: "2026-08-25", dateTo: "2026-08-31", sort: "desc" });
  assert.equal(filters.topic, "material");
  assert.equal(filters.sort, "desc");
  assert.deepEqual(buildContentPlanWhere(filters), {
    topicTag: { contains: "material" },
    date: { gte: new Date("2026-08-25T00:00:00.000Z"), lte: new Date("2026-08-31T00:00:00.000Z") },
    OR: [
      { contentId: { contains: "floor" } },
      { workingTitle: { contains: "floor" } },
      { hook: { contains: "floor" } },
      { coreAngle: { contains: "floor" } },
      { topicTag: { contains: "floor" } },
    ],
  });
});

test("serializer returns every CSV field with stable frontend names and ISO date", () => {
  const item = contentPlanJson(planRecord);
  assert.equal(item.Content_ID, "ASM-1");
  assert.equal(item.date, "2026-08-25");
  assert.equal(item.status, "planned");
  assert.equal(item.approval_status, "pending");
  assert.equal(item.publish_status, "off");
  assert.equal(item.publishing_mode, "off");
  for (const key of ["pillar", "goal", "format", "audience", "hook", "slide_1", "slide_4_5", "cta", "assets_needed"]) assert.ok(key in item, key);
});

test("CSV request parsing accepts JSON and multipart while enforcing the 1 MiB CSV limit", async () => {
  assert.equal(await readCsvPayload(new Request("http://local/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv: "a,b" }) })), "a,b");
  const form = new FormData();
  form.set("file", new Blob(["c,d"], { type: "text/csv" }), "plan.csv");
  assert.equal(await readCsvPayload(new Request("http://local/import", { method: "POST", body: form })), "c,d");
  await assert.rejects(
    readCsvPayload(new Request("http://local/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv: "x".repeat(1024 * 1024 + 1) }) })),
    (error: unknown) => error instanceof Error && error.message === "CSV exceeds 1 MiB limit",
  );
});

test("date validation safely rejects impossible and out-of-range ISO dates", () => {
  assert.equal(isoDateSchema.safeParse("2026-02-30").success, false);
  assert.equal(isoDateSchema.safeParse("9999-99-99").success, false);
});

test("import outcome marks invalid, within-file, and database duplicate rows without writes", () => {
  const csv = readFileSync("/home/asm/.hermes/team-asm/social-media/content-plan/ASM_Social_Media_7_Day_Agent_Feed_25-31_Aug_2026.csv", "utf8");
  const parsed = parseContentPlanCsv(csv);
  const duplicateEntry = { ...parsed.entries[1], row: 9 };
  const invalidEntry = { row: 10, errors: [{ row: 10, contentId: "BAD", message: "Date is required" }] };
  const outcome = contentPlanImportOutcome([...parsed.entries.slice(0, 2), duplicateEntry, invalidEntry], new Set([parsed.rows[0].contentId]));
  assert.deepEqual(outcome.summary, { total: 4, valid: 3, invalid: 1, duplicates: 2, insertable: 1 });
  assert.deepEqual(outcome.preview.map(({ duplicateReason }) => duplicateReason), ["existing_database", null, "within_file", null]);
  assert.deepEqual(outcome.insertable.map(({ contentId }) => contentId), [parsed.rows[1].contentId]);
});

test("CSV parser handles quoted commas, doubled quotes, CRLF, and multiline cells", () => {
  const csv = "Content_ID,Hook,Brief\r\nA-1,\"Hello, world\",\"line 1\r\nline 2 with \"\"quote\"\"\"\r\n";
  assert.deepEqual(parseCsv(csv), [
    ["Content_ID", "Hook", "Brief"],
    ["A-1", "Hello, world", 'line 1\r\nline 2 with "quote"'],
  ]);
});

test("actual Staff CSV headers and seven rows normalize without losing structured fields", () => {
  const csv = readFileSync("/home/asm/.hermes/team-asm/social-media/content-plan/ASM_Social_Media_7_Day_Agent_Feed_25-31_Aug_2026.csv", "utf8");
  const result = parseContentPlanCsv(csv);
  assert.deepEqual(parseCsv(csv)[0], CONTENT_PLAN_HEADERS);
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows.length, 7);
  assert.equal(result.rows[0].contentId, "ASM-PILOT-20260825-01");
  assert.equal(result.rows[0].date.toISOString(), "2026-08-25T00:00:00.000Z");
  assert.match(result.rows[0].hook, /stok, harga, pengiriman/);
  assert.equal(result.rows[0].status, "planned");
  assert.equal(result.rows[0].approvalStatus, "pending");
  assert.equal(result.rows[0].publishStatus, "off");
});

test("CSV normalization rejects wrong headers, Content_ID, date, and workflow status", () => {
  const csv = readFileSync("/home/asm/.hermes/team-asm/social-media/content-plan/ASM_Social_Media_7_Day_Agent_Feed_25-31_Aug_2026.csv", "utf8");
  assert.match(parseContentPlanCsv(csv.replace("Content_ID", "ContentId")).errors[0].message, /header/i);
  assert.match(parseContentPlanCsv(csv.replace("ASM-PILOT-20260825-01", "bad id")).errors[0].message, /Content_ID/);
  assert.match(parseContentPlanCsv(csv.replace("2026-08-25", "2026-02-30")).errors[0].message, /Date/);
  assert.match(parseContentPlanCsv(csv.replace(",planned,pending,off", ",draft,pending,off")).errors[0].message, /Agent_Status/);
});

test("duplicate classification skips existing and repeated IDs without overwriting briefs", () => {
  const csv = readFileSync("/home/asm/.hermes/team-asm/social-media/content-plan/ASM_Social_Media_7_Day_Agent_Feed_25-31_Aug_2026.csv", "utf8");
  const [first, second] = parseContentPlanCsv(csv).rows;
  const duplicateBrief = { ...second, contentId: first.contentId, hook: "must not overwrite" };
  const result = classifyContentPlanRows([first, second, duplicateBrief], new Set([second.contentId]));
  assert.deepEqual(result.insertable.map((row) => row.contentId), [first.contentId]);
  assert.deepEqual(result.duplicates, [
    { contentId: second.contentId, source: "database" },
    { contentId: first.contentId, source: "upload" },
  ]);
  assert.equal(result.insertable[0].hook, first.hook);
});

test("workflow allows same or one adjacent forward status only", () => {
  assert.equal(canTransitionContentPlan("planned", "planned"), true);
  assert.equal(canTransitionContentPlan("planned", "approved_for_creation"), true);
  assert.equal(canTransitionContentPlan("planned", "creating"), false);
  assert.equal(canTransitionContentPlan("approved", "ready_for_review"), false);
  assert.equal(canTransitionContentPlan("published", "measuring"), true);
});

test("Prisma ContentPlan schema and additive migration preserve every CSV field and indexes", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../prisma/migrations/20260824120000_add_content_plans/migration.sql", import.meta.url), "utf8");
  assert.match(schema, /model ContentPlanItem/);
  assert.match(schema, /@@map\("content_plan_items"\)/);
  assert.match(migration, /CREATE TABLE `content_plan_items`/);
  for (const name of ["content_id", "date", "day", "test_publish_window", "pillar", "goal", "format", "creative_style", "audience", "topic_tag", "working_title", "hook", "core_angle", "slide_1", "slide_2", "slide_3", "slide_4_5", "visual_direction", "cta", "caption_brief", "primary_metric", "secondary_metric", "engagement_mechanic", "story_companion", "experiment_tag", "product_focus", "claim_guardrail", "assets_needed", "status", "approval_status", "publish_status", "created_at", "updated_at"]) {
    assert.ok(migration.includes("`" + name + "`"), name);
  }
  assert.match(migration, /UNIQUE INDEX `content_plan_items_content_id_key`/);
  assert.match(migration, /INDEX `content_plan_items_date_status_idx`/);
  for (const status of ["planned", "approved_for_creation", "creating", "ready_for_review", "approved", "scheduled", "published", "measuring"]) {
    assert.match(schema, new RegExp(`\\b${status}\\b`), status);
    assert.ok(migration.includes(`'${status}'`), status);
  }
});
