import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, missions } from "@is2u/db/schema";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../../lib/http";
import { getBoss, QUEUES } from "../../../../../lib/queue";
import { requireActiveRecordCouple } from "../../../../../lib/couples";

type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const db = getDb();
  const [mission] = await db.select().from(missions).where(and(
    eq(missions.id, id),
    eq(missions.recipientId, session.user.id),
    isNull(missions.deletedAt),
  )).limit(1);
  if (!mission) throw new HttpError(404, "미션을 찾을 수 없어요");
  if (!(mission.isTest && mission.source === "admin_test")) {
    if (!mission.coupleId) throw new HttpError(409, "연결 정보를 확인할 수 없어요");
    await requireActiveRecordCouple(session.user.id, mission.coupleId);
  }
  if (mission.status !== "scheduled" && mission.status !== "sent") {
    throw new HttpError(409, "지금은 취소할 수 없는 미션이에요");
  }
  if (mission.jobId && mission.status === "scheduled") {
    await (await getBoss()).cancel(QUEUES.deliverMission, mission.jobId).catch(() => undefined);
  }
  const now = new Date();
  const [cancelled] = await db.update(missions).set({ status: "cancelled", updatedAt: now }).where(and(
    eq(missions.id, id),
    inArray(missions.status, ["scheduled", "sent"]),
    isNull(missions.deletedAt),
  )).returning();
  if (!cancelled) throw new HttpError(409, "미션 상태가 이미 바뀌었어요");
  await db.insert(auditEvents).values({ actorId: session.user.id, action: "mission.cancelled", entityType: "mission", entityId: id });
  return json({ mission: cancelled });
});
