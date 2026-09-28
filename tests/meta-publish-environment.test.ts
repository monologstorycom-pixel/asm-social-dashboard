import assert from "node:assert/strict";
import test from "node:test";

import { HttpError } from "../src/lib/http";
import { resolveMetaPublishAccount } from "../src/lib/meta-publish-environment";

test("Meta publishing defaults to disabled", () => {
  assert.throws(
    () => resolveMetaPublishAccount("123", {}),
    (error: unknown) => error instanceof HttpError && error.status === 503 && /disabled/.test(error.message),
  );
});

test("Meta publishing rejects unknown environments", () => {
  for (const value of ["preview", "Staging", "production "]) {
    assert.throws(
      () => resolveMetaPublishAccount("123", { META_PUBLISH_ENV: value }),
      (error: unknown) => error instanceof HttpError && error.status === 503 && /META_PUBLISH_ENV/.test(error.message),
    );
  }
});

test("staging permits its configured Instagram account", () => {
  assert.equal(
    resolveMetaPublishAccount("123", { META_PUBLISH_ENV: "staging", META_STAGING_IG_USER_ID: "123" }),
    "123",
  );
});

test("staging rejects missing, malformed, or mismatched configuration", () => {
  for (const env of [
    { META_PUBLISH_ENV: "staging" },
    { META_PUBLISH_ENV: "staging", META_STAGING_IG_USER_ID: "" },
    { META_PUBLISH_ENV: "staging", META_STAGING_IG_USER_ID: " 123" },
    { META_PUBLISH_ENV: "staging", META_STAGING_IG_USER_ID: "abc" },
  ]) {
    assert.throws(
      () => resolveMetaPublishAccount("123", env),
      (error: unknown) => error instanceof HttpError && error.status === 503 && /META_STAGING_IG_USER_ID/.test(error.message),
    );
  }
  assert.throws(
    () => resolveMetaPublishAccount("456", { META_PUBLISH_ENV: "staging", META_STAGING_IG_USER_ID: "123" }),
    (error: unknown) => error instanceof HttpError && error.status === 403,
  );
});

test("production permits every configured Instagram account", () => {
  const env = { META_PUBLISH_ENV: "production", META_PRODUCTION_IG_USER_IDS: "123,456" };
  assert.equal(resolveMetaPublishAccount("123", env), "123");
  assert.equal(resolveMetaPublishAccount("456", env), "456");
});

test("production rejects missing or malformed account lists", () => {
  for (const value of [undefined, "", "123,", ",123", "123,,456", "123, 456", "abc", "123,abc", "123,123"]) {
    assert.throws(
      () => resolveMetaPublishAccount("123", { META_PUBLISH_ENV: "production", META_PRODUCTION_IG_USER_IDS: value }),
      (error: unknown) => error instanceof HttpError && error.status === 503 && /META_PRODUCTION_IG_USER_IDS/.test(error.message),
    );
  }
});

test("production rejects accounts outside its allowlist without falling back to staging", () => {
  assert.throws(
    () => resolveMetaPublishAccount("789", { META_PUBLISH_ENV: "production", META_PRODUCTION_IG_USER_IDS: "123,456", META_STAGING_IG_USER_ID: "789" }),
    (error: unknown) => error instanceof HttpError && error.status === 403,
  );
});
