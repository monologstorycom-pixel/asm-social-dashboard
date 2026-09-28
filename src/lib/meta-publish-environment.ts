import { HttpError } from "./http";

export function resolveMetaPublishAccount(targetAccountId: string, env: Record<string, string | undefined> = process.env) {
  if (!env.META_PUBLISH_ENV || env.META_PUBLISH_ENV === "disabled") throw new HttpError(503, "Meta publishing is disabled");
  if (env.META_PUBLISH_ENV === "staging") {
    const accountId = env.META_STAGING_IG_USER_ID;
    if (!accountId || !/^\d+$/.test(accountId)) throw new HttpError(503, "META_STAGING_IG_USER_ID is not configured correctly");
    if (targetAccountId === accountId) return accountId;
    throw new HttpError(403, "Target is not the configured staging Instagram account");
  }
  if (env.META_PUBLISH_ENV === "production") {
    const value = env.META_PRODUCTION_IG_USER_IDS;
    const accountIds = value?.split(",") ?? [];
    if (!value || accountIds.some((accountId) => !/^\d+$/.test(accountId)) || new Set(accountIds).size !== accountIds.length) throw new HttpError(503, "META_PRODUCTION_IG_USER_IDS is not configured correctly");
    if (accountIds.includes(targetAccountId)) return targetAccountId;
    throw new HttpError(403, "Target is not a configured production Instagram account");
  }
  throw new HttpError(503, "Invalid META_PUBLISH_ENV");
}
