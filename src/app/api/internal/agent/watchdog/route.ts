import { dailyWatchdogFailure, findDailyWatchdogFailures } from "@/lib/agent-due";
import { db } from "@/lib/db";
import { safeRoute } from "@/lib/http";
import { authorizeInternalRequest } from "@/lib/operations";

export async function GET(request: Request) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const now = new Date();
    const simulateStale = new URL(request.url).searchParams.get("simulateStale") === "true";
    const failures = simulateStale
      ? [dailyWatchdogFailure({ contentId: "SIMULATION-NO-WRITE", status: "creating", updatedAt: new Date(now.getTime() - 121 * 60_000) }, now)]
      : await findDailyWatchdogFailures(db, now);
    for (const failure of failures) console.error(JSON.stringify({ level: "error", event: "daily_content_watchdog", ...failure }));
    return Response.json({ ok: failures.length === 0, readOnly: true, simulated: simulateStale, failures }, { status: failures.length ? 503 : 200 });
  });
}
