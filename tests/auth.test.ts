import assert from "node:assert/strict";
import test from "node:test";
import { createSessionToken, credentialsMatch, verifySessionToken } from "../src/lib/auth";

test("dashboard credentials require exact configured values", () => {
  assert.equal(credentialsMatch("auristeel", "correct", "auristeel", "correct"), true);
  assert.equal(credentialsMatch("Auristeel", "correct", "auristeel", "correct"), false);
  assert.equal(credentialsMatch("auristeel", "wrong", "auristeel", "correct"), false);
  assert.equal(credentialsMatch("auristeel", "correct", undefined, "correct"), false);
});

test("dashboard session is signed and expires", () => {
  const token = createSessionToken("session-secret", 2_000);
  assert.equal(verifySessionToken(token, "session-secret", 1_999), true);
  assert.equal(verifySessionToken(token, "wrong-secret", 1_999), false);
  assert.equal(verifySessionToken(`${token}x`, "session-secret", 1_999), false);
  assert.equal(verifySessionToken(token, "session-secret", 2_000), false);
});
