import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { closeDb, getDb } from "@is2u/db/client";
import { auditEvents, sessions, users } from "@is2u/db/schema";
import { FIXED_USERS } from "@is2u/core/types";
import { passwordSchema, usernameSchema } from "@is2u/core/validation";

const inputSchema = z.object({ username: usernameSchema, password: passwordSchema });
let raw = "";
for await (const chunk of process.stdin) raw += chunk.toString();
const input = inputSchema.parse(JSON.parse(raw));
const db = getDb();
try {
  const [duplicate] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1);
  if (duplicate && duplicate.id !== FIXED_USERS.seongmin.id) throw new Error("ADMIN_USERNAME_ALREADY_IN_USE");
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const [updated] = await db.transaction(async (tx) => {
    const [account] = await tx.update(users).set({
      displayName: FIXED_USERS.seongmin.displayName,
      roleLabel: FIXED_USERS.seongmin.roleLabel,
      gender: FIXED_USERS.seongmin.gender,
      username: input.username,
      passwordHash,
      role: "admin",
      accountStatus: "active",
      credentialsActivatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(users.id, FIXED_USERS.seongmin.id)).returning({ id: users.id, username: users.username, role: users.role });
    if (!account) throw new Error("ADMIN_ACCOUNT_NOT_FOUND");
    await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, account.id));
    await tx.insert(auditEvents).values({ actorId: account.id, action: "admin.account_provisioned", entityType: "user", entityId: account.id });
    return [account];
  });
  process.stdout.write(JSON.stringify({ ok: true, userId: updated.id, username: updated.username, role: updated.role }));
} finally {
  await closeDb();
}
