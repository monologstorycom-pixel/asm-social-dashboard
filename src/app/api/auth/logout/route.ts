import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const host = process.env.NEXT_PUBLIC_APP_HOST || request.headers.get("x-forwarded-host")?.replace(/:\d+$/, "") || "sosmedasm.rsby.cloud";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const response = NextResponse.redirect(`${protocol}://${host}/login`, 303);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
