import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, missions } from "@is2u/db/schema";
import { chooseMissionTemplate } from "@is2u/core/missions";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { json, withApiErrors } from "../../../../lib/http";
import { requireActiveCouple } from "../../../../lib/couples";

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const activeCouple = await requireActiveCouple(session.user.id);
  const db = getDb();
  const recent = await db.select({ templateId: missions.templateId }).from(missions)
    .where(and(eq(missions.coupleId, activeCouple.id), inArray(missions.status, ["sent", "completed", "skipped", "expired"])))
    .orderBy(desc(missions.sentAt)).limit(3);
  const template = chooseMissionTemplate(recent.map((item) => item.templateId).filter((id): id is string => Boolean(id)));
  const now = new Date();
  const [mission] = await db.insert(missions).values({
    coupleId: activeCouple.id,
    dateEventId: null,
    recipientId: session.user.id,
    type: template.type,
    templateId: template.id,
    scheduledAt: now,
    sentAt: now,
    expiresAt: new Date(now.getTime() + 30 * 60_000),
    status: "sent",
    isTest: false,
    source: "manual_random",
  }).returning();
  await db.insert(auditEvents).values({ actorId: session.user.id, action: "mission.manual_random_created", entityType: "mission", entityId: mission.id });
  return json({ mission }, 201);
});
