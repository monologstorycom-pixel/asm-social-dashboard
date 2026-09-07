import { POST as importContentPlan } from "@/app/api/content-plan/import/route";
import { authorizeDashboardOrSessionRequest } from "@/lib/dashboard-auth";
import { HttpError, safeRoute } from "@/lib/http";

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeDashboardOrSessionRequest(request);
    const token = process.env.INTERNAL_API_TOKEN;
    if (!token) throw new HttpError(503, "Internal API authentication is not configured");
    const headers = new Headers({ authorization: `Bearer ${token}` });
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    return importContentPlan(new Request(request.url, { method: "POST", headers, body: request.body, duplex: "half" } as RequestInit));
  });
}
