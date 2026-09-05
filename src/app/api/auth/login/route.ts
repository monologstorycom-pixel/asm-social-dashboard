import { NextResponse } from "next/server";
import { createSessionToken, credentialsMatch, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/auth";

function publicUrl(request: Request) {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (proto) url.protocol = `${proto}:`;
  if (host) {
    // strip :3000 internal port
    const cleanHost = host.replace(/:3000$/, "");
    url.host = cleanHost;
    // also fix 0.0.0.0 to public domain
    if (cleanHost.startsWith("0.0.0.0") || cleanHost.startsWith("127.0.0.1")) {
      url.host = process.env.NEXT_PUBLIC_APP_HOST || "sosmedasm.rsby.cloud";
    }
  }
  return url;
}

export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return Response.json({ error: "Dashboard authentication is not configured" }, { status: 503 });
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!credentialsMatch(username, password)) {
    const failUrl = publicUrl(request);
    failUrl.pathname = "/login";
    failUrl.search = `?error=credentials&next=${encodeURIComponent(safeNext)}`;
    return NextResponse.redirect(failUrl, 303);
  }
  const successUrl = publicUrl(request);
  successUrl.pathname = safeNext;
  successUrl.search = "";
  const response = NextResponse.redirect(successUrl, 303);
  response.cookies.set(SESSION_COOKIE, createSessionToken(secret), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_SECONDS });
  return response;
}
