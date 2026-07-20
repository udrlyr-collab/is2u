import { eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, users } from "@is2u/db/schema";
import { relationshipLabel } from "@is2u/core/types";
import { accountUpdateSchema } from "@is2u/core/validation";
import { publicUser, requireCsrf, requireSession } from "../../../lib/auth";
import { json, readJson, withApiErrors } from "../../../lib/http";

export const GET = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  const [account] = await getDb().select({
    id: users.id,
    displayName: users.displayName,
    username: users.username,
    gender: users.gender,
    role: users.role,
    accountStatus: users.accountStatus,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, session.user.id)).limit(1);
  return json({ user: account ? { ...session.user, createdAt: account.createdAt } : session.user });
});

export const PATCH = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = accountUpdateSchema.parse(await readJson(request));
  const db = getDb();
  let updated: { id: string; displayName: string; username: string | null; gender: "male" | "female"; role: "user" | "admin"; accountStatus: "active" | "suspended" | "pending_deletion" | "deleted" };
  [updated] = await db.update(users).set({
    displayName: input.displayName,
    gender: input.gender,
    roleLabel: relationshipLabel(input.gender),
    updatedAt: new Date(),
  }).where(eq(users.id, session.user.id)).returning({ id: users.id, displayName: users.displayName, username: users.username, gender: users.gender, role: users.role, accountStatus: users.accountStatus });
  if (!updated.username) throw new Error("계정 변경 결과를 확인하지 못했습니다");
  await db.insert(auditEvents).values({ actorId: session.user.id, action: "account.updated", entityType: "user", entityId: session.user.id });
  return json({ user: publicUser({ ...updated, username: updated.username }) });
});
