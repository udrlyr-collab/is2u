import { FIXED_USERS } from "@is2u/core/types";
import { getServerEnv } from "@is2u/core/env";
import { HttpError } from "./http";
import { requireSession, type AuthSession } from "./auth";

export function isMissionTestEnabledForUser(userId: string | null | undefined, enabled: string): boolean {
  return enabled === "true" && userId === FIXED_USERS.seongmin.id;
}

export async function requireMissionTestAdmin(request: Request): Promise<AuthSession> {
  const env = getServerEnv();
  if (env.ENABLE_MISSION_TEST_MODE !== "true") throw new HttpError(404, "찾을 수 없어요");
  const session = await requireSession(request);
  if (!isMissionTestEnabledForUser(session.user.id, env.ENABLE_MISSION_TEST_MODE)) throw new HttpError(403, "이 기능을 사용할 수 없어요");
  return session;
}
