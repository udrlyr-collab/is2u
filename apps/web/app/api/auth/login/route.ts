import { eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { users } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { loginSchema } from "@is2u/core/validation";
import {
  createSession,
  CSRF_COOKIE,
  DEVICE_COOKIE,
  deviceCookieValue,
  deviceIdFrom,
  failedLoginCount,
  getSession,
  recordLoginAttempt,
  revokeSession,
  sessionCookieName,
  verifyPin,
} from "../../../../lib/auth";
import { cookie, json, readJson, withApiErrors } from "../../../../lib/http";

export const runtime = "nodejs";

function attachDeviceCookie(response: Response, deviceId: string): Response {
  const secure = getServerEnv().NODE_ENV === "production";
  response.headers.append("Set-Cookie", cookie(DEVICE_COOKIE, deviceCookieValue(deviceId), {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    maxAge: 365 * 24 * 60 * 60,
  }));
  return response;
}

export const POST = withApiErrors(async (request: Request) => {
  const input = loginSchema.parse(await readJson(request));
  const deviceId = deviceIdFrom(request);
  const failures = await failedLoginCount(request, deviceId);
  if (failures >= 5) {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    return attachDeviceCookie(json({ error: "PIN을 확인하거나 잠시 뒤 다시 시도해 주세요." }, 429), deviceId);
  }
  if (failures > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(2_000, failures * 300)));

  const userId = await verifyPin(input.pin);
  await recordLoginAttempt(request, deviceId, Boolean(userId));
  if (!userId) return attachDeviceCookie(json({ error: "PIN을 확인하거나 잠시 뒤 다시 시도해 주세요." }, 401), deviceId);

  const previous = await getSession(request);
  if (previous) await revokeSession(previous.sessionId);
  const created = await createSession(userId, deviceId);
  const [user] = await getDb().select({ id: users.id, displayName: users.displayName, roleLabel: users.roleLabel }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("고정 사용자 데이터가 없습니다.");

  const secure = getServerEnv().NODE_ENV === "production";
  const response = json({ user, csrfToken: created.csrf });
  response.headers.append("Set-Cookie", cookie(sessionCookieName(), created.token, { httpOnly: true, secure, sameSite: "Lax", maxAge: 30 * 24 * 60 * 60 }));
  response.headers.append("Set-Cookie", cookie(CSRF_COOKIE, created.csrf, { secure, sameSite: "Strict", maxAge: 30 * 24 * 60 * 60 }));
  return attachDeviceCookie(response, deviceId);
});
