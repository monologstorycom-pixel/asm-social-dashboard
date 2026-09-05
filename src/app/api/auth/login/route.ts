import { NextResponse } from "next/server";
import { createSessionToken, credentialsMatch, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/auth";

function redirect(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return Response.json({ error: "Dashboard authentication is not configured" }, { status: 503 });
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!credentialsMatch(username, password)) return redirect(`/login?error=credentials&next=${encodeURIComponent(safeNext)}`);
  const response = redirect(safeNext);
  response.cookies.set(SESSION_COOKIE, createSessionToken(secret), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_SECONDS });
  return response;
}
