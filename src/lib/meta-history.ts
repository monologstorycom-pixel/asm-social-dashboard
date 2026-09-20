import type { MetaMedia } from "./operations";

export type HistoricalOutcome = "imported" | "skipped" | "failed" | "unsupported";
type Input = {
  accountId: string;
  concurrency: number;
  batchSize: number;
  loadCheckpoint: () => Promise<string | null>;
  listPage: (accountId: string, cursor?: string) => Promise<{ data: MetaMedia[]; after?: string }>;
  processMedia: (media: MetaMedia) => Promise<HistoricalOutcome>;
  saveCheckpoint: (cursor: string | null) => Promise<void>;
  profile: () => Promise<{ mediaCount?: number }>;
  maxPages?: number;
};

async function bounded<T>(items: T[], limit: number, run: (item: T) => Promise<HistoricalOutcome>) {
  const outcomes: HistoricalOutcome[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; outcomes[index] = await run(items[index]).catch(() => "failed"); }
  }));
  return outcomes;
}

/** Full historical traversal. Checkpoint advances only after a completely successful page. */
export async function historicalMetaSync(input: Input) {
  if (!Number.isInteger(input.concurrency) || input.concurrency < 1 || input.concurrency > 10) throw new Error("concurrency must be between 1 and 10");
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 100) throw new Error("batchSize must be between 1 and 100");
  const started = new Date();
  const profile = await input.profile();
  let cursor = await input.loadCheckpoint();
  let api = 0, imported = 0, skipped = 0, failed = 0, unsupported = 0, pages = 0;
  const seen = new Set<string>();
  while (pages < (input.maxPages ?? Number.MAX_SAFE_INTEGER)) {
    const pageCursor = cursor;
    if (pageCursor && seen.has(pageCursor)) throw new Error("Meta pagination cursor repeated");
    if (pageCursor) seen.add(pageCursor);
    const page = await input.listPage(input.accountId, pageCursor ?? undefined);
    api += page.data.length;
    const outcomes: HistoricalOutcome[] = [];
    for (let start = 0; start < page.data.length; start += input.batchSize) outcomes.push(...await bounded(page.data.slice(start, start + input.batchSize), input.concurrency, input.processMedia));
    for (const outcome of outcomes) ({ imported: () => imported++, skipped: () => skipped++, failed: () => failed++, unsupported: () => unsupported++ })[outcome]();
    pages++;
    if (outcomes.includes("failed")) { cursor = pageCursor; break; }
    cursor = page.after ?? null;
    await input.saveCheckpoint(cursor);
    if (!cursor || !page.data.length) break;
  }
  const expected = profile.mediaCount;
  return {
    profile,
    api,
    imported,
    skipped,
    failed,
    unsupported,
    checkpoint: cursor,
    coverage: { processed: api, expected: expected ?? null, complete: cursor === null && failed === 0 && (expected === undefined || api >= expected) },
    syncTime: { startedAt: started.toISOString(), finishedAt: new Date().toISOString() },
  };
}
