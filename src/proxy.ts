import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

function getBaseUrl(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const base = new URL(request.url);
  if (forwardedProto) base.protocol = forwardedProto;
  if (forwardedHost) base.host = forwardedHost.replace(/:3000$/, "");
  if (base.hostname === "0.0.0.0" || base.hostname === "127.0.0.1" || base.port === "3000") base.host = process.env.NEXT_PUBLIC_APP_HOST || "sosmedasm.rsby.cloud";
  return `${base.protocol}//${base.host}`;
}

export function proxy(request: NextRequest) {
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const login = new URL("/login", getBaseUrl(request));
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/posts/:path*", "/compare/:path*", "/content-plan/:path*", "/api/dashboard/:path*"],
};
