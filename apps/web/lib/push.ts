import webpush from "web-push";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { pushSubscriptions } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";

export type PushDeliveryResult = { subscriptionCount: number; sentCount: number };

export async function sendUserNotificationWithResult(userId: string, payload: { title: string; body: string; url: string; missionId?: string; notificationKey?: string }): Promise<PushDeliveryResult> {
  const env = getServerEnv();
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const subscriptions = await getDb().select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.invalidatedAt)));
  const results = await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload));
      return true;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) await getDb().update(pushSubscriptions).set({ invalidatedAt: new Date(), updatedAt: new Date() }).where(eq(pushSubscriptions.id, subscription.id));
      return false;
    }
  }));
  return {
    subscriptionCount: subscriptions.length,
    sentCount: results.filter((result) => result.status === "fulfilled" && result.value).length,
  };
}

export async function sendUserNotification(userId: string, payload: { title: string; body: string; url: string; missionId?: string; notificationKey?: string }): Promise<number> {
  return (await sendUserNotificationWithResult(userId, payload)).sentCount;
}
