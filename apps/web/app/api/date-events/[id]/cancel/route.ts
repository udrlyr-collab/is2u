import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, dateEvents } from "@is2u/db/schema";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../../lib/http";
import { cancelScheduledMission } from "../../../../../lib/scheduler";

type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  await cancelScheduledMission(id);
  const now = new Date();
  const [updated] = await getDb().update(dateEvents)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(and(eq(dateEvents.id, id), eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt)))
    .returning();
  if (!updated) throw new HttpError(404, "약속을 찾을 수 없어요");
  await getDb().insert(auditEvents).values({ actorId: session.user.id, action: "date_event.cancelled", entityType: "date_event", entityId: id });
  return json({ dateEvent: updated });
});
