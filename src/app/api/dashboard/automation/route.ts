import { automationSwitches } from "@/lib/automation";
import { authorizeDashboardOrSessionRequest } from "@/lib/dashboard-auth";
import { safeRoute } from "@/lib/http";

export async function GET(request: Request) {
  return safeRoute(async () => {
    authorizeDashboardOrSessionRequest(request);
    const switches = automationSwitches();
    return Response.json({ switches });
  });
}
