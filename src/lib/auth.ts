import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "asm_dashboard_session";
export const SESSION_SECONDS = 8 * 60 * 60;

const digest = (value: string) => createHmac("sha256", "asm-dashboard-credentials").update(value).digest();
const signature = (expiresAt: string, secret: string) => createHmac("sha256", secret).update(expiresAt).digest("base64url");

export function credentialsMatch(username: string, password: string, expectedUsername = process.env.DASHBOARD_USERNAME, expectedPassword = process.env.DASHBOARD_PASSWORD) {
  return Boolean(expectedUsername && expectedPassword && timingSafeEqual(digest(username), digest(expectedUsername)) && timingSafeEqual(digest(password), digest(expectedPassword)));
}

export function createSessionToken(secret: string, expiresAt = Date.now() + SESSION_SECONDS * 1000) {
  const expiry = String(expiresAt);
  return `${expiry}.${signature(expiry, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret = process.env.SESSION_SECRET, now = Date.now()) {
  if (!token || !secret) return false;
  const [expiresAt, candidate, extra] = token.split(".");
  if (extra || !expiresAt || !candidate || !/^\d+$/.test(expiresAt) || Number(expiresAt) <= now) return false;
  const expected = signature(expiresAt, secret);
  return candidate.length === expected.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}
