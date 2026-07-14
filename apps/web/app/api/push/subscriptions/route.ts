import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { pushSubscriptions, userSettings } from "@is2u/db/schema";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { json, readJson, withApiErrors } from "../../../../lib/http";

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = subscriptionSchema.parse(await readJson(request));
  const [subscription] = await getDb().insert(pushSubscriptions).values({
    userId: session.user.id,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
  }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: session.user.id, p256dh: input.keys.p256dh, auth: input.keys.auth, invalidatedAt: null, updatedAt: new Date() } }).returning();
  await getDb().update(userSettings).set({ notificationPermission: "granted", updatedAt: new Date() }).where(eq(userSettings.userId, session.user.id));
  return json({ subscription }, 201);
});

export const DELETE = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = z.object({ endpoint: z.url() }).parse(await readJson(request));
  await getDb().delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, session.user.id), eq(pushSubscriptions.endpoint, input.endpoint)));
  return json({ ok: true });
});

