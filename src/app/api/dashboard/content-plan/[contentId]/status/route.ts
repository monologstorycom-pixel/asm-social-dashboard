import { PATCH as updateStatus } from "@/app/api/content-plan/[contentId]/status/route";
import { HttpError, safeRoute } from "@/lib/http";
import { authorizeDashboardRequest } from "@/lib/operations";

type Context = { params: Promise<{ contentId: string }> };

export async function PATCH(request: Request, context: Context) {
  return safeRoute(async () => {
    authorizeDashboardRequest(request);
    const token = process.env.INTERNAL_API_TOKEN;
    if (!token) throw new HttpError(503, "Internal API authentication is not configured");
    return updateStatus(new Request(request.url, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: request.body,
      duplex: "half",
    } as RequestInit), context);
  });
}
