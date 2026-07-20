import { eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { userSettings, users } from "@is2u/db/schema";
import { relationshipLabel } from "@is2u/core/types";
import { signupSchema } from "@is2u/core/validation";
import {
  attachSessionCookies,
  createSession,
  deviceIdFrom,
  failedLoginCount,
  getSession,
  hashPassword,
  publicUser,
  requireAuthOrigin,
  revokeSession,
} from "../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../lib/http";

export const runtime = "nodejs";

export const POST = withApiErrors(async (request: Request) => {
  requireAuthOrigin(request);
  const input = signupSchema.parse(await readJson(request));
  const deviceId = deviceIdFrom(request);
  if (await failedLoginCount(request, deviceId, input.username) >= 5) throw new HttpError(429, "잠시 뒤 다시 시도해 주세요");
  const [duplicate] = await getDb().select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1);
  if (duplicate) throw new HttpError(409, "이미 사용 중인 아이디예요");
  const passwordHash = await hashPassword(input.password);
  let createdUser: { id: string; displayName: string; username: string | null; gender: typeof input.gender };
  try {
    createdUser = await getDb().transaction(async (tx) => {
      const [created] = await tx.insert(users).values({
        displayName: input.displayName,
        username: input.username,
        passwordHash,
        gender: input.gender,
        roleLabel: relationshipLabel(input.gender),
        credentialsActivatedAt: new Date(),
      }).returning({ id: users.id, displayName: users.displayName, username: users.username, gender: users.gender });
      await tx.insert(userSettings).values({ userId: created.id });
      return created;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new HttpError(409, "이미 사용 중인 아이디예요");
    throw error;
  }
  if (!createdUser.username) throw new Error("계정 생성 결과를 확인하지 못했습니다");
  const previous = await getSession(request);
  if (previous) await revokeSession(previous.sessionId);
  const created = await createSession(createdUser.id, deviceId);
  return attachSessionCookies(json({ user: publicUser({ ...createdUser, username: createdUser.username }), csrfToken: created.csrf }, 201), created, deviceId);
});
