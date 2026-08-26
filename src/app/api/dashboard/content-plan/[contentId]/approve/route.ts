import { POST as approve } from "@/app/api/internal/content-plan/[contentId]/approve/route";
import { HttpError, safeRoute } from "@/lib/http";
import { APPROVAL_COMMAND, authorizeDashboardRequest } from "@/lib/operations";

type Context = { params: Promise<{ contentId: string }> };

export async function PATCH(request: Request, context: Context) {
  return safeRoute(async () => {
    authorizeDashboardRequest(request);
    const token = process.env.INTERNAL_API_TOKEN;
    if (!token) throw new HttpError(503, "Internal API authentication is not configured");
    const { contentId } = await context.params;
    return approve(new Request(request.url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ command: APPROVAL_COMMAND, reference: `dashboard:${contentId}` }),
    }), context);
  });
}
