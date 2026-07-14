import { getServerEnv } from "@is2u/core/env";
import { CSRF_COOKIE, requireCsrf, requireSession, revokeSession, sessionCookieName } from "../../../../lib/auth";
import { cookie, json, withApiErrors } from "../../../../lib/http";

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  await revokeSession(session.sessionId);
  const secure = getServerEnv().NODE_ENV === "production";
  const response = json({ ok: true });
  response.headers.append("Set-Cookie", cookie(sessionCookieName(), "", { httpOnly: true, secure, maxAge: 0 }));
  response.headers.append("Set-Cookie", cookie(CSRF_COOKIE, "", { secure, maxAge: 0 }));
  return response;
});

