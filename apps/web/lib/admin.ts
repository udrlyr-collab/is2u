import { getDb } from "@is2u/db/client";
import { auditEvents } from "@is2u/db/schema";
import { HttpError } from "./http";
import { requireSession, type AuthSession } from "./auth";

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin";
}

export async function requireAdmin(request: Request): Promise<AuthSession> {
  const session = await requireSession(request);
  if (!isAdminRole(session.user.role)) {
    await getDb().insert(auditEvents).values({
      actorId: session.user.id,
      action: "admin.access_denied",
      entityType: "admin_area",
    });
    throw new HttpError(403, "관리자만 사용할 수 있어요");
  }
  return session;
}

export async function writeAdminAudit(input: {
  actorId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  await getDb().insert(auditEvents).values(input);
}

export function adminFailureCode(error: unknown): string {
  if (error instanceof HttpError) return `http_${error.status}`;
  if (error && typeof error === "object" && "name" in error && error.name === "ZodError") return "invalid_input";
  return "internal_error";
}
