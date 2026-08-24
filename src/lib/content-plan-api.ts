import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { HttpError } from "@/lib/http";
import { CONTENT_PLAN_STATUSES, type ContentPlanInput, type ContentPlanCsvError } from "@/lib/content-plan";

export const contentPlanStatusSchema = z.enum(CONTENT_PLAN_STATUSES);
export const contentIdSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,190}$/, "Invalid Content_ID");
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid date");

export const contentPlanFiltersSchema = z.object({
  status: contentPlanStatusSchema.optional(),
  pillar: z.string().trim().max(100).optional(),
  topic: z.string().trim().max(120).optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  search: z.string().trim().max(191).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["asc", "desc"]).default("asc"),
}).refine(({ dateFrom, dateTo }) => !dateFrom || !dateTo || dateFrom <= dateTo, { message: "dateFrom must be before or equal to dateTo", path: ["dateTo"] });

export type ContentPlanFilters = z.infer<typeof contentPlanFiltersSchema>;

export function buildContentPlanWhere(filters: ContentPlanFilters): Prisma.ContentPlanItemWhereInput {
  const date = filters.dateFrom || filters.dateTo ? {
    ...(filters.dateFrom && { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) }),
    ...(filters.dateTo && { lte: new Date(`${filters.dateTo}T00:00:00.000Z`) }),
  } : undefined;
  return {
    ...(filters.status && { status: filters.status }),
    ...(filters.pillar && { pillar: { contains: filters.pillar } }),
    ...(filters.topic && { topicTag: { contains: filters.topic } }),
    ...(date && { date }),
    ...(filters.search && { OR: [
      { contentId: { contains: filters.search } },
      { workingTitle: { contains: filters.search } },
      { hook: { contains: filters.search } },
      { coreAngle: { contains: filters.search } },
      { topicTag: { contains: filters.search } },
    ] }),
  };
}

const MAX_CSV_BYTES = 1024 * 1024;

export async function readCsvPayload(request: Request): Promise<string> {
  const declaredSize = Number(request.headers.get("content-length") || 0);
  // ponytail: allow bounded JSON/multipart envelope overhead; use a streaming multipart parser if uploads gain more fields.
  if (declaredSize > MAX_CSV_BYTES + 64 * 1024) throw new HttpError(413, "CSV exceeds 1 MiB limit");
  const type = request.headers.get("content-type") || "";
  if (type.includes("multipart/form-data")) {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Multipart field 'file' is required");
    if (file.size > MAX_CSV_BYTES) throw new HttpError(413, "CSV exceeds 1 MiB limit");
    const csv = await file.text();
    if (new TextEncoder().encode(csv).length > MAX_CSV_BYTES) throw new HttpError(413, "CSV exceeds 1 MiB limit");
    return csv;
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_CSV_BYTES) throw new HttpError(413, "CSV exceeds 1 MiB limit");
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new HttpError(400, "Invalid JSON body"); }
  if (!parsed || typeof parsed !== "object" || !("csv" in parsed) || typeof parsed.csv !== "string") throw new HttpError(400, "JSON string field 'csv' is required");
  return parsed.csv;
}

type PlanRecord = Record<string, unknown> & { contentId: string; date: Date };

export function contentPlanJson(item: PlanRecord) {
  const { id, contentId, date, day, testPublishWindow, pillar, goal, format, creativeStyle, audience, topicTag, workingTitle, hook, coreAngle, slide1, slide2, slide3, slide45, visualDirection, cta, captionBrief, primaryMetric, secondaryMetric, engagementMechanic, storyCompanion, experimentTag, productFocus, claimGuardrail, assetsNeeded, status, approvalStatus, publishStatus, contentPostId, finalCaption, finalBrief, qaStatus, qaResult, qaNotes, approvedAt, approvalCommand, approvalReference, approvalAttemptId, approvalVersion, scheduledAt, publishedAt, publisherState, publisherError, assets, contentPost, createdAt, updatedAt } = item;
  return {
    id,
    Content_ID: contentId,
    date: date.toISOString().slice(0, 10),
    hari: day,
    test_publish_window: testPublishWindow,
    pillar,
    goal,
    format,
    creative_style: creativeStyle,
    audience,
    topic: topicTag,
    working_title: workingTitle,
    hook,
    core_angle: coreAngle,
    slide_1: slide1,
    slide_2: slide2,
    slide_3: slide3,
    slide_4_5: slide45,
    visual_direction: visualDirection,
    cta,
    caption_brief: captionBrief,
    primary_metric: primaryMetric,
    secondary_metric: secondaryMetric,
    engagement_mechanic: engagementMechanic,
    story_companion: storyCompanion,
    experiment_tag: experimentTag,
    product_focus: productFocus,
    claim_guardrail: claimGuardrail,
    assets_needed: assetsNeeded,
    status,
    approval_status: approvalStatus,
    publish_status: publishStatus,
    publishing_mode: publishStatus,
    content_post_id: contentPostId,
    final_caption: finalCaption,
    final_brief: finalBrief,
    qa_status: qaStatus,
    qa_result: qaResult,
    qa_notes: qaNotes,
    approved_at: approvedAt instanceof Date ? approvedAt.toISOString() : approvedAt,
    approval_command: approvalCommand,
    approval_reference: approvalReference,
    approval_attempt_id: approvalAttemptId,
    approval_version: approvalVersion,
    scheduled_at: scheduledAt instanceof Date ? scheduledAt.toISOString() : scheduledAt,
    published_at: publishedAt instanceof Date ? publishedAt.toISOString() : publishedAt,
    publisher_state: publisherState,
    publisher_error: publisherError,
    assets,
    content_post: contentPost,
    created_at: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
    updated_at: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
  };
}

export type ImportPreviewRow = {
  row: number;
  contentId?: string;
  valid: boolean;
  errors: string[];
  duplicateReason: null | "within_file" | "existing_database";
};

export function contentPlanImportOutcome(
  entries: { row: number; input?: ContentPlanInput; errors: ContentPlanCsvError[] }[],
  existingIds: Set<string>,
) {
  const seen = new Set<string>();
  const insertable: ContentPlanInput[] = [];
  const preview: ImportPreviewRow[] = entries.map((entry) => {
    if (!entry.input) return { row: entry.row, contentId: entry.errors[0]?.contentId, valid: false, errors: entry.errors.map(({ message }) => message), duplicateReason: null };
    const { contentId } = entry.input;
    const duplicateReason = seen.has(contentId) ? "within_file" : existingIds.has(contentId) ? "existing_database" : null;
    seen.add(contentId);
    if (!duplicateReason) insertable.push(entry.input);
    return { row: entry.row, contentId, valid: true, errors: [], duplicateReason };
  });
  return {
    insertable,
    preview,
    summary: {
      total: entries.length,
      valid: preview.filter(({ valid }) => valid).length,
      invalid: preview.filter(({ valid }) => !valid).length,
      duplicates: preview.filter(({ duplicateReason }) => duplicateReason !== null).length,
      insertable: insertable.length,
    },
  };
}
