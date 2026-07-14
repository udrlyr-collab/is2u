import { CSRF_COOKIE, getSession } from "../../../../lib/auth";
import { json, parseCookies, withApiErrors } from "../../../../lib/http";

export const GET = withApiErrors(async (request: Request) => {
  const session = await getSession(request);
  if (!session) return json({ authenticated: false }, 401);
  return json({ authenticated: true, user: session.user, csrfToken: parseCookies(request.headers.get("cookie"))[CSRF_COOKIE] ?? null });
});

