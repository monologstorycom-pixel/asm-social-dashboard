#!/usr/bin/env node

const [mode] = process.argv.slice(2);
const paths = {
  import: "/api/internal/meta/import",
  "sync-due": "/api/internal/meta/sync-due",
};

if (!Object.hasOwn(paths, mode)) {
  console.error("Usage: node scripts/meta-sync-runner.mjs <import|sync-due>");
  process.exit(2);
}

const baseUrl = process.env.ASM_SOCIAL_BASE_URL;
const token = process.env.INTERNAL_API_TOKEN;
if (!baseUrl || !token) {
  console.error("ASM_SOCIAL_BASE_URL and INTERNAL_API_TOKEN are required");
  process.exit(2);
}

const target = new URL(paths[mode], baseUrl);
if (target.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
  console.error("Refusing plaintext HTTP except for localhost");
  process.exit(2);
}

try {
  const response = await fetch(target, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(290_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);
  console.log(body);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
