import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export function proxy(request: NextRequest) {
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const host = process.env.NEXT_PUBLIC_APP_HOST || request.headers.get("x-forwarded-host")?.replace(/:\d+$/, "") || "sosmedasm.rsby.cloud";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return NextResponse.redirect(`${protocol}://${host}/login?next=${encodeURIComponent(request.nextUrl.pathname)}`, 307);
}

export const config = {
  matcher: ["/", "/posts/:path*", "/compare/:path*", "/content-plan/:path*", "/api/dashboard/:path*"],
};
