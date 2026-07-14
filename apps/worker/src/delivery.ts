import webpush from "web-push";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { dateEvents, missions, pushSubscriptions } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { getMissionTemplate, userFacingSentence } from "@is2u/core/types";
import { canDeliverActualMission } from "@is2u/core/missions";

export async function deliverMission(missionId: string): Promise<void> {
  const db = getDb();
  const [row] = await db.select({ mission: missions, event: dateEvents }).from(missions).innerJoin(dateEvents, eq(missions.dateEventId, dateEvents.id)).where(eq(missions.id, missionId)).limit(1);
  if (!row || row.mission.status !== "scheduled") return;
  const now = new Date();
  const actualMissionBlocked = row.mission.source === "automatic" && !canDeliverActualMission(row.event, now);
  if (actualMissionBlocked) {
    await db.update(missions).set({ status: "cancelled", updatedAt: now }).where(eq(missions.id, missionId));
    return;
  }
  const expiresAt = new Date(now.getTime() + 30 * 60_000);
  await db.transaction(async (tx) => {
    await tx.update(missions).set({ status: "sent", sentAt: now, expiresAt, updatedAt: now }).where(eq(missions.id, missionId));
  });

  const env = getServerEnv();
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const subscriptions = await db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, row.mission.recipientId), isNull(pushSubscriptions.invalidatedAt)));
  const copy = getMissionTemplate(row.mission.templateId, row.mission.type);
  const payload = JSON.stringify({ title: copy.title, body: userFacingSentence(copy.prompt), url: `/missions/${missionId}`, missionId });
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 1800, urgency: "normal" });
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) await db.update(pushSubscriptions).set({ invalidatedAt: new Date(), updatedAt: new Date() }).where(eq(pushSubscriptions.id, subscription.id));
      else console.error("push_delivery_failed", subscription.id, statusCode || "unknown");
    }
  }));
}
