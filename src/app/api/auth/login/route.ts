import { NextResponse } from "next/server";
import { createSessionToken, credentialsMatch, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/auth";

function getBaseUrl(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const base = new URL(request.url);
  if (forwardedProto) base.protocol = forwardedProto;
  if (forwardedHost) base.host = forwardedHost.replace(/:3000$/, "");
  if (base.hostname === "0.0.0.0" || base.hostname === "127.0.0.1" || base.port === "3000") base.host = process.env.NEXT_PUBLIC_APP_HOST || "sosmedasm.rsby.cloud";
  return `${base.protocol}//${base.host}`;
}

function redirect(path: string, request: Request) {
  return NextResponse.redirect(new URL(path, getBaseUrl(request)), 303);
}

export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return Response.json({ error: "Dashboard authentication is not configured" }, { status: 503 });
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!credentialsMatch(username, password)) return redirect(`/login?error=credentials&next=${encodeURIComponent(safeNext)}`, request);
  const response = redirect(safeNext, request);
  response.cookies.set(SESSION_COOKIE, createSessionToken(secret), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_SECONDS });
  return response;
}
