export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = input.charCodeAt(0) === 0xfeff ? 1 : 0; i < input.length; i += 1) {
    const character = input[i];
    if (quoted) {
      if (character === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field === "") quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("Unclosed quoted CSV field");
  if (field !== "" || row.length > 0) rows.push([...row, field]);
  return rows;
}

export const CONTENT_PLAN_HEADERS = [
  "Content_ID", "Date", "Hari", "Test_Publish_Window", "Pillar", "Goal", "Format", "Creative_Style",
  "Audience", "Topic_Tag", "Working_Title", "Hook", "Core_Angle", "Slide_1", "Slide_2", "Slide_3",
  "Slide_4_5", "Visual_Direction", "CTA", "Caption_Brief", "Primary_Metric", "Secondary_Metric",
  "Engagement_Mechanic", "Story_Companion", "Experiment_Tag", "Product_Focus", "Claim_Guardrail",
  "Assets_Needed", "Agent_Status", "Approval_Status", "Publish_Status",
] as const;

export const CONTENT_PLAN_STATUSES = [
  "planned", "approved_for_creation", "creating", "ready_for_review", "approved", "scheduled", "published", "measuring",
] as const;
export type ContentPlanStatus = typeof CONTENT_PLAN_STATUSES[number];

export type ContentPlanInput = {
  contentId: string;
  date: Date;
  day: string;
  testPublishWindow: string;
  pillar: string;
  goal: string;
  format: string;
  creativeStyle: string;
  audience: string;
  topicTag: string;
  workingTitle: string;
  hook: string;
  coreAngle: string;
  slide1: string;
  slide2: string;
  slide3: string;
  slide45: string;
  visualDirection: string;
  cta: string;
  captionBrief: string;
  primaryMetric: string;
  secondaryMetric: string;
  engagementMechanic: string;
  storyCompanion: string;
  experimentTag: string;
  productFocus: string;
  claimGuardrail: string;
  assetsNeeded: string;
  status: ContentPlanStatus;
  approvalStatus: string;
  publishStatus: string;
};

export type ContentPlanCsvError = { row: number; contentId?: string; message: string };

const FIELD_KEYS = [
  "contentId", "date", "day", "testPublishWindow", "pillar", "goal", "format", "creativeStyle", "audience",
  "topicTag", "workingTitle", "hook", "coreAngle", "slide1", "slide2", "slide3", "slide45", "visualDirection",
  "cta", "captionBrief", "primaryMetric", "secondaryMetric", "engagementMechanic", "storyCompanion", "experimentTag",
  "productFocus", "claimGuardrail", "assetsNeeded", "status", "approvalStatus", "publishStatus",
] as const;

const REQUIRED_FIELDS: (keyof ContentPlanInput)[] = [
  "contentId", "date", "pillar", "goal", "format", "creativeStyle", "audience", "topicTag", "workingTitle", "hook",
  "coreAngle", "status", "approvalStatus", "publishStatus",
];

export type ContentPlanCsvEntry = { row: number; input?: ContentPlanInput; errors: ContentPlanCsvError[] };

export function parseContentPlanCsv(input: string): { rows: ContentPlanInput[]; errors: ContentPlanCsvError[]; entries: ContentPlanCsvEntry[] } {
  let matrix: string[][];
  try {
    matrix = parseCsv(input);
  } catch (error) {
    const errors = [{ row: 0, message: error instanceof Error ? error.message : "Invalid CSV" }];
    return { rows: [], errors, entries: [{ row: 0, errors }] };
  }
  if (!matrix[0] || matrix[0].length !== CONTENT_PLAN_HEADERS.length || matrix[0].some((header, index) => header.trim() !== CONTENT_PLAN_HEADERS[index])) {
    const errors = [{ row: 1, message: `CSV header must exactly match: ${CONTENT_PLAN_HEADERS.join(",")}` }];
    return { rows: [], errors, entries: [{ row: 1, errors }] };
  }

  const rows: ContentPlanInput[] = [];
  const errors: ContentPlanCsvError[] = [];
  const entries: ContentPlanCsvEntry[] = [];
  matrix.slice(1).forEach((values, index) => {
    const csvRow = index + 2;
    if (values.length !== CONTENT_PLAN_HEADERS.length) {
      const error = { row: csvRow, message: `Expected ${CONTENT_PLAN_HEADERS.length} columns, received ${values.length}` };
      errors.push(error);
      entries.push({ row: csvRow, errors: [error] });
      return;
    }
    const strings = Object.fromEntries(FIELD_KEYS.map((key, fieldIndex) => [key, values[fieldIndex].trim()])) as Record<typeof FIELD_KEYS[number], string>;
    const candidate = { ...strings, date: parseIsoDate(strings.date) } as ContentPlanInput;
    const missing = REQUIRED_FIELDS.find((key) => key !== "date" && !candidate[key]);
    let message = missing ? `${CONTENT_PLAN_HEADERS[FIELD_KEYS.indexOf(missing)]} is required` : "";
    if (!message && !/^[A-Za-z0-9][A-Za-z0-9._-]{1,190}$/.test(candidate.contentId)) message = "Content_ID has an invalid format";
    if (!message && Number.isNaN(candidate.date.getTime())) message = "Date must be a valid ISO date (YYYY-MM-DD)";
    if (!message && !CONTENT_PLAN_STATUSES.includes(candidate.status)) message = `Agent_Status must be one of: ${CONTENT_PLAN_STATUSES.join(", ")}`;
    if (!message && (!isSafeStatus(candidate.approvalStatus) || !isSafeStatus(candidate.publishStatus))) message = "Approval_Status and Publish_Status must be lowercase status tokens";
    if (message) {
      const error = { row: csvRow, contentId: candidate.contentId || undefined, message };
      errors.push(error);
      entries.push({ row: csvRow, errors: [error] });
    } else {
      rows.push(candidate);
      entries.push({ row: csvRow, input: candidate, errors: [] });
    }
  });
  return { rows, errors, entries };
}

function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(Number.NaN);
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value ? date : new Date(Number.NaN);
}

function isSafeStatus(value: string) {
  return /^[a-z][a-z0-9_-]{0,49}$/.test(value);
}

export function classifyContentPlanRows(rows: ContentPlanInput[], existingIds: Set<string>) {
  const seen = new Set<string>();
  const insertable: ContentPlanInput[] = [];
  const duplicates: { contentId: string; source: "upload" | "database" }[] = [];
  const classifications: { row: ContentPlanInput; duplicate: false | "upload" | "database" }[] = [];
  for (const row of rows) {
    const duplicate = seen.has(row.contentId) ? "upload" : existingIds.has(row.contentId) ? "database" : false;
    classifications.push({ row, duplicate });
    if (duplicate) duplicates.push({ contentId: row.contentId, source: duplicate });
    else insertable.push(row);
    seen.add(row.contentId);
  }
  return { insertable, duplicates, classifications };
}

export function canTransitionContentPlan(current: ContentPlanStatus, next: ContentPlanStatus) {
  const currentIndex = CONTENT_PLAN_STATUSES.indexOf(current);
  return next === current || CONTENT_PLAN_STATUSES.indexOf(next) === currentIndex + 1;
}
