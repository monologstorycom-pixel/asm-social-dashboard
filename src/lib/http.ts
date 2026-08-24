import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export async function safeRoute(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Validation failed", issues: error.issues.map(({ path, message }) => ({ path, message })) }, { status: 400 });
    }
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "P2002") return Response.json({ error: "Record already exists" }, { status: 409 });
    if (code === "P2003") return Response.json({ error: "Referenced record does not exist" }, { status: 400 });
    if (code === "P2025") return Response.json({ error: "Record not found" }, { status: 404 });
    console.error("Unhandled API error", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export function queryObject(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}
