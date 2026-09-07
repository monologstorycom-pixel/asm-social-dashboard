import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { authorizeDashboardRequest } from "@/lib/operations";

function cookieValue(header: string, name: string) {
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function authorizeDashboardOrSessionRequest(request: Request) {
  try { authorizeDashboardRequest(request); return; }
  catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401 || !verifySessionToken(cookieValue(request.headers.get("cookie") || "", SESSION_COOKIE))) throw error;
  }
}
