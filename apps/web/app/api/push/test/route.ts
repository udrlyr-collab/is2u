import webpush from "web-push";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { pushSubscriptions } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { json, withApiErrors } from "../../../../lib/http";

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const env = getServerEnv();
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const subscriptions = await getDb().select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, session.user.id), isNull(pushSubscriptions.invalidatedAt)));
  await Promise.allSettled(subscriptions.map((subscription) => webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: "그대로 멈춰라", body: "알림이 조용히 잘 도착했어요.", url: "/settings" }))));
  return json({ sent: subscriptions.length });
});
