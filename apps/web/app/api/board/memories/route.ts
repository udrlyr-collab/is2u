import { requireSession } from "../../../../lib/auth";
import { loadMemorySummaries } from "../../../../lib/board";
import { json, withApiErrors } from "../../../../lib/http";

export const GET = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  return json({ memories: await loadMemorySummaries(session.user.id) });
});
