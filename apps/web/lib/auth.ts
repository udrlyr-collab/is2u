import argon2 from "argon2";
import { and, count, eq, gt, gte, isNull, or } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { loginAttempts, sessions, users } from "@is2u/db/schema";
import { FIXED_USERS } from "@is2u/core/types";
import { getServerEnv } from "@is2u/core/env";
import { keyedHash, randomToken, sha256 } from "@is2u/core/crypto";
import { HttpError, parseCookies } from "./http";

export type AuthSession = {
  sessionId: string;
  csrfHash: string;
  user: { id: string; displayName: string; roleLabel: string };
};

export function sessionCookieName(): string {
  return getServerEnv().NODE_ENV === "production" ? "__Host-is2u_session" : "is2u_session";
}

export const CSRF_COOKIE = "is2u_csrf";
export const DEVICE_COOKIE = "is2u_device";

export function requestNetworkKey(request: Request): string {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function deviceIdFrom(request: Request): string {
  const value = parseCookies(request.headers.get("cookie"))[DEVICE_COOKIE];
  if (!value) return randomToken(18);
  const [id, signature] = value.split(".");
  if (!id || !signature || keyedHash(id, getServerEnv().RATE_LIMIT_SECRET) !== signature) return randomToken(18);
  return id;
}

export function deviceCookieValue(deviceId: string): string {
  return `${deviceId}.${keyedHash(deviceId, getServerEnv().RATE_LIMIT_SECRET)}`;
}

export async function failedLoginCount(request: Request, deviceId: string): Promise<number> {
  const env = getServerEnv();
  const ipHash = keyedHash(requestNetworkKey(request), env.RATE_LIMIT_SECRET);
  const deviceHash = keyedHash(deviceId, env.RATE_LIMIT_SECRET);
  const since = new Date(Date.now() - 15 * 60_000);
  const [row] = await getDb().select({ value: count() }).from(loginAttempts).where(and(
    or(eq(loginAttempts.ipHash, ipHash), eq(loginAttempts.deviceHash, deviceHash)), eq(loginAttempts.succeeded, false), gte(loginAttempts.createdAt, since),
  ));
  return Number(row?.value ?? 0);
}

export async function recordLoginAttempt(request: Request, deviceId: string, succeeded: boolean): Promise<void> {
  const env = getServerEnv();
  await getDb().insert(loginAttempts).values({
    ipHash: keyedHash(requestNetworkKey(request), env.RATE_LIMIT_SECRET),
    deviceHash: keyedHash(deviceId, env.RATE_LIMIT_SECRET),
    succeeded,
  });
}

export async function verifyPin(pin: string): Promise<string | null> {
  const env = getServerEnv();
  const seoyeongMatch = await argon2.verify(env.SEOYEONG_PIN_HASH, pin).catch(() => false);
  const seongminMatch = await argon2.verify(env.SEONGMIN_PIN_HASH, pin).catch(() => false);
  if (seoyeongMatch) return FIXED_USERS.seoyeong.id;
  if (seongminMatch) return FIXED_USERS.seongmin.id;
  return null;
}

export async function createSession(userId: string, deviceId: string): Promise<{ token: string; csrf: string; expiresAt: Date }> {
  const env = getServerEnv();
  const token = randomToken(32);
  const csrf = randomToken(24);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  await getDb().insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    csrfHash: sha256(csrf),
    deviceHash: keyedHash(deviceId, env.RATE_LIMIT_SECRET),
    expiresAt,
  });
  return { token, csrf, expiresAt };
}

export async function sessionFromToken(token: string | undefined): Promise<AuthSession | null> {
  if (!token) return null;
  const [row] = await getDb().select({
    sessionId: sessions.id,
    csrfHash: sessions.csrfHash,
    userId: users.id,
    displayName: users.displayName,
    roleLabel: users.roleLabel,
  }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(
    eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()),
  )).limit(1);
  if (!row) return null;
  return { sessionId: row.sessionId, csrfHash: row.csrfHash, user: { id: row.userId, displayName: row.displayName, roleLabel: row.roleLabel } };
}

export async function getSession(request: Request): Promise<AuthSession | null> {
  return sessionFromToken(parseCookies(request.headers.get("cookie"))[sessionCookieName()]);
}

export async function requireSession(request: Request): Promise<AuthSession> {
  const session = await getSession(request);
  if (!session) throw new HttpError(401, "로그인이 필요합니다.");
  return session;
}

export async function requireCsrf(request: Request, session: AuthSession): Promise<void> {
  const env = getServerEnv();
  const origin = request.headers.get("origin");
  if (origin !== new URL(env.APP_URL).origin) throw new HttpError(403, "요청 출처를 확인할 수 없습니다.");
  const csrf = request.headers.get("x-csrf-token");
  const cookieCsrf = parseCookies(request.headers.get("cookie"))[CSRF_COOKIE];
  if (!csrf || !cookieCsrf || csrf !== cookieCsrf || sha256(csrf) !== session.csrfHash) throw new HttpError(403, "보안 토큰이 만료됐습니다.");
}

export async function revokeSession(sessionId: string): Promise<void> {
  await getDb().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}
