import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export function proxy(request: NextRequest) {
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname);
  // Fix host: strip :3000, fix 0.0.0.0
  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (proto) url.protocol = `${proto}:`;
  if (host) {
    const cleanHost = host.replace(/:3000$/, "");
    if (cleanHost.startsWith("0.0.0.0") || cleanHost.startsWith("127.0.0.1")) {
      url.host = process.env.NEXT_PUBLIC_APP_HOST || "sosmedasm.rsby.cloud";
    } else {
      url.host = cleanHost;
    }
  }
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/", "/posts/:path*", "/compare/:path*", "/content-plan/:path*", "/api/dashboard/:path*"],
};
