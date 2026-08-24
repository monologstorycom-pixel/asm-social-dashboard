import { z } from "zod";

const dateOnly = z.iso.date();
const postStatuses = ["idea", "draft", "review", "approved", "scheduled", "published", "failed"] as const;
const postPillars = ["education", "product", "comparison", "inspiration", "promotion", "brand"] as const;
const creativeStyles = ["editorial_no_box", "editorial_magazine", "infographic", "architectural", "product_photography"] as const;
const contentTypes = ["image", "carousel", "reel", "story", "video", "text"] as const;
const sortFields = ["publishDate", "reach", "engagementRate", "saves", "shares"] as const;
const performanceMetrics = ["reach", "engagement", "saves", "shares"] as const;

const sharedFilters = {
  account: z.uuid().optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  topic: z.string().trim().min(1).max(120).optional(),
  pillar: z.enum(postPillars).optional(),
  style: z.enum(creativeStyles).optional(),
  type: z.enum(contentTypes).optional(),
  status: z.enum(postStatuses).optional(),
};
const validDateRange = (value: { dateFrom?: string; dateTo?: string }) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo;

export const postFiltersSchema = z.object({
  ...sharedFilters,
  search: z.string().trim().min(1).max(191).optional(),
  sort: z.enum(sortFields).default("publishDate"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).refine(validDateRange, { message: "dateFrom must be on or before dateTo", path: ["dateTo"] });

export const overviewFiltersSchema = z.object({
  ...sharedFilters,
  metric: z.enum(performanceMetrics).default("reach"),
}).refine(validDateRange, { message: "dateFrom must be on or before dateTo", path: ["dateTo"] });

export const compareQuerySchema = z.object({
  ids: z.string()
    .transform((value) => value.split(",").map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.uuid()).min(2).max(5))
    .refine((ids) => new Set(ids).size === ids.length, "ids must be unique"),
});

const postBase = z.object({
  socialAccountId: z.uuid(),
  title: z.string().trim().min(1).max(191),
  caption: z.string().trim().min(1).max(10000),
  contentPillar: z.enum(postPillars),
  topic: z.string().trim().min(1).max(120),
  contentType: z.enum(contentTypes),
  creativeStyle: z.enum(creativeStyles),
  slideCount: z.number().int().min(1).max(100).default(1),
  status: z.enum(postStatuses).default("idea"),
  instagramMediaId: z.string().trim().max(191).nullable().optional(),
  publicUrl: z.url().nullable().optional(),
  publishedAt: z.iso.datetime().nullable().optional(),
});

export const createPostSchema = postBase.refine(
  (value) => value.status !== "published" || Boolean(value.publishedAt),
  { message: "publishedAt is required for published posts", path: ["publishedAt"] },
);
export const updatePostSchema = postBase.partial().omit({ socialAccountId: true }).refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

const count = z.number().int().min(0).max(4_294_967_295).default(0);
export const metricSchema = z.object({
  capturedAt: z.iso.datetime(),
  reach: count,
  impressions: count,
  views: count,
  likes: count,
  comments: count,
  saves: count,
  shares: count,
}).transform((value) => {
  const engagementTotal = value.likes + value.comments + value.saves + value.shares;
  return { ...value, engagementTotal, engagementRate: value.reach ? (engagementTotal / value.reach) * 100 : 0 };
});

export const idSchema = z.uuid();
export type PostFilters = z.infer<typeof postFiltersSchema>;
export type OverviewFilters = z.infer<typeof overviewFiltersSchema>;
export type PostSort = z.infer<typeof postFiltersSchema>["sort"];
