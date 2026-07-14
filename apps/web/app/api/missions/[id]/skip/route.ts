import { and, eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, missions } from "@is2u/db/schema";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../../lib/http";

type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const [mission] = await getDb().select().from(missions).where(and(eq(missions.id, id), eq(missions.recipientId, session.user.id))).limit(1);
  if (!mission) throw new HttpError(404, "미션을 찾을 수 없습니다.");
  if (mission.status === "sent") {
    await getDb().update(missions).set({ status: "skipped", updatedAt: new Date() }).where(eq(missions.id, id));
    await getDb().insert(auditEvents).values({ actorId: session.user.id, action: "mission.skipped", entityType: "mission", entityId: id });
  }
  return json({ ok: true });
});

