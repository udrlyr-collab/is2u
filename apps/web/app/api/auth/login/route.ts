import { eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, users } from "@is2u/db/schema";
import { loginSchema } from "@is2u/core/validation";
import {
  attachSessionCookies,
  attachDeviceCookie,
  createSession,
  deviceIdFrom,
  failedLoginCount,
  getSession,
  publicUser,
  recordLoginAttempt,
  requireAuthOrigin,
  revokeSession,
  verifyPassword,
} from "../../../../lib/auth";
import { json, readJson, withApiErrors } from "../../../../lib/http";

export const runtime = "nodejs";

const LOGIN_ERROR = "아이디 또는 비밀번호가 맞지 않아요";
const LOGIN_LIMIT_ERROR = "로그인 시도가 많아요 잠시 후 다시 시도해 주세요";

export const POST = withApiErrors(async (request: Request) => {
  requireAuthOrigin(request);
  const input = loginSchema.parse(await readJson(request));
  const deviceId = deviceIdFrom(request);
  const [user] = await getDb().select({
    id: users.id,
    displayName: users.displayName,
    username: users.username,
    gender: users.gender,
    passwordHash: users.passwordHash,
    role: users.role,
    accountStatus: users.accountStatus,
  }).from(users).where(eq(users.username, input.username)).limit(1);
  const valid = await verifyPassword(user?.passwordHash, input.password);
  const loginAllowed = Boolean(valid && user?.username && user.accountStatus === "active");
  await recordLoginAttempt(request, deviceId, loginAllowed, input.username);
  if (!loginAllowed || !user?.username) {
    const failures = await failedLoginCount(request, deviceId, input.username);
    await new Promise((resolve) => setTimeout(resolve, Math.min(2_000, Math.max(300, failures * 300))));
    return attachDeviceCookie(json({ error: failures >= 5 ? LOGIN_LIMIT_ERROR : LOGIN_ERROR }, failures >= 5 ? 429 : 401), deviceId);
  }

  const previous = await getSession(request);
  if (previous) await revokeSession(previous.sessionId);
  const created = await createSession(user.id, deviceId);
  await getDb().transaction(async (tx) => {
    await tx.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    if (user.role === "admin") await tx.insert(auditEvents).values({ actorId: user.id, action: "admin.login", entityType: "user", entityId: user.id });
  });
  return attachSessionCookies(json({ user: publicUser({ ...user, username: user.username }), csrfToken: created.csrf }), created, deviceId);
});
