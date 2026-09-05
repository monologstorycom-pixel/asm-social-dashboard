import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export function proxy(request: NextRequest) {
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const location = `/login?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return new NextResponse(null, { status: 307, headers: { Location: location } });
}

export const config = {
  matcher: ["/", "/posts/:path*", "/compare/:path*", "/content-plan/:path*", "/api/dashboard/:path*"],
};
