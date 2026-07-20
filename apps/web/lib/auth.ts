import argon2 from "argon2";
import { and, count, eq, gt, gte, isNull, ne, or } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { loginAttempts, sessions, users } from "@is2u/db/schema";
import { relationshipLabel, type AccountStatus, type UserGender, type UserRole } from "@is2u/core/types";
import { getServerEnv } from "@is2u/core/env";
import { keyedHash, randomToken, sha256 } from "@is2u/core/crypto";
import { cookie, HttpError, parseCookies } from "./http";

export type AuthSession = {
  sessionId: string;
  csrfHash: string;
  user: { id: string; displayName: string; username: string; gender: UserGender; roleLabel: string; role: UserRole; accountStatus: AccountStatus };
};

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$3qwrdd3aWZirp8fidSLz8Q$USrZWHneAC4MTfdSUP9yzCBf9sjU6f8uFS0BWWhoQbQ";

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

function identifierHash(identifier: string | undefined): string | undefined {
  return identifier ? keyedHash(identifier, getServerEnv().RATE_LIMIT_SECRET) : undefined;
}

export async function failedLoginCount(request: Request, deviceId: string, identifier?: string): Promise<number> {
  const env = getServerEnv();
  const ipHash = keyedHash(requestNetworkKey(request), env.RATE_LIMIT_SECRET);
  const deviceHash = keyedHash(deviceId, env.RATE_LIMIT_SECRET);
  const since = new Date(Date.now() - 15 * 60_000);
  const [row] = await getDb().select({ value: count() }).from(loginAttempts).where(and(
    or(
      eq(loginAttempts.ipHash, ipHash),
      eq(loginAttempts.deviceHash, deviceHash),
      ...(identifier ? [eq(loginAttempts.identifierHash, identifierHash(identifier)!)] : []),
    ),
    eq(loginAttempts.succeeded, false),
    gte(loginAttempts.createdAt, since),
  ));
  return Number(row?.value ?? 0);
}

export async function recordLoginAttempt(request: Request, deviceId: string, succeeded: boolean, identifier?: string): Promise<void> {
  const env = getServerEnv();
  await getDb().insert(loginAttempts).values({
    ipHash: keyedHash(requestNetworkKey(request), env.RATE_LIMIT_SECRET),
    deviceHash: keyedHash(deviceId, env.RATE_LIMIT_SECRET),
    identifierHash: identifierHash(identifier),
    succeeded,
  });
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string | null | undefined, password: string): Promise<boolean> {
  return argon2.verify(hash ?? DUMMY_PASSWORD_HASH, password).catch(() => false);
}

export function requireAuthOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin !== new URL(getServerEnv().APP_URL).origin) throw new HttpError(403, "요청 출처를 확인할 수 없어요");
}

export function publicUser(user: { id: string; displayName: string; username: string; gender: UserGender; role?: UserRole; accountStatus?: AccountStatus }) {
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    gender: user.gender,
    role: user.role ?? "user",
    accountStatus: user.accountStatus ?? "active",
    roleLabel: relationshipLabel(user.gender),
  };
}

export function attachSessionCookies(response: Response, created: { token: string; csrf: string; expiresAt: Date }, deviceId: string): Response {
  const secure = getServerEnv().NODE_ENV === "production";
  response.headers.append("Set-Cookie", cookie(sessionCookieName(), created.token, { httpOnly: true, secure, sameSite: "Lax", maxAge: 30 * 24 * 60 * 60 }));
  response.headers.append("Set-Cookie", cookie(CSRF_COOKIE, created.csrf, { secure, sameSite: "Strict", maxAge: 30 * 24 * 60 * 60 }));
  attachDeviceCookie(response, deviceId);
  return response;
}

export function attachDeviceCookie(response: Response, deviceId: string): Response {
  const secure = getServerEnv().NODE_ENV === "production";
  response.headers.append("Set-Cookie", cookie(DEVICE_COOKIE, deviceCookieValue(deviceId), { httpOnly: true, secure, sameSite: "Lax", maxAge: 365 * 24 * 60 * 60 }));
  return response;
}

export async function revokeUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await getDb().update(sessions).set({ revokedAt: new Date() }).where(and(
    eq(sessions.userId, userId),
    isNull(sessions.revokedAt),
    ...(exceptSessionId ? [ne(sessions.id, exceptSessionId)] : []),
  ));
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
    username: users.username,
    gender: users.gender,
    role: users.role,
    accountStatus: users.accountStatus,
  }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(
    eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()),
  )).limit(1);
  if (!row?.username || row.accountStatus !== "active") return null;
  return { sessionId: row.sessionId, csrfHash: row.csrfHash, user: publicUser({ id: row.userId, displayName: row.displayName, username: row.username, gender: row.gender, role: row.role, accountStatus: row.accountStatus }) };
}

export async function getSession(request: Request): Promise<AuthSession | null> {
  return sessionFromToken(parseCookies(request.headers.get("cookie"))[sessionCookieName()]);
}

export async function requireSession(request: Request): Promise<AuthSession> {
  const session = await getSession(request);
  if (!session) throw new HttpError(401, "로그인이 필요해요");
  return session;
}

export async function requireCsrf(request: Request, session: AuthSession): Promise<void> {
  const env = getServerEnv();
  const origin = request.headers.get("origin");
  if (origin !== new URL(env.APP_URL).origin) throw new HttpError(403, "요청 출처를 확인할 수 없어요");
  const csrf = request.headers.get("x-csrf-token");
  const cookieCsrf = parseCookies(request.headers.get("cookie"))[CSRF_COOKIE];
  if (!csrf || !cookieCsrf || csrf !== cookieCsrf || sha256(csrf) !== session.csrfHash) throw new HttpError(403, "보안 토큰이 만료됐어요");
}

export async function revokeSession(sessionId: string): Promise<void> {
  await getDb().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}
