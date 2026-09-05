import { NextResponse } from "next/server";
import { createSessionToken, credentialsMatch, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/auth";

function publicUrl(request: Request) {
  const host = process.env.NEXT_PUBLIC_APP_HOST || request.headers.get("x-forwarded-host")?.replace(/:\d+$/, "") || "sosmedasm.rsby.cloud";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return new URL(`${protocol}://${host}`);
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
