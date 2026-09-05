import { NextResponse } from "next/server";
import { createSessionToken, credentialsMatch, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/auth";

function buildUrl(path: string, request: Request) {
  const url = new URL(path, request.url);
  url.protocol = request.headers.get("x-forwarded-proto") ?? url.protocol;
  url.host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
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
    const failUrl = buildUrl(`/login?error=credentials&next=${encodeURIComponent(safeNext)}`, request);
    return NextResponse.redirect(failUrl, 303);
  }
  const response = NextResponse.redirect(buildUrl(safeNext, request), 303);
  response.cookies.set(SESSION_COOKIE, createSessionToken(secret), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_SECONDS });
  return response;
}
