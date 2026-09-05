import { NextResponse } from "next/server";
import { createSessionToken, credentialsMatch, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/auth";

export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return Response.json({ error: "Dashboard authentication is not configured" }, { status: 503 });
  const form = await request.formData();
  if (!credentialsMatch(String(form.get("username") ?? ""), String(form.get("password") ?? ""))) {
    const failUrl = new URL("/login?error=credentials", request.url);
    failUrl.protocol = request.headers.get("x-forwarded-proto") ?? failUrl.protocol;
    failUrl.host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? failUrl.host;
    return NextResponse.redirect(failUrl, 303);
  }
  const redirectUrl = new URL("/", request.url);
  redirectUrl.protocol = request.headers.get("x-forwarded-proto") ?? redirectUrl.protocol;
  redirectUrl.host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? redirectUrl.host;
  const response = NextResponse.redirect(redirectUrl, 303);
  response.cookies.set(SESSION_COOKIE, createSessionToken(secret), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_SECONDS });
  return response;
}
