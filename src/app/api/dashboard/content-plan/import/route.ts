import { POST as importContentPlan } from "@/app/api/content-plan/import/route";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { HttpError, safeRoute } from "@/lib/http";
import { authorizeDashboardRequest } from "@/lib/operations";

function cookieValue(header: string, name: string) {
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function authorizeImportBridgeRequest(request: Request) {
  try { authorizeDashboardRequest(request); return; }
  catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401 || !verifySessionToken(cookieValue(request.headers.get("cookie") || "", SESSION_COOKIE))) throw error;
  }
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    authorizeImportBridgeRequest(request);
    const token = process.env.INTERNAL_API_TOKEN;
    if (!token) throw new HttpError(503, "Internal API authentication is not configured");
    const headers = new Headers({ authorization: `Bearer ${token}` });
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    return importContentPlan(new Request(request.url, { method: "POST", headers, body: request.body, duplex: "half" } as RequestInit));
  });
}
