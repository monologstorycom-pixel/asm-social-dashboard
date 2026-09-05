import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

function buildUrl(path: string, request: NextRequest) {
  const url = new URL(path, request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedProto) url.protocol = forwardedProto;
  if (forwardedHost) url.host = forwardedHost.replace(/:3000$/, "");
  return url;
}

export function proxy(request: NextRequest) {
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const login = buildUrl("/login", request);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/posts/:path*", "/compare/:path*", "/content-plan/:path*", "/api/dashboard/:path*"],
};
