#!/usr/bin/env node
import { closeSync, openSync, unlinkSync } from "node:fs";

const base = process.env.ASM_SOCIAL_BASE_URL;
const token = process.env.INTERNAL_API_TOKEN;
const lockPath = process.env.PUBLISHER_LOCK_FILE || "/tmp/asm-publisher.lock";
let lock;
try {
  if (!base || !token) throw new Error("ASM_SOCIAL_BASE_URL and INTERNAL_API_TOKEN are required");
  lock = openSync(lockPath, "wx", 0o600);
  const response = await fetch(new URL("/api/internal/publisher/poll", base), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(240_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`publisher poll HTTP ${response.status}: ${text.slice(0, 500)}`);
  const result = JSON.parse(text);
  if (result.failed) throw new Error(`${result.failed} publisher job(s) failed`);
  console.log(JSON.stringify({ level: "info", event: "publisher_poll", ...result }));
} catch (error) {
  if (error?.code === "EEXIST") console.error(JSON.stringify({ level: "warn", event: "publisher_poll_skipped", reason: "locked" }));
  else console.error(JSON.stringify({ level: "error", event: "publisher_poll_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); }
}
