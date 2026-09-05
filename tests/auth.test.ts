import assert from "node:assert/strict";
import test from "node:test";
import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";
import { config } from "../src/proxy";
import { POST as logout } from "../src/app/api/auth/logout/route";
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

test("proxy matcher covers root, dashboard routes, and api dashboard", () => {
  assert.equal(doesProxyMatch({ config, url: "/" }), true);
  assert.equal(doesProxyMatch({ config, url: "/posts/123" }), true);
  assert.equal(doesProxyMatch({ config, url: "/compare" }), true);
  assert.equal(doesProxyMatch({ config, url: "/content-plan/today" }), true);
  assert.equal(doesProxyMatch({ config, url: "/api/dashboard/overview" }), true);
  assert.equal(doesProxyMatch({ config, url: "/login" }), false);
  assert.equal(doesProxyMatch({ config, url: "/api/auth/login" }), false);
  assert.equal(doesProxyMatch({ config, url: "/api/auth/logout" }), false);
});

test("logout clears the session cookie and redirects to login", async () => {
  const response = await logout(new Request("https://example.com/api/auth/logout", {
    method: "POST",
    headers: { "x-forwarded-host": "example.com:3000" },
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${process.env.NODE_ENV === "production" ? "https" : "http"}://example.com/login`);
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /asm_dashboard_session=/);
  assert.match(cookie, /Max-Age=0/i);
  assert.match(cookie, /Path=\//i);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
});
