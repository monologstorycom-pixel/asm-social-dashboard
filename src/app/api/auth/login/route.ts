import { NextResponse } from "next/server";
import { createSessionToken, credentialsMatch, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/auth";

export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return Response.json({ error: "Dashboard authentication is not configured" }, { status: 503 });
  const form = await request.formData();
  if (!credentialsMatch(String(form.get("username") ?? ""), String(form.get("password") ?? ""))) return NextResponse.redirect(new URL("/login?error=credentials", request.url), 303);
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(SESSION_COOKIE, createSessionToken(secret), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_SECONDS });
  return response;
}
