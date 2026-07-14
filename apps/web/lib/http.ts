import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(";").map((part) => {
    const index = part.indexOf("=");
    const key = index >= 0 ? part.slice(0, index).trim() : part.trim();
    const value = index >= 0 ? part.slice(index + 1).trim() : "";
    return [key, decodeURIComponent(value)];
  }));
}

export function cookie(
  name: string,
  value: string,
  options: { maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "Lax" | "Strict"; path?: string } = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? "/"}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  return parts.join("; ");
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) throw new HttpError(415, "JSON 요청만 보낼 수 있어요");
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "요청 내용을 읽을 수 없어요");
  }
}

export function withApiErrors<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof ZodError) return json({ error: "입력값을 확인해 주세요", details: error.issues.map((issue) => issue.message) }, 400);
      console.error("api_request_failed", error instanceof Error ? error.message : "unknown");
      return json({ error: "잠시 후 다시 시도해 주세요" }, 500);
    }
  };
}
