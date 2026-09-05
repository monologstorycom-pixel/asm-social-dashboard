import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export function proxy(request: NextRequest) {
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname);
  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (proto) url.protocol = `${proto}:`;
  if (host) {
    const cleanHost = host.replace(/:\d+$/, "");
    url.hostname = cleanHost === "0.0.0.0" || cleanHost === "127.0.0.1" || cleanHost === "localhost"
      ? process.env.NEXT_PUBLIC_APP_HOST || "sosmedasm.rsby.cloud"
      : cleanHost;
    url.port = "";
  }
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/", "/posts/:path*", "/compare/:path*", "/content-plan/:path*", "/api/dashboard/:path*"],
};
