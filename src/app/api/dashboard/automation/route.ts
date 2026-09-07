import { automationSwitches } from "@/lib/automation";
import { safeRoute } from "@/lib/http";
import { authorizeDashboardRequest } from "@/lib/operations";

export async function GET(request: Request) {
  return safeRoute(async () => {
    authorizeDashboardRequest(request);
    const switches = automationSwitches();
    return Response.json({ switches });
  });
}
